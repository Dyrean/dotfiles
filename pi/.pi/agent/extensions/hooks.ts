/**
 * Hooks Extension — Pi-native lifecycle hooks
 *
 * Loads hooks from:
 *   - Project-level:  <cwd>/.pi/hooks.json
 *   - User-level:     ~/.pi/hooks.json
 *
 * Example config (.pi/hooks.json):
 * {
 *   "version": 1,
 *   "hooks": {
 *     "tool_call": [
 *       {
 *         "matcher": "write_file|replace",
 *         "hooks": [
 *           {
 *             "name": "security-check",
 *             "type": "command",
 *             "command": "$PI_PROJECT_DIR/scripts/security.sh",
 *             "timeout": 5000
 *           }
 *         ]
 *       },
 *       {
 *         "name": "logger",
 *         "type": "command",
 *         "command": "echo \"Tool called: $HOOK_EVENT\" >> /tmp/pi-hooks.log"
 *       }
 *     ],
 *     "session_start": [
 *       { "type": "command", "command": "./scripts/welcome.sh" }
 *     ]
 *   }
 * }
 *
 * Hook scripts receive JSON on stdin and return JSON on stdout.
 * Environment variables available to commands:
 *   $PI_PROJECT_DIR - Root of the .pi folder
 *   $CWD            - Current working directory
 *   $SESSION_ID     - Unique session identifier
 *   $HOOK_EVENT     - The name of the event firing
 *
 * Exit code behavior:
 *   0 → success, use JSON output
 *   2 → block the action (block/deny)
 *   * → fail-open (hook error, action proceeds)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

type HookEventName =
	| "session_start"
	| "session_shutdown"
	| "session_switch"
	| "session_before_switch"
	| "session_fork"
	| "session_before_fork"
	| "session_before_compact"
	| "session_compact"
	| "session_before_tree"
	| "session_tree"
	| "before_agent_start"
	| "agent_start"
	| "agent_end"
	| "turn_start"
	| "turn_end"
	| "message_start"
	| "message_update"
	| "message_end"
	| "tool_execution_start"
	| "tool_execution_update"
	| "tool_execution_end"
	| "tool_call"
	| "tool_result"
	| "user_bash"
	| "input"
	| "context"
	| "resources_discover"
	| "model_select";

interface HookDefinition {
	type: "command";
	command: string;
	name?: string;
	timeout?: number; // milliseconds, default 60000
	description?: string;
	matcher?: string;
}

interface HookGroup {
	matcher?: string;
	hooks: HookDefinition[];
}

type HookEntry = HookDefinition | HookGroup;

interface HooksConfig {
	version: number;
	hooks: Partial<Record<HookEventName, HookEntry[]>>;
}

interface HookInput {
	session_id: string;
	cwd: string;
	hook_event_name: HookEventName;
	timestamp: string;
	workspace_roots: string[];
	[key: string]: unknown;
}

interface HookOutput {
	systemMessage?: string;
	suppressOutput?: boolean;
	continue?: boolean;
	stopReason?: string;
	decision?: "allow" | "deny" | "block";
	reason?: string;
	hookSpecificOutput?: {
		cancel?: boolean;
		tool_input?: Record<string, unknown>;
		additionalContext?: string;
		systemPrompt?: string;
		clearContext?: boolean;
		skillPaths?: string[];
		promptPaths?: string[];
		themePaths?: string[];
		action?: "continue" | "transform" | "handled";
		text?: string;
		messages?: any[];
		skipConversationRestore?: boolean;
		summary?: {
			summary: string;
			details?: any;
		};
		customInstructions?: string;
		replaceInstructions?: boolean;
		label?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

interface ResolvedHook {
	def: HookDefinition;
	cwd: string;
	source: "project" | "user";
	matcher?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHooksForEvent(
	allHooks: Map<HookEventName, ResolvedHook[]>,
	event: HookEventName,
	matchValue?: string,
): ResolvedHook[] {
	const hooks = allHooks.get(event) ?? [];
	if (!matchValue) return hooks;
	return hooks.filter((h) => {
		const matcher = h.matcher || h.def.matcher;
		if (!matcher) return true;
		try {
			return new RegExp(matcher).test(matchValue);
		} catch {
			return false;
		}
	});
}

function expandVars(cmd: string, vars: Record<string, string>): string {
	return cmd.replace(/\$(\w+)/g, (_, name) => vars[name] || `$${name}`);
}

function runHookCommand(
	hook: ResolvedHook,
	input: HookInput,
	timeoutMs: number,
): Promise<{ output: HookOutput | null; exitCode: number }> {
	return new Promise((resolve) => {
		const command = expandVars(hook.def.command, {
			PI_PROJECT_DIR: hook.cwd,
			CWD: input.cwd,
			SESSION_ID: input.session_id,
		});

		const child = spawn("sh", ["-c", command], {
			cwd: hook.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				HOOK_EVENT: input.hook_event_name,
				PI_PROJECT_DIR: hook.cwd,
			},
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
		child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			console.warn(`[hooks] Command timed out after ${timeoutMs}ms: ${command}`);
			resolve({ output: null, exitCode: -1 });
		}, timeoutMs);

		child.on("error", (err) => {
			clearTimeout(timer);
			console.warn(`[hooks] Command failed to spawn: ${command}`, err);
			resolve({ output: null, exitCode: -1 });
		});

		child.on("close", (code) => {
			clearTimeout(timer);
			const exitCode = code ?? 1;
			let output: HookOutput | null = null;
			const trimmedStdout = stdout.trim();
			if (trimmedStdout) {
				try {
					output = JSON.parse(trimmedStdout);
				} catch (err) {
					if (exitCode === 0) {
						console.warn(`[hooks] Failed to parse JSON output from ${hook.def.name || command}:`, err);
					}
				}
			}
			if (stderr.trim()) {
				console.warn(`[hooks] stderr from ${hook.def.name || command}:`, stderr.trim());
			}
			resolve({ output, exitCode });
		});

		child.stdin.write(JSON.stringify(input));
		child.stdin.end();
	});
}

async function executeHooks(
	hooks: ResolvedHook[],
	input: HookInput,
	ctx: ExtensionContext | null,
): Promise<{
	blocked: boolean;
	reason?: string;
	systemMessage?: string;
	hookSpecificOutput: HookOutput["hookSpecificOutput"];
}> {
	const results = await Promise.all(
		hooks.map((hook) => {
			const timeoutMs = hook.def.timeout ?? 60000;
			return runHookCommand(hook, input, timeoutMs);
		}),
	);

	const mergedSpecificOutput: Record<string, any> = {};
	let blocked = false;
	let reason: string | undefined;
	let systemMessage: string | undefined;

	for (const { output, exitCode } of results) {
		if (exitCode === 2) {
			blocked = true;
			reason = output?.reason ?? "Blocked by hook (exit code 2)";
			systemMessage = output?.systemMessage;
			break;
		}

		if (!output) continue;

		if (output.decision === "block" || output.decision === "deny" || output.continue === false) {
			blocked = true;
			reason = output.reason ?? "Blocked by hook";
			systemMessage = output.systemMessage;
			break;
		}

		if (output.systemMessage) {
			systemMessage = systemMessage ? `${systemMessage}\n${output.systemMessage}` : output.systemMessage;
		}

		if (output.hookSpecificOutput) {
			for (const [key, val] of Object.entries(output.hookSpecificOutput)) {
				if (key === "additionalContext" && typeof val === "string") {
					mergedSpecificOutput[key] = (mergedSpecificOutput[key] as string ?? "") + val;
				} else if (Array.isArray(val)) {
					mergedSpecificOutput[key] = [...(mergedSpecificOutput[key] as any[] ?? []), ...val];
				} else if (typeof val === "object" && val !== null) {
					mergedSpecificOutput[key] = { ...(mergedSpecificOutput[key] as object ?? {}), ...val };
				} else {
					mergedSpecificOutput[key] = val;
				}
			}
		}
	}

	return {
		blocked,
		reason,
		systemMessage,
		hookSpecificOutput: mergedSpecificOutput,
	};
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function hooksExtension(pi: ExtensionAPI) {
	const allHooks = new Map<HookEventName, ResolvedHook[]>();
	let workspaceRoots: string[] = [];
	let sessionId = Math.random().toString(36).substring(7);

	function loadAllHooks(cwd: string) {
		allHooks.clear();

		const sources: { path: string; source: "project" | "user" }[] = [
			{ path: path.join(cwd, ".pi", "hooks.json"), source: "project" },
			{ path: path.join(homedir(), ".pi", "hooks.json"), source: "user" },
		];

		let totalLoaded = 0;

		for (const src of sources) {
			if (!fs.existsSync(src.path)) continue;

			try {
				const raw = JSON.parse(fs.readFileSync(src.path, "utf-8")) as HooksConfig;
				if (raw.version !== 1) continue;
				const hookDir = path.dirname(src.path);

				for (const [eventName, entries] of Object.entries(raw.hooks)) {
					if (!entries) continue;
					const event = eventName as HookEventName;
					if (!allHooks.has(event)) allHooks.set(event, []);

					for (const entry of entries) {
						if ("hooks" in entry) {
							for (const def of entry.hooks) {
								allHooks.get(event)!.push({ def, cwd: hookDir, source: src.source, matcher: entry.matcher });
								totalLoaded++;
							}
						} else {
							allHooks.get(event)!.push({ def: entry, cwd: hookDir, source: src.source });
							totalLoaded++;
						}
					}
				}
			} catch (err) {
				console.warn(`[hooks] Failed to parse ${src.path}:`, err);
			}
		}

		return totalLoaded;
	}

	function makeInput(event: HookEventName, ctx: ExtensionContext, extra: Record<string, unknown> = {}): HookInput {
		return {
			session_id: sessionId,
			cwd: ctx.cwd,
			hook_event_name: event,
			timestamp: new Date().toISOString(),
			workspace_roots: workspaceRoots,
			...extra,
		};
	}

	// ── Resources Discovery ────────────────────────────────────────────────

	pi.on("resources_discover", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "resources_discover");
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("resources_discover", ctx, {
			reason: event.reason
		}), ctx);

		return {
			skillPaths: result.hookSpecificOutput?.skillPaths as string[] | undefined,
			promptPaths: result.hookSpecificOutput?.promptPaths as string[] | undefined,
			themePaths: result.hookSpecificOutput?.themePaths as string[] | undefined,
		};
	});

	// ── Session Lifecycle ──────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		workspaceRoots = [ctx.cwd];
		const count = loadAllHooks(ctx.cwd);
		if (count > 0) ctx.ui.notify(`🪝 Loaded ${count} hook(s)`, "info");

		const hooks = getHooksForEvent(allHooks, "session_start");
		if (hooks.length > 0) {
			const result = await executeHooks(hooks, makeInput("session_start", ctx), ctx);
			if (result.systemMessage) ctx.ui.notify(result.systemMessage, "info");
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_shutdown");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("session_shutdown", ctx, { reason: "exit" }), ctx);
		}
	});

	pi.on("session_before_switch", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_before_switch", event.targetSessionFile);
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("session_before_switch", ctx, {
			reason: event.reason,
			targetSessionFile: event.targetSessionFile
		}), ctx);

		if (result.blocked || result.hookSpecificOutput?.cancel) {
			return { cancel: true };
		}
	});

	pi.on("session_switch", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_switch", event.previousSessionFile);
		if (hooks.length > 0) {
			executeHooks(hooks, makeInput("session_switch", ctx, {
				reason: event.reason,
				previousSessionFile: event.previousSessionFile
			}), ctx);
		}
	});

	pi.on("session_before_fork", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_before_fork");
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("session_before_fork", ctx, {
			entryId: event.entryId
		}), ctx);

		if (result.blocked || result.hookSpecificOutput?.cancel) {
			return { cancel: true };
		}

		if (result.hookSpecificOutput?.skipConversationRestore) {
			return { skipConversationRestore: true };
		}
	});

	pi.on("session_fork", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_fork", event.previousSessionFile);
		if (hooks.length > 0) {
			executeHooks(hooks, makeInput("session_fork", ctx, {
				previousSessionFile: event.previousSessionFile
			}), ctx);
		}
	});

	pi.on("session_before_tree", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_before_tree", event.preparation.targetId);
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("session_before_tree", ctx, {
			preparation: event.preparation
		}), ctx);

		if (result.blocked || result.hookSpecificOutput?.cancel) {
			return { cancel: true };
		}

		if (result.hookSpecificOutput?.summary) {
			return {
				summary: result.hookSpecificOutput.summary,
				customInstructions: result.hookSpecificOutput.customInstructions,
				replaceInstructions: result.hookSpecificOutput.replaceInstructions,
				label: result.hookSpecificOutput.label
			};
		}
	});

	pi.on("session_tree", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_tree");
		if (hooks.length > 0) {
			executeHooks(hooks, makeInput("session_tree", ctx, {
				newLeafId: event.newLeafId,
				oldLeafId: event.oldLeafId,
				summaryEntry: event.summaryEntry
			}), ctx);
		}
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_before_compact");
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("session_before_compact", ctx, {
			preparation: event.preparation
		}), ctx);

		if (result.blocked || result.hookSpecificOutput?.cancel) {
			return { cancel: true };
		}
	});

	pi.on("session_compact", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "session_compact");
		if (hooks.length > 0) {
			executeHooks(hooks, makeInput("session_compact", ctx, {
				compactionEntry: event.compactionEntry,
				fromExtension: event.fromExtension
			}), ctx);
		}
	});

	// ── Agent Execution ────────────────────────────────────────────────────

	pi.on("before_agent_start", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "before_agent_start");
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("before_agent_start", ctx, {
			prompt: event.prompt,
			systemPrompt: event.systemPrompt
		}), ctx);

		if (result.blocked) {
			return {
				message: {
					customType: "hooks",
					content: result.systemMessage ?? result.reason ?? "Blocked by hook",
					display: true,
				},
			};
		}

		if (result.hookSpecificOutput?.systemPrompt && typeof result.hookSpecificOutput.systemPrompt === "string") {
			return {
				systemPrompt: result.hookSpecificOutput.systemPrompt,
			};
		}
	});

	pi.on("agent_start", (_event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "agent_start");
		if (hooks.length > 0) {
			executeHooks(hooks, makeInput("agent_start", ctx), ctx);
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "agent_end");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("agent_end", ctx), ctx);
		}
	});

	pi.on("turn_start", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "turn_start");
		if (hooks.length > 0) executeHooks(hooks, makeInput("turn_start", ctx, { turnIndex: event.turnIndex }), ctx);
	});

	pi.on("turn_end", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "turn_end");
		if (hooks.length > 0) executeHooks(hooks, makeInput("turn_end", ctx, {
			turnIndex: event.turnIndex,
			message: event.message
		}), ctx);
	});

	pi.on("message_start", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "message_start");
		if (hooks.length > 0) executeHooks(hooks, makeInput("message_start", ctx, {
			message: event.message
		}), ctx);
	});

	pi.on("message_update", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "message_update");
		if (hooks.length > 0) executeHooks(hooks, makeInput("message_update", ctx, {
			message: event.message,
			assistantMessageEvent: event.assistantMessageEvent
		}), ctx);
	});

	pi.on("message_end", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "message_end");
		if (hooks.length > 0) executeHooks(hooks, makeInput("message_end", ctx, {
			message: event.message
		}), ctx);
	});

	// ── Tool Execution ─────────────────────────────────────────────────────

	pi.on("tool_execution_start", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "tool_execution_start", event.toolName);
		if (hooks.length > 0) executeHooks(hooks, makeInput("tool_execution_start", ctx, {
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			args: event.args
		}), ctx);
	});

	pi.on("tool_execution_update", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "tool_execution_update", event.toolName);
		if (hooks.length > 0) executeHooks(hooks, makeInput("tool_execution_update", ctx, {
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			args: event.args,
			partialResult: event.partialResult
		}), ctx);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "tool_execution_end", event.toolName);
		if (hooks.length > 0) executeHooks(hooks, makeInput("tool_execution_end", ctx, {
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			result: event.result,
			isError: event.isError
		}), ctx);
	});

	pi.on("tool_call", async (event, ctx) => {
		const matchValue = (event.input as any).command ?? (event.input as any).path ?? event.toolName;
		const hooks = getHooksForEvent(allHooks, "tool_call", matchValue);
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("tool_call", ctx, {
			tool_name: event.toolName,
			tool_input: event.input,
		}), ctx);

		if (result.blocked) {
			return {
				block: true,
				reason: result.systemMessage ?? result.reason ?? "Blocked by hook",
			};
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		const matchValue = (event.input as any).command ?? (event.input as any).path ?? event.toolName;
		const hooks = getHooksForEvent(allHooks, "tool_result", matchValue);
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("tool_result", ctx, {
			tool_name: event.toolName,
			tool_input: event.input,
			tool_response: {
				llmContent: event.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n"),
				error: event.isError ? "Error occurred" : undefined,
			},
		}), ctx);

		if (result.systemMessage) ctx.ui.notify(result.systemMessage, "info");

		if (result.hookSpecificOutput?.additionalContext && typeof result.hookSpecificOutput.additionalContext === "string") {
			return {
				content: [
					...(event.content ?? []),
					{ type: "text", text: result.hookSpecificOutput.additionalContext }
				]
			};
		}
	});

	// ── Input & Commands ───────────────────────────────────────────────────

	pi.on("input", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "input", event.text);
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("input", ctx, {
			text: event.text,
			source: event.source
		}), ctx);

		if (result.blocked) return { action: "handled" };

		const action = result.hookSpecificOutput?.action;
		if (action === "continue" || action === "handled") {
			return { action };
		}
		if (action === "transform") {
			return {
				action: "transform",
				text: (result.hookSpecificOutput?.text as string) ?? event.text,
			};
		}
	});

	pi.on("user_bash", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "user_bash", event.command);
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("user_bash", ctx, {
			command: event.command,
			cwd: event.cwd
		}), ctx);

		if (result.blocked) {
			return {
				result: {
					output: result.reason ?? "Blocked by hook",
					exitCode: 1,
					cancelled: false,
					truncated: false,
				}
			};
		}
	});

	// ── Model & Context ────────────────────────────────────────────────────

	pi.on("model_select", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "model_select");
		if (hooks.length > 0) {
			await executeHooks(hooks, makeInput("model_select", ctx, {
				model: (event.model as any).id,
				previousModel: (event.previousModel as any)?.id,
				source: event.source
			}), ctx);
		}
	});

	pi.on("context", async (event, ctx) => {
		const hooks = getHooksForEvent(allHooks, "context");
		if (hooks.length === 0) return;

		const result = await executeHooks(hooks, makeInput("context", ctx, {
			messages: event.messages
		}), ctx);

		if (result.hookSpecificOutput?.messages) {
			return { messages: result.hookSpecificOutput.messages };
		}
	});

	// ── Commands ───────────────────────────────────────────────────────────

	pi.registerCommand("hooks", {
		description: "List loaded hooks",
		handler: async (_args, ctx) => {
			if (allHooks.size === 0) {
				ctx.ui.notify("No hooks loaded.", "info");
				return;
			}
			const lines = ["🪝 Loaded hooks (Pi-native format):\n"];
			for (const [event, hooks] of allHooks.entries()) {
				lines.push(`  ${event} (${hooks.length}):`);
				for (const h of hooks) {
					let label = h.def.name || h.def.command;
					lines.push(`    • ${label} (${h.source})`);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("hooks-reload", {
		description: "Reload hooks",
		handler: async (_args, ctx) => {
			const count = loadAllHooks(ctx.cwd);
			ctx.ui.notify(`🪝 Reloaded: ${count} hook(s)`, "info");
		},
	});
}
