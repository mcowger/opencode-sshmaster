import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createSignal, For, Show } from "solid-js"

type Tunnel = {
  local: number
  remote: number
  remoteHost?: string
}

function tunnelRemoteHost(t: Tunnel): string {
  return t.remoteHost || "localhost"
}

function tunnelLabel(t: Tunnel): string {
  const rh = tunnelRemoteHost(t)
  return `:${t.local} → ${rh}:${t.remote}`
}

type TunnelStatus = "disconnected" | "connecting" | "connected" | "error"

type TunnelState = {
  status: TunnelStatus
  host: string
  socketPath: string
  tunnels: Tunnel[]
  errorMessage?: string
}

type PluginOptions = {
  host: string
  identityFile?: string
  forwards?: Array<Tunnel | { local: number; remote: number; remoteHost?: string }>
}

function socketPathForHost(host: string): string {
  const safe = host.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `/tmp/opencode-ssh-${safe}.sock`
}

function startMaster(host: string, sock: string, options?: { identityFile?: string }) {
  return Bun.spawn([
    "ssh",
    "-M",
    "-N",
    "-S", sock,
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=4",
    "-o", "ControlPersist=yes",
    ...(options?.identityFile ? ["-i", options.identityFile] : []),
    host,
  ], {
    stderr: "pipe",
  })
}

function addForward(sock: string, host: string, local: number, remote: number, remoteHost?: string) {
  const rh = remoteHost || "localhost"
  const result = Bun.spawnSync([
    "ssh", "-S", sock, "-O", "forward",
    "-L", `${local}:${rh}:${remote}`, host,
  ])
  return result.exitCode === 0
}

function removeForward(sock: string, host: string, local: number, remote: number, remoteHost?: string) {
  const rh = remoteHost || "localhost"
  const result = Bun.spawnSync([
    "ssh", "-S", sock, "-O", "cancel",
    "-L", `${local}:${rh}:${remote}`, host,
  ])
  return result.exitCode === 0
}

function stopMaster(sock: string, host: string) {
  Bun.spawnSync(["ssh", "-S", sock, "-O", "exit", host])
}

function isAlive(sock: string, host: string): boolean {
  const result = Bun.spawnSync(["ssh", "-S", sock, "-O", "check", host])
  return result.exitCode === 0
}

function TunnelView(props: { api: TuiPluginApi; state: () => TunnelState; onAdd: () => void; onRemove: () => void }) {
  const [open, setOpen] = createSignal(true)
  const theme = () => props.api.theme.current
  const s = () => props.state()

  const statusIcon = () => {
    switch (s().status) {
      case "connected": return { icon: "●", color: theme().success }
      case "connecting": return { icon: "○", color: theme().warning }
      case "disconnected": return { icon: "✕", color: theme().error }
      case "error": return { icon: "!", color: theme().error }
    }
  }

  const statusLabel = () => {
    switch (s().status) {
      case "connected": return "connected"
      case "connecting": return "connecting"
      case "disconnected": return "disconnected"
      case "error": return "error"
    }
  }

  return (
    <box>
      <box flexDirection="row" gap={1} onMouseDown={() => setOpen(x => !x)}>
        <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
        <text fg={theme().text}>
          <b>SSH Tunnel</b>
          <Show when={!open()}>
            <span style={{ fg: theme().textMuted }}>
              {" "}{statusIcon().icon} {s().host}
              <Show when={s().tunnels.length > 0}>
                {" "}({s().tunnels.length} forward{s().tunnels.length > 1 ? "s" : ""})
              </Show>
            </span>
          </Show>
        </text>
      </box>

      <Show when={open()}>
        <box paddingTop={1}>
          <box flexDirection="row" gap={1}>
            <text style={{ fg: statusIcon().color }}>{statusIcon().icon}</text>
            <text fg={theme().text}>
              <span style={{ fg: statusIcon().color }}>{statusLabel()}</span>
              {" "}
              <span style={{ fg: theme().textMuted }}>{s().host}</span>
            </text>
          </box>

          <Show when={s().status === "error" && s().errorMessage}>
            <text fg={theme().error}>{s().errorMessage}</text>
          </Show>

          <Show when={s().tunnels.length > 0}>
            <box paddingTop={1}>
              <For each={s().tunnels}>
                {(t) => (
                  <box flexDirection="row" gap={1}>
                    <text fg={theme().textMuted}>  :{t.local}</text>
                    <text fg={theme().textMuted}>{"→"}</text>
                    <text fg={theme().textMuted}>{tunnelRemoteHost(t)}:{t.remote}</text>
                  </box>
                )}
              </For>
            </box>
          </Show>

          <Show when={s().status === "connected" || s().tunnels.length > 0}>
            <box paddingTop={1} flexDirection="row" gap={1}>
              <box
                border={true}
                borderStyle="round"
                borderColor={theme().primary}
                paddingLeft={1}
                paddingRight={1}
                onMouseUp={() => props.onAdd()}
              >
                <text fg={theme().primary}>ADD</text>
              </box>
              <Show when={s().tunnels.length > 0}>
                <box
                  border={true}
                  borderStyle="round"
                  borderColor={theme().textMuted}
                  paddingLeft={1}
                  paddingRight={1}
                  onMouseUp={() => props.onRemove()}
                >
                  <text fg={theme().textMuted}>REMOVE</text>
                </box>
              </Show>
            </box>
          </Show>
        </box>
      </Show>
    </box>
  )
}

