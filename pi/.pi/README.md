# .pi

Global pi config, synced via dotfiles and stowed into `~/.pi`.

## Ownership

Treat this directory as the Pi-specific source of truth.

- `pi/.pi/agent/` contains Pi-native config, extensions, and adapted skills
- `agents/.agents/` is the generic shared skill library
- `opencode/.config/opencode/` is OpenCode-specific and should not be copied blindly into Pi

When a generic skill is adapted for Pi, the Pi copy should be maintained here rather than treated as identical to the shared source.

## Extension dependency workspace

Package-style global extensions stay in `agent/extensions/` so pi can still auto-discover them from:

- `~/.pi/agent/extensions/*.ts`
- `~/.pi/agent/extensions/*/index.ts`

This directory is now the shared npm workspace root for extensions with their own `package.json` files.

Install or refresh all extension dependencies from here:

```bash
npm install
```

Run workspace checks:

```bash
npm run check
```

Current workspace-managed extensions live under:

- `agent/extensions/web-tools`
- `agent/extensions/pi-mcp`

After changing extension code, reload pi with `/reload`.
