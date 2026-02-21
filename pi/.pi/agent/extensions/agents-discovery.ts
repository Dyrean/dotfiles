/**
 * Agents Discovery Extension
 *
 * Auto-discovers AGENTS.md files in subdirectories when the agent reads files.
 * Pi's built-in discovery only walks up from cwd to project root. This extension
 * fills the gap by injecting AGENTS.md files found between cwd and the directory
 * of any file being read — giving the LLM subdirectory-specific context
 * automatically.
 *
 * Inspired by: https://github.com/aliou/pi-extensions/blob/main/extensions/defaults/hooks/agents-discovery.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// AgentsDiscoveryManager
// ---------------------------------------------------------------------------

const AGENTS_FILENAME = "AGENTS.md";

interface DiscoveredFile {
  path: string;
  content: string;
}

class AgentsDiscoveryManager {
  private loadedAgents = new Set<string>();
  private currentCwd = "";
  private cwdAgentsPath = "";
  private homeDir = "";

  /** Paths to ignore (directories or specific AGENTS.md files). */
  private ignorePaths: string[];

  constructor(ignorePaths: string[] = []) {
    this.ignorePaths = ignorePaths;
  }

  /** Re-initialise on session start / switch. */
  resetSession(cwd: string) {
    this.currentCwd = this.resolvePath(cwd, process.cwd());
    this.cwdAgentsPath = path.join(this.currentCwd, AGENTS_FILENAME);
    this.homeDir = this.resolvePath(os.homedir(), process.cwd());
    this.loadedAgents.clear();

    // Mark cwd AGENTS.md as already loaded (Pi puts it in system prompt)
    if (fs.existsSync(this.cwdAgentsPath)) {
      this.loadedAgents.add(this.resolvePath(this.cwdAgentsPath, this.currentCwd));
    } else {
      this.loadedAgents.add(this.cwdAgentsPath);
    }

    // Mark global ~/.pi/agent/AGENTS.md as loaded
    const globalAgentsPath = path.join(this.homeDir, ".pi", "agent", AGENTS_FILENAME);
    if (fs.existsSync(globalAgentsPath)) {
      this.loadedAgents.add(this.resolvePath(globalAgentsPath, this.currentCwd));
    }

    // Mark ancestor AGENTS.md files as loaded (Pi walks up from cwd)
    let dir = path.dirname(this.currentCwd);
    while (dir !== path.dirname(dir)) {
      const ancestorPath = path.join(dir, AGENTS_FILENAME);
      if (fs.existsSync(ancestorPath)) {
        this.loadedAgents.add(this.resolvePath(ancestorPath, this.currentCwd));
      }
      dir = path.dirname(dir);
    }
  }

  /**
   * Discover AGENTS.md files relevant to `filePath`.
   * Returns newly-discovered files or null when nothing new is found.
   */
  async discover(filePath: string): Promise<DiscoveredFile[] | null> {
    const absolutePath = this.resolvePath(filePath, this.currentCwd);

    if (this.shouldIgnorePath(absolutePath)) return null;

    // Determine search root — must be inside cwd or home
    const searchRoot = this.isInsideRoot(this.currentCwd, absolutePath)
      ? this.currentCwd
      : this.isInsideRoot(this.homeDir, absolutePath)
        ? this.homeDir
        : "";

    if (!searchRoot) return null;

    // If the agent is reading an AGENTS.md directly, mark it loaded & skip
    if (path.basename(absolutePath) === AGENTS_FILENAME) {
      this.loadedAgents.add(path.normalize(absolutePath));
      return null;
    }

    const candidates = this.findAgentsFiles(absolutePath, searchRoot);
    const discovered: DiscoveredFile[] = [];

    for (const agentsPath of candidates) {
      const resolved = this.resolvePath(agentsPath, this.currentCwd);
      if (this.loadedAgents.has(resolved)) continue;
      if (this.shouldIgnorePath(resolved)) continue;

      const content = await fs.promises.readFile(agentsPath, "utf-8");
      this.loadedAgents.add(resolved);
      discovered.push({ path: agentsPath, content });
    }

    return discovered.length > 0 ? discovered : null;
  }

  get isInitialized(): boolean {
    return this.currentCwd !== "";
  }

  /** Pretty-print a path (relative to cwd, or ~/...). */
  prettyPath(filePath: string): string {
    if (this.isInsideRoot(this.currentCwd, filePath)) {
      return path.relative(this.currentCwd, filePath);
    }
    if (this.homeDir && filePath.startsWith(this.homeDir + path.sep)) {
      return `~${filePath.slice(this.homeDir.length)}`;
    }
    return filePath;
  }

  // -- helpers --------------------------------------------------------------

  private resolvePath(targetPath: string, baseDir: string): string {
    const expanded =
      targetPath === "~"
        ? this.homeDir || os.homedir()
        : targetPath.startsWith("~/")
          ? path.join(this.homeDir || os.homedir(), targetPath.slice(2))
          : targetPath;

    const absolute = path.isAbsolute(expanded)
      ? path.normalize(expanded)
      : path.resolve(baseDir, expanded);

    try {
      return fs.realpathSync.native?.(absolute) ?? fs.realpathSync(absolute);
    } catch {
      return absolute;
    }
  }

  private isInsideRoot(rootDir: string, targetPath: string): boolean {
    if (!rootDir) return false;
    const relative = path.relative(rootDir, targetPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }

  /** Walk from filePath's directory up to rootDir, collecting AGENTS.md paths. */
  private findAgentsFiles(filePath: string, rootDir: string): string[] {
    if (!rootDir) return [];

    const agentsFiles: string[] = [];
    let dir = path.dirname(filePath);

    while (this.isInsideRoot(rootDir, dir)) {
      const candidate = path.join(dir, AGENTS_FILENAME);
      // Skip the cwd-level AGENTS.md — Pi already has it
      if (candidate !== this.cwdAgentsPath && fs.existsSync(candidate)) {
        agentsFiles.push(candidate);
      }

      if (dir === rootDir) break;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    // Return root-first order
    return agentsFiles.reverse();
  }

  private shouldIgnorePath(targetPath: string): boolean {
    if (this.ignorePaths.length === 0) return false;

    for (const rawPath of this.ignorePaths) {
      const trimmed = rawPath.trim();
      if (!trimmed) continue;

      const resolved = this.resolvePath(trimmed, this.currentCwd);
      const isAgentsFile = path.basename(resolved) === AGENTS_FILENAME;

      if (isAgentsFile) {
        if (targetPath === resolved) return true;
        continue;
      }

      // Directory-style ignore: skip any AGENTS.md at or under this path
      if (
        this.isInsideRoot(resolved, targetPath) &&
        path.basename(targetPath) === AGENTS_FILENAME
      ) {
        return true;
      }
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

type TextContent = { type: "text"; text: string };

export default function (pi: ExtensionAPI) {
  // Optionally specify paths to ignore — edit this array as needed
  const ignorePaths: string[] = [
    // "node_modules",
    // ".git",
  ];

  const manager = new AgentsDiscoveryManager(ignorePaths);

  // Reset discovery state on session start / switch
  const handleSessionChange = (_event: unknown, ctx: ExtensionContext) => {
    manager.resetSession(ctx.cwd);
  };

  pi.on("session_start", handleSessionChange);
  pi.on("session_switch", handleSessionChange);

  pi.on("session_shutdown", () => {
    manager.resetSession("");
  });

  // After a `read` tool result, check for new AGENTS.md files
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "read" || event.isError) return undefined;

    const pathInput = event.input.path as string | undefined;
    if (!pathInput) return undefined;

    // Lazy init (in case session_start fired before extension was loaded)
    if (!manager.isInitialized) manager.resetSession(ctx.cwd);

    let discovered: DiscoveredFile[] | null;
    try {
      discovered = await manager.discover(pathInput);
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `agents-discovery: failed to load subdirectory context: ${String(error)}`,
          "warning",
        );
      }
      return undefined;
    }

    if (!discovered) return undefined;

    const prettyPaths = discovered.map((f) => manager.prettyPath(f.path));

    // Emit discovery event for other extensions (like status bars or notifications)
    pi.events.emit("discovery:agents-loaded", {
      paths: prettyPaths,
      count: discovered.length,
      timestamp: Date.now(),
    });

    // Append discovered AGENTS.md content to the read result
    const additions: TextContent[] = discovered.map((file, i) => ({
      type: "text",
      text: `Loaded subdirectory context from ${prettyPaths[i]}\n\n${file.content}`,
    }));

    if (ctx.hasUI) {
      ctx.ui.notify(
        `Loaded subdirectory context: ${prettyPaths.join(", ")}`,
        "info",
      );
    }

    const baseContent = event.content ?? [];
    return { content: [...baseContent, ...additions], details: event.details };
  });

  // Register a command to show what's been loaded so far
  pi.registerCommand("discovered-agents", {
    description: "Show discovered AGENTS.md files this session",
    handler: async (_args, ctx) => {
      if (!manager.isInitialized) {
        ctx.ui.notify("No session initialised yet.", "warning");
        return;
      }

      // Access the loaded set via a small trick — we re-discover nothing
      // but we can display what we know.  For a real status, we expose the set.
      ctx.ui.notify(
        "AGENTS.md discovery is active. Files are auto-injected on `read`.",
        "info",
      );
    },
  });
}
