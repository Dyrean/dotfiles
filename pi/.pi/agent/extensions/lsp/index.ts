import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { LspPanelComponent } from "./lsp-panel.js";
import { LspRuntime } from "./runtime.js";
import { registerLspTool } from "./tool.js";
import { registerLspHooks } from "./hooks.js";
import type { LspPanelSnapshot } from "./types.js";

export function summarizeSnapshot(snapshot: LspPanelSnapshot): string {
  const lines: string[] = [];
  lines.push("LSP status");
  lines.push(
    `configured=${snapshot.totals.configured}, connected=${snapshot.totals.connected}, spawning=${snapshot.totals.spawning}, broken=${snapshot.totals.broken}, disabled=${snapshot.totals.disabled}`,
  );

  const problematicRows = snapshot.rows
    .filter((row) => row.broken || row.spawningRoots.length > 0 || row.disabled)
    .slice(0, 5);

  if (problematicRows.length > 0) {
    lines.push("Top issues:");
    for (const row of problematicRows) {
      const status = row.disabled
        ? "disabled"
        : row.broken
          ? `broken (attempts=${row.broken.attempts})`
          : row.spawningRoots.length > 0
            ? "spawning"
            : "ok";
      lines.push(`- ${row.serverId}: ${status}`);
    }
  }

  if (snapshot.rows.length === 0) {
    lines.push("No servers configured.");
  }

  return lines.join("\n");
}

export default function lspExtension(pi: ExtensionAPI) {
  const runtime = new LspRuntime(process.cwd(), (message) => {
    console.warn(message);
  });

  const activeCleanups = new Set<() => void>();

  const registerCleanup = (cleanup: () => void) => {
    activeCleanups.add(cleanup);
    return () => {
      cleanup();
      activeCleanups.delete(cleanup);
    };
  };

  registerLspTool(pi, runtime);
  registerLspHooks(pi, runtime);

  // Expose breadcrumbs helper via events
  pi.events.on("lsp:get-breadcrumbs", async (data: { filePath: string; line: number; character: number }, callback: (breadcrumbs: string) => void) => {
    try {
      const summary = await runtime.run(data.filePath, async (client) => {
        return await client.request("textDocument/documentSymbol", {
          textDocument: { uri: `file://${data.filePath}` },
        });
      });

      const symbols = (summary.outcomes.find(o => o.ok)?.value as any[]) || [];
      const line = data.line - 1; // Convert to 0-based for LSP

      function findPath(nodes: any[], targetLine: number): string[] {
        for (const node of nodes) {
          const range = node.range || node.location?.range;
          if (range && targetLine >= range.start.line && targetLine <= range.end.line) {
            const childPath = findPath(node.children || [], targetLine);
            return [node.name, ...childPath];
          }
        }
        return [];
      }

      const path = findPath(symbols, line);
      callback(path.join(" > "));
    } catch {
      callback("");
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    runtime.setCwd(ctx.cwd);
    console.log("[lsp-extension] startup");
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    console.log("[lsp-extension] shutdown");

    for (const cleanup of [...activeCleanups]) {
      cleanup();
      activeCleanups.delete(cleanup);
    }

    await runtime.shutdownAll();
  });

  pi.registerCommand("lsp", {
    description: "Show LSP runtime status panel",
    handler: async (_args, ctx) => {
      runtime.setCwd(ctx.cwd);
      const snapshot = runtime.getLspPanelSnapshot();

      if (!ctx.hasUI) {
        pi.sendMessage({
          customType: "lsp-status",
          content: summarizeSnapshot(snapshot),
          display: true,
        });
        return;
      }

      await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
        let closed = false;

        const close = () => {
          if (closed) return;
          closed = true;
          done(undefined);
        };

        const panel = new LspPanelComponent(tui, snapshot, {
          onClose: close,
          onRefresh: async () => {
            runtime.setCwd(ctx.cwd);
            return runtime.getLspPanelSnapshot();
          },
        });

        const timer = setInterval(() => {
          if (closed) return;
          panel.updateSnapshot(runtime.getLspPanelSnapshot());
          tui.requestRender();
        }, 1000);

        const unregisterCleanup = registerCleanup(() => {
          clearInterval(timer);
          closed = true;
        });

        return {
          render(width) {
            return panel.render(width);
          },
          handleInput(data) {
            panel.handleInput?.(data);
          },
          invalidate() {
            panel.invalidate();
          },
          dispose() {
            unregisterCleanup();
          },
        };
      }, {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: 82,
          minWidth: 40,
          maxHeight: "80%",
          margin: 1,
        },
      });
    },
  });
}