function showAddDialog(api: TuiPluginApi, getState: () => TunnelState, setState: (fn: (prev: TunnelState) => TunnelState) => void) {
  const fields = [
    { key: "localPort" as const, label: "Local Port", placeholder: "Local port", default: "" },
    { key: "remoteHost" as const, label: "Remote Host", placeholder: "localhost", default: "localhost" },
    { key: "remotePort" as const, label: "Remote Port", placeholder: "Remote port", default: "" },
  ]

  const form: Record<string, string> = {
    localPort: "",
    remoteHost: "localhost",
    remotePort: "",
  }
  let active = 0

  function render() {
    const field = fields[active]
    const theme = api.theme.current

    api.ui.dialog.replace(() => (
      <api.ui.DialogPrompt
        title="Add Port Forward"
        description={() => (
          <box flexDirection="column" gap={1} paddingBottom={1}>
            {fields.map((f, i) => (
              <box flexDirection="row" gap={1}>
                <text fg={i === active ? theme.primary : theme.textMuted}>
                  {i === active ? "▸" : " "}
                </text>
                <text fg={i === active ? theme.text : theme.textMuted}>
                  {f.label}: {form[f.key] || f.placeholder}
                </text>
              </box>
            ))}
          </box>
        )}
        placeholder={field.placeholder}
        value={form[field.key]}
        onConfirm={(value) => {
          form[field.key] = value.trim() || field.default

          if (active < fields.length - 1) {
            if (field.key === "localPort" && !form.remotePort) {
              form.remotePort = form.localPort
            }
            active++
            render()
          } else {
            const local = Number(form.localPort)
            const remote = Number(form.remotePort)
            const rh = form.remoteHost || "localhost"
            if (!local || isNaN(local)) {
              api.ui.toast({ variant: "error", message: "Invalid local port" })
              return
            }
            if (!remote || isNaN(remote)) {
              api.ui.toast({ variant: "error", message: "Invalid remote port" })
              return
            }
            const s = getState()
            const ok = addForward(s.socketPath, s.host, local, remote, rh)
            if (!ok) {
              api.ui.toast({ variant: "error", message: `Port ${local} is already in use or forward failed` })
              api.ui.dialog.clear()
              return
            }
            const tunnel: Tunnel = { local, remote }
            if (rh !== "localhost") tunnel.remoteHost = rh
            setState((prev) => ({
              ...prev,
              tunnels: [...prev.tunnels, tunnel],
            }))
            api.ui.toast({ variant: "success", message: `Forward :${local} → ${rh}:${remote}` })
            api.ui.dialog.clear()
          }
        }}
        onCancel={() => api.ui.dialog.clear()}
      />
    ))
  }

  render()
}

function showRemoveDialog(api: TuiPluginApi, getState: () => TunnelState, setState: (fn: (prev: TunnelState) => TunnelState) => void) {
  const state = getState()
  if (state.tunnels.length === 0) {
    api.ui.toast({ variant: "info", message: "No forwards to remove" })
    return
  }

  const options = state.tunnels.map((t) => ({
    title: tunnelLabel(t),
    value: t,
  }))

  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect<Tunnel>
      title="Remove Port Forward"
      options={options}
      onSelect={(opt) => {
        const t = opt.value
        const s = getState()
        api.ui.dialog.replace(() => (
          <api.ui.DialogConfirm
            title="Remove Port Forward"
            message={`Remove ${tunnelLabel(t)}?`}
            onConfirm={() => {
              removeForward(s.socketPath, s.host, t.local, t.remote, t.remoteHost)
              setState((prev) => ({
                ...prev,
                tunnels: prev.tunnels.filter(
                  (x) => !(x.local === t.local && x.remote === t.remote && tunnelRemoteHost(x) === tunnelRemoteHost(t)),
                ),
              }))
              api.ui.toast({ variant: "success", message: `Removed forward :${t.local}` })
              api.ui.dialog.clear()
            }}
            onCancel={() => api.ui.dialog.clear()}
          />
        ))
      }}
    />
  ))
}

function reconnect(getState: () => TunnelState, setState: (fn: (prev: TunnelState) => TunnelState) => void, options: PluginOptions) {
  const s = getState()
  stopMaster(s.socketPath, s.host)
  setState((prev) => ({ ...prev, status: "connecting", errorMessage: undefined }))

  try {
    const proc = startMaster(s.host, s.socketPath, { identityFile: options.identityFile })

    setTimeout(() => {
      const current = getState()
      if (isAlive(current.socketPath, current.host)) {
        const tunnels = [...current.tunnels]
        const failed: Tunnel[] = []
        for (const t of tunnels) {
          const ok = addForward(current.socketPath, current.host, t.local, t.remote, t.remoteHost)
          if (!ok) failed.push(t)
        }
        setState((prev) => ({
          ...prev,
          status: "connected",
          tunnels: tunnels.filter(
            (t) => !failed.some((f) => f.local === t.local && f.remote === t.remote && tunnelRemoteHost(f) === tunnelRemoteHost(t)),
          ),
        }))
      } else {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: "Failed to connect",
        }))
        try { proc.kill() } catch {}
      }
    }, 2000)
  } catch (err: any) {
    setState((prev) => ({
      ...prev,
      status: "error",
      errorMessage: err?.message ?? "Failed to start SSH",
    }))
  }
}

