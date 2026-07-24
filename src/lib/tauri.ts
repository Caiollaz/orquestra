import { invoke, Channel } from "@tauri-apps/api/core";

// espelha o enum AgentCmd do Rust (tag "kind", enum rename_all camelCase → claude/shell)
export type AgentCmd =
  | { kind: "claude"; extra_args: string[] }
  | { kind: "shell"; program: string | null };

export function spawnAgent(
  agentId: string,
  cmd: AgentCmd,
  cwd: string,
  cols: number,
  rows: number,
  onBytes: (bytes: Uint8Array) => void,
): Promise<void> {
  const ch = new Channel<number[]>();
  ch.onmessage = (bytes) => onBytes(new Uint8Array(bytes));
  return invoke("spawn_agent", { agentId, cmd, cwd, cols, rows, onBytes: ch });
}

export const writeStdin = (agentId: string, data: string) =>
  invoke<void>("write_stdin", { agentId, data });
export const resizePty = (agentId: string, cols: number, rows: number) =>
  invoke<void>("resize_pty", { agentId, cols, rows });
export const killAgent = (agentId: string) =>
  invoke<void>("kill_agent", { agentId });
export const forwardOutput = (toAgent: string, text: string) =>
  invoke<void>("forward_output", { toAgent, text });
