import type { StatusDisplay, StatusSnapshotEntry } from "./ui/status-registry.js";
import { isManagedStatusKey } from "./ui/status-registry.js";

export function shouldHideExtensionStatus(statusKey: string, value: string): boolean {
  const normalizedKey = statusKey.toLowerCase();
  const normalizedValue = value.trimStart().toLowerCase();
  return normalizedKey.includes("mcp") || normalizedValue.startsWith("mcp:");
}

export function isBracketStatusLine(value: string): boolean {
  return value.trimStart().startsWith("[");
}

export function inferStatusDisplay(statusKey: string, value: string): StatusDisplay {
  return isBracketStatusLine(value) ? "banner" : "inline";
}

function normalizeStatusText(display: StatusDisplay, value: string): string {
  const trimmed = value.trim();
  if (display === "banner" && trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeLegacyStatusEntry(statusKey: string, value: string): StatusSnapshotEntry | undefined {
  if (!value || shouldHideExtensionStatus(statusKey, value) || isManagedStatusKey(statusKey)) {
    return undefined;
  }

  const display = inferStatusDisplay(statusKey, value);

  return {
    id: statusKey,
    text: normalizeStatusText(display, value),
    display,
    priority: 0,
  };
}