const tui: TuiPlugin = async (api, rawOptions, _meta) => {
  const options = rawOptions as PluginOptions | undefined
  const host = options?.host
  const identityFile = options?.identityFile
  const initialForwards = options?.forwards ?? []

  if (process.platform === "win32") {
    api.slots.register({
      id: "ssh-tunnel",
      order: 250,
      slots: {
        sidebar_content() {
          return (
            <box>
              <text fg={api.theme.current.error}>SSH Tunnel</text>
              <text fg={api.theme.current.textMuted}>Not supported on Windows</text>
            </box>
          )
        },
      },
    })
    return
  }

  const sock = socketPathForHost(host ?? "unknown")

  const [getState, setState] = createSignal<TunnelState>({
    status: "disconnected",
    host: host ?? "",
    socketPath: sock,
    tunnels: [],
    errorMessage: undefined,
  })

  if (!host) {
    api.slots.register({
      id: "ssh-tunnel",
      order: 250,
      slots: {
        sidebar_content() {
          return (
            <box>
              <text fg={api.theme.current.textMuted}>SSH Tunnel</text>
              <text fg={api.theme.current.textMuted}>Configure SSH host in opencode.json</text>
            </box>
          )
        },
      },
    })
    return
  }

  let masterProc: ReturnType<typeof Bun.spawn> | null = null
  let healthInterval: ReturnType<typeof setInterval> | null = null

  const doConnect = () => {
    setState((prev) => ({ ...prev, status: "connecting", errorMessage: undefined }))

    try {
      masterProc = startMaster(host, sock, { identityFile })

      setTimeout(() => {
        if (isAlive(sock, host)) {
          setState((prev) => ({ ...prev, status: "connected" }))

          const currentTunnels = getState().tunnels.length > 0
            ? getState().tunnels
            : initialForwards

          const failed: Tunnel[] = []
          for (const t of currentTunnels) {
            const ok = addForward(sock, host, t.local, t.remote, t.remoteHost)
            if (!ok) failed.push(t)
          }

          setState((prev) => ({
            ...prev,
            tunnels: currentTunnels.filter(
              (t) => !failed.some((f) => f.local === t.local && f.remote === t.remote && tunnelRemoteHost(f) === tunnelRemoteHost(t)),
            ),
          }))

          if (failed.length > 0) {
            api.ui.toast({
              variant: "warning",
              message: `Failed to forward port(s): ${failed.map((f) => f.local).join(", ")}`,
            })
          }
        } else {
          setState((prev) => ({
            ...prev,
            status: "error",
            errorMessage: "Failed to connect",
          }))
          try { masterProc?.kill() } catch {}
        }
      }, 2000)
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: err?.message ?? "Failed to start SSH",
      }))
    }
  }

  const doReconnect = () => {
    reconnect(getState, setState, { host, identityFile })
  }

  healthInterval = setInterval(() => {
    const s = getState()
    if (s.status === "connected" || s.status === "error") {
      if (!isAlive(sock, host)) {
        api.ui.toast({ variant: "warning", message: "SSH tunnel disconnected, reconnecting..." })
        doReconnect()
      }
    }
  }, 10_000)

  doConnect()

  api.slots.register({
    id: "ssh-tunnel",
    order: 250,
    slots: {
      sidebar_content() {
        return (
          <TunnelView
            api={api}
            state={getState}
            onAdd={() => showAddDialog(api, getState, setState)}
            onRemove={() => showRemoveDialog(api, getState, setState)}
          />
        )
      },
    },
  })

  api.keymap.registerLayer({
    priority: 100,
    commands: [
      {
        name: "tunnel.add",
        title: "Add port forward",
        category: "SSH Tunnel",
        namespace: "palette",
        run() {
          showAddDialog(api, getState, setState)
        },
      },
      {
        name: "tunnel.remove",
        title: "Remove port forward",
        category: "SSH Tunnel",
        namespace: "palette",
        run() {
          showRemoveDialog(api, getState, setState)
        },
      },
      {
        name: "tunnel.reconnect",
        title: "Reconnect SSH tunnel",
        category: "SSH Tunnel",
        namespace: "palette",
        run() {
          doReconnect()
        },
      },
    ],
  })

  api.lifecycle.onDispose(() => {
    if (healthInterval) clearInterval(healthInterval)
    stopMaster(sock, host)
    try { masterProc?.kill() } catch {}
  })
}

export default { id: "ssh-tunnel", tui }
