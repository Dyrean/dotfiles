/**
 * Session Stats Extension
 *
 * Provides a `/stats` command that displays a detailed overview of the current
 * session: token usage, cost, turns, time spent, and files modified.
 *
 * Data is collected from two sources:
 *   1. Session branch entries (persistent — survives restart)
 *   2. Live event counters (turn_start, tool_result, etc.)
 *
 * The stats panel renders as a bordered TUI overlay, dismissed with Esc/Enter.
 */

import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import { ansiBold, ansiColor } from "../prelude/ui/ansi.js";
import { borderLine, contentLine, emptyLine } from "../prelude/ui/box.js";
import { centerAnsiText } from "../prelude/ui/layout.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UsageAccum {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

interface SessionStats {
  // Tokens
  usage: UsageAccum;

  // Turns & messages
  turns: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;

  // Files
  filesRead: Set<string>;
  filesWritten: Set<string>;
  filesEdited: Set<string>;

  // Timing
  sessionStartTime: number;
  firstMessageTime: number | null;
  lastMessageTime: number | null;
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
 * This is the source of truth — it works even after restart.
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

        // Count tool calls in assistant content
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

  // Turns ≈ user messages (each user message triggers a turn)
  stats.turns = stats.userMessages;

  return stats;
}

// ── UI Component ───────────────────────────────────────────────────────────────

const ACCENT = 36;   // cyan
const LABEL = 37;    // white
const VALUE = 97;    // bright white
const HEADING = 33;  // yellow
const SUCCESS = 32;  // green
const MUTED = 37;    // white

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
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "enter") ||
      matchesKey(data, "q")
    ) {
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

    // ── Header ───────────────────────────────────────────────────────────────
    boxLines.push(borderLine(boxWidth, "╭", "╮", border));
    boxLines.push(contentLine(heading("  Session Statistics"), boxWidth, border, 0));
    boxLines.push(borderLine(boxWidth, "├", "┤", border));

    // ── Timing ───────────────────────────────────────────────────────────────
    boxLines.push(emptyLine(boxWidth, border));

    const elapsed = Date.now() - s.sessionStartTime;
    const activeTime = (s.firstMessageTime && s.lastMessageTime)
      ? s.lastMessageTime - s.firstMessageTime
      : 0;

    boxLines.push(contentLine(
      `${label("Session duration")}  ${value(formatDuration(elapsed))}`,
      boxWidth, border,
    ));

    if (activeTime > 0) {
      boxLines.push(contentLine(
        `${label("Active span")}       ${value(formatDuration(activeTime))}`,
        boxWidth, border,
      ));
    }

    // ── Conversation ─────────────────────────────────────────────────────────
    boxLines.push(borderLine(boxWidth, "├", "┤", border, "╌"));
    boxLines.push(emptyLine(boxWidth, border));

    boxLines.push(contentLine(
      `${label("Turns")}             ${value(String(s.turns))}`,
      boxWidth, border,
    ));
    boxLines.push(contentLine(
      `${label("User messages")}     ${value(String(s.userMessages))}`,
      boxWidth, border,
    ));
    boxLines.push(contentLine(
      `${label("Assistant msgs")}    ${value(String(s.assistantMessages))}`,
      boxWidth, border,
    ));
    boxLines.push(contentLine(
      `${label("Tool calls")}        ${value(String(s.toolCalls))}`,
      boxWidth, border,
    ));

    // ── Tokens ───────────────────────────────────────────────────────────────
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
      boxLines.push(contentLine(
        `${label("Cache write")}       ${value(formatTokens(u.cacheWrite))}`,
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

    // ── Files ────────────────────────────────────────────────────────────────
    const allModified = new Set([...s.filesWritten, ...s.filesEdited]);
    const readOnly = new Set([...s.filesRead].filter(f => !allModified.has(f)));

    if (allModified.size > 0 || readOnly.size > 0) {
      boxLines.push(borderLine(boxWidth, "├", "┤", border, "╌"));
      boxLines.push(emptyLine(boxWidth, border));

      boxLines.push(contentLine(
        `${label("Files modified")}    ${value(String(allModified.size))}` +
        `    ${label("Files read")}  ${value(String(readOnly.size))}`,
        boxWidth, border,
      ));

      // List modified files (up to 12)
      if (allModified.size > 0) {
        boxLines.push(emptyLine(boxWidth, border));
        const sorted = [...allModified].sort();
        const shown = sorted.slice(0, 12);

        for (const file of shown) {
          const op = s.filesWritten.has(file) ? success("W") : accent("E");
          // Shorten path for display
          const maxPathLen = boxWidth - 12;
          let displayPath = file;
          if (displayPath.length > maxPathLen) {
            displayPath = "…" + displayPath.slice(-(maxPathLen - 1));
          }
          boxLines.push(contentLine(
            `  ${op} ${muted(displayPath)}`,
            boxWidth, border,
          ));
        }

        if (sorted.length > 12) {
          boxLines.push(contentLine(
            `  ${muted(`… and ${sorted.length - 12} more`)}`,
            boxWidth, border,
          ));
        }
      }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    boxLines.push(emptyLine(boxWidth, border));
    boxLines.push(contentLine(
      muted("Press Esc, Enter, or q to close"),
      boxWidth, border,
    ));
    boxLines.push(borderLine(boxWidth, "╰", "╯", border));

    // Center the entire box
    const finalLines: string[] = ["", ""]; // Top padding
    for (const line of boxLines) {
      finalLines.push(centerAnsiText(line, width));
    }
    finalLines.push(""); // Bottom padding

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

  // Track session start time
  pi.on("session_start", async () => {
    sessionStartTime = Date.now();
  });

  pi.on("session_switch", async () => {
    sessionStartTime = Date.now();
  });

  pi.registerCommand("stats", {
    description: "Show session statistics (tokens, turns, cost, files)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/stats requires interactive mode", "error");
        return;
      }

      // Collect stats from session history
      const branch = ctx.sessionManager.getBranch();
      const stats = collectStatsFromBranch(branch);
      stats.sessionStartTime = sessionStartTime;

      await ctx.ui.custom<void>(
        (_tui, _theme, _kb, done) => {
          return new StatsPanel(stats, () => done());
        },
        { overlay: true },
      );
    },
  });
}
