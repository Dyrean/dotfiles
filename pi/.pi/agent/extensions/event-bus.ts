/**
 * Global Event Bus & Status Manager
 *
 * This extension acts as a central hub for inter-extension communication.
 * It maintains a global state by listening to events from other extensions
 * and updates the UI (footer status) accordingly.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

interface GlobalState {
  discoveredAgents: string[];
  lastNotification?: { title: string; message: string; timestamp: number };
  lspStatus: "starting" | "ready" | "error" | "off";
}

export default function (pi: ExtensionAPI) {
  const state: GlobalState = {
    discoveredAgents: [],
    lspStatus: "off",
  };

  let currentCtx: ExtensionContext | undefined;

  const updateStatus = () => {
    if (!currentCtx) return;

    // Update the footer status line for this extension
    const agentCount = state.discoveredAgents.length;
    const agentStatus = agentCount > 0 ? `[${agentCount} agents]` : "";
    const lspStatus = state.lspStatus !== "off" ? `[LSP: ${state.lspStatus}]` : "";

    currentCtx.ui.setStatus("bus", `${agentStatus} ${lspStatus}`.trim());
  };

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    updateStatus();
  });

  pi.on("session_shutdown", () => {
    if (currentCtx) {
      currentCtx.ui.setStatus("bus", undefined);
    }
  });

  // --- Event Listeners ---

  // Listen for discovered agents (from agents-discovery.ts)
  pi.events.on("discovery:agents-loaded", (data) => {
    const { paths } = data as { paths: string[] };
    // Add unique paths
    state.discoveredAgents = [...new Set([...state.discoveredAgents, ...paths])];
    updateStatus();
  });

  // Listen for LSP status (from lsp extension)
  pi.events.on("lsp:status", (data) => {
    state.lspStatus = (data as { status: GlobalState["lspStatus"] }).status;
    updateStatus();
  });

  // Listen for custom notifications
  pi.events.on("my:notification", (data) => {
    const { message, title } = data as { message: string; title?: string };
    state.lastNotification = { title: title || "Info", message, timestamp: Date.now() };

    // Trigger the actual notification system
    pi.events.emit("ui:notify", { title, message });
    updateStatus();
  });

  // --- Commands ---

  pi.registerCommand("bus-status", {
    description: "Show the current state of the event bus",
    handler: async (_args, ctx) => {
      const lines = [
        "Event Bus State:",
        `- Agents: ${state.discoveredAgents.join(", ") || "none"}`,
        `- LSP: ${state.lspStatus}`,
        `- Last Notify: ${state.lastNotification?.message || "none"}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}