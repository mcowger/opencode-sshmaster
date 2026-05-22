# AGENTS.md

## Architecture

- Single-file plugin: `plugin.tsx` is both the TUI source and the only code file
- No build/bundle step — the `.tsx` source is shipped directly via npm; Bun handles TSX/JSX at load time
- `package.json` `exports["./tui"]` points to `./plugin.tsx` (source, not dist)
- solid-js and @opencode-ai/plugin are provided by the opencode runtime at load time — never bundle them
- Plugin ID is `"ssh-tunnel"`; exports `{ id, tui }` as default

## Release

- Bump `version` in `package.json`, commit to `main`. CI auto-tags and publishes to npm via OIDC trusted publishing.
- Do not create tags manually.
- Do not add a `main` or `exports["."]` field to `package.json` — it will hijack the `.tsx` entrypoint resolution

## Runtime Dependencies

- Requires Bun APIs (`Bun.spawn`, `Bun.spawnSync`) — will not run under Node
- Requires `ssh` CLI on `$PATH` (macOS/Linux only; Windows shows a notice)
- SSH control sockets go to `/tmp/opencode-ssh-{sanitized_host}.sock`

## Gotchas

- `api.slots.register()` requires an `id` field or the registration is silently ignored
- LSP will report false-positive errors on opentui JSX (`<box>`, `<text>`, `fg=` props) and tsconfig comments — these are not real errors
- Never bundle solid-js — the opencode runtime provides it; bundling pulls in the server build which renders nothing
