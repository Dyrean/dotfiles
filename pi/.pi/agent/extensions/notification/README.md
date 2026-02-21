# Notification Extension

Sends native terminal notifications and plays a sound when Pi is idle or done
processing.

## Terminal Protocol Support

| Protocol    | Terminals                                 |
| ----------- | ----------------------------------------- |
| **OSC 777** | Ghostty, iTerm2, WezTerm, rxvt-unicode    |
| **OSC 99**  | Kitty                                     |
| **Windows** | Windows Terminal (WSL) via PowerShell toast|

The protocol is auto-detected from environment variables — no configuration
needed.

## Sound Playback

Default sound location: `~/.pi/agent/assets/notification.mp3`

The player is chosen automatically with fallback:

| Platform | Order                             |
| -------- | --------------------------------- |
| Linux    | `mpv` → `paplay` → `ffplay`      |
| macOS    | `afplay` → `mpv` → `ffplay`      |

You can override the player or provide your own sound file — see settings below.

## Events

| Event          | Description                              |
| -------------- | ---------------------------------------- |
| `agentEnd`     | Agent finished a task, ready for input   |
| `sessionStart` | Session started, Pi is idle              |

## Settings

Add a `"notification"` key to your `~/.pi/agent/settings.json`:

```jsonc
{
  "notification": {
    // Master toggle — disable all notifications at once
    "enabled": true,

    "sound": {
      // Play a sound alongside the notification
      "enabled": true,

      // Path to audio file (~ is expanded, default is ~/.pi/agent/assets/notification.mp3)
      // "path": "~/my-sounds/custom.mp3",

      // Audio player: "auto" | "mpv" | "paplay" | "ffplay" | "afplay"
      "player": "auto"
    },

    "toast": {
      // Show terminal notification
      "enabled": true
    },

    "events": {
      // Notify when the agent finishes a task
      "agentEnd": true,

      // Notify when a session starts (idle)
      "sessionStart": true
    }
  }
}
```

### Defaults

All settings are optional. When omitted they default to:

| Setting               | Default                                   |
| --------------------- | ----------------------------------------- |
| `enabled`             | `true`                                    |
| `sound.enabled`       | `true`                                    |
| `sound.path`          | `~/.pi/agent/assets/notification.mp3`     |
| `sound.player`        | `"auto"`                                  |
| `toast.enabled`       | `true`                                    |
| `events.agentEnd`     | `true`                                    |
| `events.sessionStart` | `true`                                    |

Settings are **loaded once at startup**. Use the `/reload` command or restart Pi for changes in `settings.json` to take effect.

## File Structure

```
notification/
├── index.ts               # extension entry point
└── README.md              # this file
```
