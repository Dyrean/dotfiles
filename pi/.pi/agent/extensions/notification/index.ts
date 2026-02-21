/**
 * Pi Notify Extension
 *
 * Sends a native terminal notification + plays a sound when Pi is waiting for input.
 * All behavior is configurable via the "notification" key in settings.json.
 *
 * Supports multiple terminal protocols:
 * - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
 * - OSC 99: Kitty
 * - Windows toast: Windows Terminal (WSL)
 *
 * Settings (in settings.json → "notification"):
 * ─────────────────────────────────────────────────
 * enabled             : bool   – master toggle (default: true)
 * sound.enabled       : bool   – play a sound on notification (default: true)
 * sound.path          : string – path to audio file, supports ~ (default: ~/.pi/agent/assets/notification.mp3)
 * sound.player        : string – "auto" | "mpv" | "paplay" | "ffplay" | "afplay" (default: "auto")
 * toast.enabled       : bool   – show terminal notification (default: true)
 * events.agentEnd     : bool   – notify when agent finishes a task (default: true)
 * events.sessionStart : bool   – notify when a session starts / idle (default: true)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Paths ──────────────────────────────────────────────────────────────────────

const DEFAULT_SOUND_PATH = join(homedir(), ".pi", "agent", "assets", "notification.mp3");

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotificationSettings {
	enabled: boolean;
	sound: {
		enabled: boolean;
		path: string;
		player: "auto" | "mpv" | "paplay" | "ffplay" | "afplay";
	};
	toast: {
		enabled: boolean;
	};
	events: {
		agentEnd: boolean;
		sessionStart: boolean;
	};
}

const DEFAULTS: NotificationSettings = {
	enabled: true,
	sound: {
		enabled: true,
		path: DEFAULT_SOUND_PATH,
		player: "auto",
	},
	toast: {
		enabled: true,
	},
	events: {
		agentEnd: true,
		sessionStart: true,
	},
};

// ── Settings loader ────────────────────────────────────────────────────────────

function expandHome(filepath: string): string {
	return filepath.startsWith("~") ? join(homedir(), filepath.slice(1)) : filepath;
}

function resolveSoundPath(value: string | undefined): string {
	if (!value) return DEFAULT_SOUND_PATH;
	return expandHome(value);
}

function loadSettings(): NotificationSettings {
	try {
		const raw = readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf-8");
		const json = JSON.parse(raw);
		const n = json?.notification;
		if (!n) return DEFAULTS;

		return {
			enabled: n.enabled ?? DEFAULTS.enabled,
			sound: {
				enabled: n.sound?.enabled ?? DEFAULTS.sound.enabled,
				path: resolveSoundPath(n.sound?.path),
				player: n.sound?.player ?? DEFAULTS.sound.player,
			},
			toast: {
				enabled: n.toast?.enabled ?? DEFAULTS.toast.enabled,
			},
			events: {
				agentEnd: n.events?.agentEnd ?? DEFAULTS.events.agentEnd,
				sessionStart: n.events?.sessionStart ?? DEFAULTS.events.sessionStart,
			},
		};
	} catch {
		return DEFAULTS;
	}
}

// ── Terminal notifications ─────────────────────────────────────────────────────

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
	const template = `[${type}.ToastTemplateType]::ToastText01`;
	const toast = `[${type}.ToastNotification]::new($xml)`;
	return [
		`${mgr} > $null`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
		`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show(${toast})`,
	].join("; ");
}

function notifyOSC777(title: string, body: string): void {
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
	process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
	process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function notifyWindows(title: string, body: string): void {
	execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
}

function sendNotification(title: string, body: string): void {
	if (process.env.WT_SESSION) {
		notifyWindows(title, body);
	} else if (process.env.KITTY_WINDOW_ID) {
		notifyOSC99(title, body);
	} else {
		notifyOSC777(title, body);
	}
}

// ── Sound playback ─────────────────────────────────────────────────────────────

type Player = "mpv" | "paplay" | "ffplay" | "afplay";

const PLAYER_ARGS: Record<Player, (path: string) => string[]> = {
	mpv: (p) => ["--no-video", "--really-quiet", p],
	paplay: (p) => [p],
	ffplay: (p) => ["-nodisp", "-autoexit", "-loglevel", "quiet", p],
	afplay: (p) => [p],
};

const AUTO_ORDER: Player[] =
	process.platform === "darwin"
		? ["afplay", "mpv", "ffplay"]
		: ["mpv", "paplay", "ffplay"];

function tryPlayer(player: Player, soundPath: string, fallbacks: readonly Player[]): void {
	execFile(player, PLAYER_ARGS[player](soundPath), (err) => {
		if (err && fallbacks.length > 0) {
			tryPlayer(fallbacks[0] as Player, soundPath, fallbacks.slice(1));
		}
	});
}

function playSound(settings: NotificationSettings): void {
	if (!settings.sound.enabled) return;

	const soundPath = settings.sound.path;
	const player = settings.sound.player;

	if (player === "auto") {
		if (AUTO_ORDER.length === 0) return;
		tryPlayer(AUTO_ORDER[0] as Player, soundPath, AUTO_ORDER.slice(1));
	} else {
		tryPlayer(player, soundPath, []);
	}
}

// ── Main ───────────────────────────────────────────────────────────────────────

let isFocused = true;
let focusReportingSupported = false;
let lastActivityTime = 0;

function shouldNotify(): boolean {
	const now = Date.now();
	const recentlyActive = now - lastActivityTime < 5000; // 5 second grace period

	// If the terminal supports focus reporting, we prioritize the actual focus state.
	// Otherwise, we fall back to checking recent keyboard activity.
	if (focusReportingSupported) {
		return !isFocused && !recentlyActive;
	}

	return !recentlyActive;
}

function notify(title: string, body: string, settings: NotificationSettings): void {
	if (!settings.enabled) return;
	if (!shouldNotify()) return;

	if (settings.toast.enabled) {
		sendNotification(title, body);
	}
	playSound(settings);
}

export default function (pi: ExtensionAPI) {
	// Settings are loaded once at startup.
	// Changes to settings.json require /reload or a restart.
	const settings = loadSettings();

	// Enable focus reporting (OSC 1004)
	process.stdout.write("\x1b[?1004h");

	pi.on("session_shutdown", () => {
		// Disable focus reporting on exit
		process.stdout.write("\x1b[?1004l");
	});

	pi.on("session_start", async (_event, ctx) => {
		if (settings.events.sessionStart) {
			notify("Pi", "Idle — waiting for input", settings);
		}

		// Track focus and activity
		if (ctx.hasUI) {
			ctx.ui.onTerminalInput((data) => {
				lastActivityTime = Date.now();

				if (data === "\x1b[I") {
					// Focus Gained
					focusReportingSupported = true;
					isFocused = true;
					return { consume: true };
				}
				if (data === "\x1b[O") {
					// Focus Lost
					focusReportingSupported = true;
					isFocused = false;
					return { consume: true };
				}

				return undefined;
			});
		}
	});

	pi.on("agent_end", async () => {
		if (settings.events.agentEnd) {
			notify("Pi", "Ready for input", settings);
		}
	});

	// Support ad-hoc notifications via the event bus
	pi.events.on("ui:notify", (data) => {
		const { title, message } = data as { title?: string; message: string };
		notify(title || "Pi", message, settings);
	});
}
