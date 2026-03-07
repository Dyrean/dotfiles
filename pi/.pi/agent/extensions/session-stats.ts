import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import { ansiBold, ansiColor } from "../prelude/ui/ansi.js";
import { borderLine, contentLine, emptyLine } from "../prelude/ui/box.js";
import { centerAnsiText } from "../prelude/ui/layout.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { getHomeDir } from "../prelude/environment.js";
import { openManagedOverlay } from "../prelude/ui/overlay-manager.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UsageAccum {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

interface SessionStats {
  usage: UsageAccum;
  turns: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  filesRead: Set<string>;
  filesWritten: Set<string>;
  filesEdited: Set<string>;
  sessionStartTime: number;
  firstMessageTime: number | null;
  lastMessageTime: number | null;
  isGlobal?: boolean;
  sessionCount?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function createStats(): SessionStats {
  return {
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    turns: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    filesRead: new Set(),
    filesWritten: new Set(),
    filesEdited: new Set(),
    sessionStartTime: Date.now(),
    firstMessageTime: null,
    lastMessageTime: null,
  };
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1_000_000)}M`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Walk the session branch and extract all stats from stored entries.
 */
function collectStatsFromBranch(branch: SessionEntry[]): SessionStats {
  const stats = createStats();

  for (const entry of branch) {
    if (entry.type !== "message") continue;

    const msg = entry.message;
    const ts = (msg as any).timestamp as number | undefined;

    if (ts) {
      if (!stats.firstMessageTime) stats.firstMessageTime = ts;
      stats.lastMessageTime = ts;
    }

    switch (msg.role) {
      case "user":
        stats.userMessages++;
        break;

      case "assistant": {
        stats.assistantMessages++;

        const usage = (msg as any).usage;
        if (usage) {
          stats.usage.input += usage.input ?? 0;
          stats.usage.output += usage.output ?? 0;
          stats.usage.cacheRead += usage.cacheRead ?? 0;
          stats.usage.cacheWrite += usage.cacheWrite ?? 0;
          stats.usage.cost += usage.cost?.total ?? 0;
        }

        const content = msg.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part && typeof part === "object" && (part as any).type === "toolCall") {
              stats.toolCalls++;
            }
          }
        }
        break;
      }

      case "toolResult": {
        const toolName = (msg as any).toolName as string | undefined;
        const input = (msg as any).input;

        if (toolName === "read" && input?.path) {
          stats.filesRead.add(String(input.path));
        } else if (toolName === "write" && input?.path) {
          stats.filesWritten.add(String(input.path));
        } else if (toolName === "edit" && input?.path) {
          stats.filesEdited.add(String(input.path));
        }
        break;
      }
    }
  }

  stats.turns = stats.userMessages;
  return stats;
}

function collectGlobalStats(): SessionStats {
  const globalStats = createStats();
  globalStats.isGlobal = true;
  globalStats.sessionCount = 0;

  const homeDir = getHomeDir();
  const sessionsDir = path.join(homeDir, ".pi", "agent", "sessions");

  if (!fs.existsSync(sessionsDir)) return globalStats;

  const projectDirs = fs.readdirSync(sessionsDir);
  for (const projectDir of projectDirs) {
    const projectPath = path.join(sessionsDir, projectDir);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    const sessionFiles = fs.readdirSync(projectPath).filter(f => f.endsWith(".jsonl"));
    for (const file of sessionFiles) {
      globalStats.sessionCount!++;
      const filePath = path.join(projectPath, file);
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === "message" && entry.message?.role === "assistant") {
            const usage = entry.message.usage;
            if (usage) {
              globalStats.usage.input += usage.input ?? 0;
              globalStats.usage.output += usage.output ?? 0;
              globalStats.usage.cacheRead += usage.cacheRead ?? 0;
              globalStats.usage.cacheWrite += usage.cacheWrite ?? 0;
              globalStats.usage.cost += usage.cost?.total ?? 0;
            }
            globalStats.assistantMessages++;
          } else if (entry.type === "message" && entry.message?.role === "user") {
            globalStats.userMessages++;
          }
        } catch { /* skip invalid json */ }
      }
    }
  }

  globalStats.turns = globalStats.userMessages;
  return globalStats;
}

// ── UI Component ───────────────────────────────────────────────────────────────

const ACCENT = 36;
const LABEL = 37;
const VALUE = 97;
const HEADING = 33;
const SUCCESS = 32;
const MUTED = 37;

const label = (s: string) => ansiColor(s, LABEL);
const value = (s: string) => ansiBold(ansiColor(s, VALUE));
const heading = (s: string) => ansiBold(ansiColor(s, HEADING));
const accent = (s: string) => ansiColor(s, ACCENT);
const muted = (s: string) => ansiColor(s, MUTED);
const success = (s: string) => ansiColor(s, SUCCESS);

class StatsPanel implements Component {
  private stats: SessionStats;
  private onDone: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(stats: SessionStats, onDone: () => void) {
    this.stats = stats;
    this.onDone = onDone;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "q")) {
      this.onDone();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const s = this.stats;
    const boxWidth = Math.min(width, 72);
    const border = (t: string) => accent(t);
    const boxLines: string[] = [];

    boxLines.push(borderLine(boxWidth, "╭", "╮", border));
    const titleText = s.isGlobal ? "  Global Usage Statistics" : "  Session Statistics";
    boxLines.push(contentLine(heading(titleText), boxWidth, border, 0));
    boxLines.push(borderLine(boxWidth, "├", "┤", border));

    boxLines.push(emptyLine(boxWidth, border));

    if (s.isGlobal) {
      boxLines.push(contentLine(
        `${label("Total sessions")}    ${value(String(s.sessionCount))}`,
        boxWidth, border,
      ));
    } else {
      const elapsed = Date.now() - s.sessionStartTime;
      boxLines.push(contentLine(
        `${label("Session duration")}  ${value(formatDuration(elapsed))}`,
        boxWidth, border,
      ));
    }

    boxLines.push(borderLine(boxWidth, "├", "┤", border, "╌"));
    boxLines.push(emptyLine(boxWidth, border));

    boxLines.push(contentLine(
      `${label("Total turns")}       ${value(String(s.turns))}`,
      boxWidth, border,
    ));
    boxLines.push(contentLine(
      `${label("Assistant msgs")}    ${value(String(s.assistantMessages))}`,
      boxWidth, border,
    ));

    boxLines.push(borderLine(boxWidth, "├", "┤", border, "╌"));
    boxLines.push(emptyLine(boxWidth, border));

    const u = s.usage;
    const totalTokens = u.input + u.output;
    const totalWithCache = totalTokens + u.cacheRead + u.cacheWrite;

    boxLines.push(contentLine(
      `${label("Input tokens")}      ${value(formatTokens(u.input))}`,
      boxWidth, border,
    ));
    boxLines.push(contentLine(
      `${label("Output tokens")}     ${value(formatTokens(u.output))}`,
      boxWidth, border,
    ));

    if (u.cacheRead > 0 || u.cacheWrite > 0) {
      boxLines.push(contentLine(
        `${label("Cache read")}        ${value(formatTokens(u.cacheRead))}`,
        boxWidth, border,
      ));
    }

    boxLines.push(contentLine(
      `${label("Total tokens")}      ${value(formatTokens(totalWithCache))}`,
      boxWidth, border,
    ));

    if (u.cost > 0) {
      boxLines.push(contentLine(
        `${label("Estimated cost")}    ${value(formatCost(u.cost))}`,
        boxWidth, border,
      ));
    }

    if (!s.isGlobal) {
      const allModified = new Set([...s.filesWritten, ...s.filesEdited]);
      if (allModified.size > 0) {
        boxLines.push(borderLine(boxWidth, "├", "┤", border, "╌"));
        boxLines.push(emptyLine(boxWidth, border));
        boxLines.push(contentLine(
          `${label("Files modified")}    ${value(String(allModified.size))}`,
          boxWidth, border,
        ));
      }
    }

    boxLines.push(emptyLine(boxWidth, border));
    boxLines.push(contentLine(
      muted("Press Esc, Enter, or q to close"),
      boxWidth, border,
    ));
    boxLines.push(borderLine(boxWidth, "╰", "╯", border));

    const finalLines: string[] = ["", ""];
    for (const line of boxLines) {
      finalLines.push(centerAnsiText(line, width));
    }
    finalLines.push("");

    this.cachedWidth = width;
    this.cachedLines = finalLines;
    return finalLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ── Extension Entry Point ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let sessionStartTime = Date.now();

  pi.on("session_start", async () => {
    sessionStartTime = Date.now();
  });

  pi.on("session_switch", async () => {
    sessionStartTime = Date.now();
  });

  pi.registerCommand("stats", {
    description: "Show session statistics (tokens, turns, cost, files). Use --global for all-time stats.",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/stats requires interactive mode", "error");
        return;
      }

      let stats: SessionStats;
      if (args.includes("--global")) {
        stats = collectGlobalStats();
      } else {
        const branch = ctx.sessionManager.getBranch();
        stats = collectStatsFromBranch(branch);
        stats.sessionStartTime = sessionStartTime;
      }

			await openManagedOverlay<void>(ctx.ui, { id: "session-stats" }, (_tui, _theme, _kb, done) => {
				return new StatsPanel(stats, () => done());
			});
    },
  });
}
