# @mcowger/opencode-sshmaster

An [OpenCode](https://opencode.ai) plugin that manages SSH master connections and port forwarding directly from the TUI sidebar.

## Features

- Automatic SSH master connection with `ControlMaster` for persistent tunnels
- Add/remove port forwards interactively via dialog
- Health monitoring with auto-reconnect
- Keyboard shortcuts for all actions via the command palette
- Windows unsupported (shown as a notice in the sidebar)

## Install

Add the plugin to your `opencode.json`:

```json
{
  "plugin": [
    ["@mcowger/opencode-sshmaster", {
      "host": "my-server",
      "identityFile": "~/.ssh/id_ed25519",
      "forwards": [
        { "local": 3000, "remote": 3000 },
        { "local": 5432, "remote": 5432 }
      ]
    }]
  ]
}
```

OpenCode will automatically install the package from npm on next startup.

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `host` | `string` | Yes | SSH hostname (as defined in `~/.ssh/config`) |
| `identityFile` | `string` | No | Path to SSH private key |
| `forwards` | `Tunnel[]` | No | Port forwards to establish on connect |

### Tunnel

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `local` | `number` | Yes | — | Local port to bind |
| `remote` | `number` | Yes | — | Remote port to forward to |
| `remoteHost` | `string` | No | `"localhost"` | Remote host to forward to (relative to the SSH server) |

## Commands

| Command | Description |
|---------|-------------|
| `tunnel.add` | Add a new port forward |
| `tunnel.remove` | Remove an existing port forward |
| `tunnel.reconnect` | Reconnect the SSH master connection |

All commands are available in the command palette (`Ctrl+P` / `Cmd+P`).

## Requirements

- macOS or Linux
- OpenSSH client installed and in `$PATH`
- SSH access to the target host configured (key-based auth recommended)
