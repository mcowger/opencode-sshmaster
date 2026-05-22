# AGENTS.md

## Build & Publish

- `bun run build` — bundles `ssh-tunnel.tsx` into `dist/index.js` via `bun build --target node`
- No typecheck or lint step is configured; the LSP will report false positives on opentui JSX (`<box>`, `<text>`, `fg=` props) and tsconfig comments — these are not real errors
- Release: bump `version` in `package.json`, commit to `main`. CI auto-tags and publishes to npm via OIDC trusted publishing. Do not create tags manually.

## Architecture

- Single-file plugin: `ssh-tunnel.tsx` is both the TUI source and the only code file
- Build output is a self-contained bundle (solid-js inlined); `@opencode-ai/plugin` is a peerDependency only
- TSX uses opentui's custom JSX elements (`<box>`, `<text>`, `<b>`, `<span>`) with SolidJS reactivity (`createSignal`, `Show`, `For`) — not React/DOM
- Plugin ID is `"ssh-tunnel"`; exports `{ id, tui }` as default
- Config options type is `PluginOptions` (host, identityFile, forwards)

## Runtime Dependencies

- Requires Bun APIs (`Bun.spawn`, `Bun.spawnSync`) — will not run under Node
- Requires `ssh` CLI on `$PATH` (macOS/Linux only; Windows shows a notice)
- SSH control sockets go to `/tmp/opencode-ssh-{sanitized_host}.sock`
