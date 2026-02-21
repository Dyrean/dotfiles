/**
 * Hooks Extension — Cursor-compatible lifecycle hooks for Pi
 *
 * Loads hooks from:
 *   - Project-level:  <cwd>/.pi/hooks.json
 *   - User-level:     ~/.pi/hooks.json
 *
 * Supported hook events (mapped from Cursor → Pi):
 *
 *   sessionStart           → session_start
 *   sessionEnd             → session_shutdown
 *   beforeSubmitPrompt     → before_agent_start (prompt submitted)
 *   beforeShellExecution   → tool_call (bash)
 *   afterShellExecution    → tool_result (bash)
 *   beforeReadFile         → tool_call (read)
 *   afterFileEdit          → tool_result (edit / write)
 *   stop                   → agent_end
 *   preCompact             → session_before_compact
 *
 * Hook scripts receive JSON on stdin and return JSON on stdout.
 *
 * Exit code behavior:
 *   0 → success, use JSON output
 *   2 → block the action (deny)
 *   * → fail-open (hook error, action proceeds)
 *
 * hooks.json format:
 * {
 *   "version": 1,
 *   "hooks": {
 *     "afterFileEdit": [
 *       { "command": "./hooks/format.sh", "timeout": 30, "matcher": "\\.tsx?$" }
 *     ]
 *   }
 * }
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

type HookEventName =
	| "sessionStart"
	| "sessionEnd"
	| "beforeSubmitPrompt"
	| "beforeShellExecution"
	| "afterShellExecution"
	| "beforeReadFile"
	| "afterFileEdit"
	| "stop"
	| "preCompact";

interface HookDefinition {
	command: string;
	timeout?: number; // seconds, default 30
	matcher?: string; // regex matched against relevant field (command / path)
}

interface HooksConfig {
	version: number;
	hooks: Partial<Record<HookEventName, HookDefinition[]>>;
}

interface HookInput {
	hook_event_name: HookEventName;
	workspace_roots: string[];
	[key: string]: unknown;
}

interface HookOutput {
	continue?: boolean;
	permission?: "allow" | "deny" | "ask";
	userMessage?: string;
	agentMessage?: string;
	modifiedCommand?: string;
	[key: string]: unknown;
}

interface ResolvedHook {
	def: HookDefinition;
	cwd: string; // directory the hooks.json was found in
	source: "project" | "user";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadHooksFile(filePath: string, source: "project" | "user"): ResolvedHook[] {
	if (!fs.existsSync(filePath)) return [];
	try {
		const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as HooksConfig;
		if (raw.version !== 1) {
			console.warn(`[hooks] Unsupported hooks.json version ${raw.version} in ${filePath}`);
			return [];
		}
		const cwd = path.dirname(filePath);
		const result: ResolvedHook[] = [];
		for (const [event, defs] of Object.entries(raw.hooks)) {
			if (!defs) continue;
			for (const def of defs) {
				result.push({ def: { ...def, command: def.command }, cwd, source });
			}
		}
		return result;
	} catch (err) {
		console.warn(`[hooks] Failed to parse ${filePath}:`, err);
		return [];
	}
}

function getHooksForEvent(
	allHooks: Map<HookEventName, ResolvedHook[]>,
	event: HookEventName,
	matchValue?: string,
): ResolvedHook[] {
	const hooks = allHooks.get(event) ?? [];
	if (!matchValue) return hooks;
	return hooks.filter((h) => {
		if (!h.def.matcher) return true;
		try {
			return new RegExp(h.def.matcher).test(matchValue);
		} catch {
			return false;
		}
	});
}

function runHookCommand(
	hook: ResolvedHook,
	input: HookInput,
	timeoutMs: number,
): Promise<{ output: HookOutput | null; exitCode: number }> {
	return new Promise((resolve) => {
		const child = spawn("sh", ["-c", hook.def.command], {
			cwd: hook.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, HOOK_EVENT: input.hook_event_name },
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d: Buffer) => {
			stderr += d.toString();
		});

		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			console.warn(
				`[hooks] Command timed out after ${timeoutMs}ms: ${hook.def.command}`,
			);
			resolve({ output: null, exitCode: -1 });
		}, timeoutMs);

		child.on("error", (err) => {
			clearTimeout(timer);
			console.warn(`[hooks] Command failed to spawn: ${hook.def.command}`, err);
			resolve({ output: null, exitCode: -1 });
		});

		child.on("close", (code) => {
			clearTimeout(timer);
			const exitCode = code ?? 1;
			let output: HookOutput | null = null;
			if (stdout.trim()) {
				try {
					output = JSON.parse(stdout.trim());
				} catch {
					// Non-JSON output, that's okay for observation hooks
				}
			}
			if (stderr.trim()) {
				console.warn(`[hooks] stderr from ${hook.def.command}:`, stderr.trim());
			}
			resolve({ output, exitCode });
		});

		// Write input JSON to stdin
		child.stdin.write(JSON.stringify(input));
		child.stdin.end();
	});
}

async function executeHooks(
	hooks: ResolvedHook[],
	input: HookInput,
	ctx: ExtensionContext | null,
): Promise<{ blocked: boolean; reason?: string; agentMessage?: string }> {
	const results = await Promise.all(
		hooks.map((hook) => {
			const timeoutMs = (hook.def.timeout ?? 30) * 1000;
			return runHookCommand(hook, input, timeoutMs);
		}),
	);

	for (const { output, exitCode } of results) {
		// Exit code 2 = block
		if (exitCode === 2) {
			return {
				blocked: true,
				reason: output?.userMessage ?? "Blocked by hook (exit code 2)",
				agentMessage: output?.agentMessage,
			};
		}

		if (!output) continue;

		// Explicit deny
		if (output.permission === "deny" || output.continue === false) {
			return {
				blocked: true,
				reason: output.userMessage ?? "Blocked by hook",
				agentMessage: output.agentMessage,
			};
		}

		// Ask the user
		if (output.permission === "ask" && ctx?.hasUI) {
			const msg = output.userMessage ?? "A hook requests confirmation to proceed.";
			const ok = await ctx.ui.confirm("🪝 Hook confirmation", msg);
			if (!ok) {
				return {
					blocked: true,
					reason: "Blocked by user via hook prompt",
					agentMessage: output.agentMessage ?? "User denied the action via hook prompt.",
				};
			}
		}
	}

	return { blocked: false };
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function hooksExtension(pi: ExtensionAPI) {
	const allHooks = new Map<HookEventName, ResolvedHook[]>();
	let workspaceRoots: string[] = [];

	function loadAllHooks(cwd: string) {
		allHooks.clear();

		const sources: { path: string; source: "project" | "user" }[] = [
			{ path: path.join(cwd, ".pi", "hooks.json"), source: "project" },
			{ path: path.join(cwd, ".cursor", "hooks.json"), source: "project" },
			{ path: path.join(homedir(), ".pi", "hooks.json"), source: "user" },
			{ path: path.join(homedir(), ".cursor", "hooks.json"), source: "user" },
		];

		let totalLoaded = 0;

		for (const src of sources) {
			if (!fs.existsSync(src.path)) continue;

			try {
				const raw = JSON.parse(fs.readFileSync(src.path, "utf-8")) as HooksConfig;
				if (raw.version !== 1) {
					console.warn(`[hooks] Unsupported version ${raw.version} in ${src.path}`);
					continue;
				}
				const hookDir = path.dirname(src.path);

				for (const [eventName, defs] of Object.entries(raw.hooks)) {
					if (!defs) continue;
					const event = eventName as HookEventName;
					if (!allHooks.has(event)) allHooks.set(event, []);
					for (const def of defs) {
						allHooks.get(event)!.push({ def, cwd: hookDir, source: src.source });
						totalLoaded++;
					}
				}
			} catch (err) {
				console.warn(`[hooks] Failed to parse ${src.path}:`, err);
			}
		}

		return totalLoaded;
	}

	function makeInput(event: HookEventName, extra: Record<string, unknown> = {}): HookInput {
		return {
			hook_event_name: event,
			workspace_roots: workspaceRoots,
			...extra,
		};
	}

	// ── Session lifecycle ──────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		workspaceRoots = [ctx.cwd];
		const count = loadAllHooks(ctx.cwd);

		if (count > 0) {
			ctx.ui.notify(`🪝 Loaded ${count} hook(s)`, "info");
		}

		// Fire sessionStart hooks
		const hooks = getHooksForEvent(allHooks, "sessionStart");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("sessionStart"), ctx);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "sessionEnd");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("sessionEnd"), ctx);
		}
	});

	// ── Before agent start (beforeSubmitPrompt) ────────────────────────────

	pi.on("before_agent_start", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "beforeSubmitPrompt");
		if (hooks.length === 0) return;

		const input = makeInput("beforeSubmitPrompt", {
			prompt: event.prompt,
		});

		const result = await executeHooks(hooks, input, ctx);

		if (result.blocked && result.agentMessage) {
			return {
				message: {
					customType: "hooks",
					content: result.agentMessage,
					display: true,
				},
			};
		}
	});

	// ── Before shell / read execution (tool_call) ──────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		// beforeShellExecution
		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			const hooks = getHooksForEvent(allHooks, "beforeShellExecution", command);
			if (hooks.length > 0) {
				const input = makeInput("beforeShellExecution", {
					command,
					cwd: ctx.cwd,
				});
				const result = await executeHooks(hooks, input, ctx);
				if (result.blocked) {
					return {
						block: true,
						reason: result.agentMessage ?? result.reason ?? "Blocked by hook",
					};
				}
			}
		}

		// beforeReadFile
		if (isToolCallEventType("read", event)) {
			const filePath = event.input.path;
			const hooks = getHooksForEvent(allHooks, "beforeReadFile", filePath);
			if (hooks.length > 0) {
				const input = makeInput("beforeReadFile", {
					file_path: filePath,
				});
				const result = await executeHooks(hooks, input, ctx);
				if (result.blocked) {
					return {
						block: true,
						reason: result.agentMessage ?? result.reason ?? "Blocked by hook",
					};
				}
			}
		}
	});

	// ── After shell execution / file edit (tool_result) ─────────────────────

	pi.on("tool_result", async (event, ctx) => {
		// afterShellExecution
		if (event.toolName === "bash") {
			const hooks = getHooksForEvent(allHooks, "afterShellExecution");
			if (hooks.length > 0) {
				const input = makeInput("afterShellExecution", {
					command: (event.input as Record<string, unknown>)?.command,
					exit_code: event.isError ? 1 : 0,
					output: event.content
						?.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n"),
				});
				await executeHooks(hooks, input, null);
			}
		}

		// afterFileEdit
		if (event.toolName === "edit" || event.toolName === "write") {
			const filePath = (event.input as Record<string, unknown>)?.path as string | undefined;
			const hooks = getHooksForEvent(allHooks, "afterFileEdit", filePath);
			if (hooks.length > 0) {
				const input = makeInput("afterFileEdit", {
					file_path: filePath,
					tool: event.toolName,
				});
				await executeHooks(hooks, input, null);
			}
		}
	});

	// ── Agent end (stop) ───────────────────────────────────────────────────

	pi.on("agent_end", async (_event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "stop");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("stop"), ctx);
		}
	});

	// ── Pre-compact ────────────────────────────────────────────────────────

	pi.on("session_before_compact", async (_event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "preCompact");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("preCompact"), null);
		}
	});

	// ── /hooks command — list loaded hooks ─────────────────────────────────

	pi.registerCommand("hooks", {
		description: "List loaded hooks",
		handler: async (_args, ctx) => {
			if (allHooks.size === 0) {
				ctx.ui.notify("No hooks loaded. Create .pi/hooks.json or ~/.pi/hooks.json", "info");
				return;
			}

			const lines: string[] = ["🪝 Loaded hooks:\n"];

			for (const [event, hooks] of allHooks.entries()) {
				lines.push(`  ${event} (${hooks.length}):`);
				for (const h of hooks) {
					let line = `    • ${h.def.command}`;
					if (h.def.matcher) line += `  [matcher: ${h.def.matcher}]`;
					if (h.def.timeout) line += `  [timeout: ${h.def.timeout}s]`;
					line += `  (${h.source})`;
					lines.push(line);
				}
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ── /hooks-reload command — reload hooks.json files ─────────────────────

	pi.registerCommand("hooks-reload", {
		description: "Reload hooks configuration from hooks.json files",
		handler: async (_args, ctx) => {
			const count = loadAllHooks(ctx.cwd);
			ctx.ui.notify(`🪝 Reloaded: ${count} hook(s) loaded`, "info");
		},
	});
}
