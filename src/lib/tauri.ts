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
/// ids dos agentes com PTY vivo (o front usa pra não semear contexto duas vezes)
export const liveAgents = () => invoke<string[]>("live_agents");

// ── papéis (roles.rs) ───────────────────────────────────────────────
export type Role = { file: string; name: string; agent: string; description: string; body: string };
export const listRoles = (repoPath: string) => invoke<Role[]>("list_roles", { repoPath });
export const saveRole = (repoPath: string, role: Role) => invoke<void>("save_role", { repoPath, role });
export const deleteRole = (repoPath: string, file: string) => invoke<void>("delete_role", { repoPath, file });
export const applyRole = (agentId: string, role: Role, vars: Record<string, string> = {}) =>
  invoke<void>("apply_role", { agentId, role, vars });

// ── contextos (contexts.rs) ─────────────────────────────────────────
// Contexto = bloco de conhecimento (regras de negócio, arquitetura, contratos)
// empilhável em qualquer agente. Papel = quem o agente é; contexto = o que sabe.
export type Context = { file: string; name: string; description: string; body: string };
export const listContexts = (repoPath: string) => invoke<Context[]>("list_contexts", { repoPath });
export const saveContext = (repoPath: string, context: Context) => invoke<void>("save_context", { repoPath, context });
export const deleteContext = (repoPath: string, file: string) => invoke<void>("delete_context", { repoPath, file });
export const applyContexts = (agentId: string, contexts: Context[], vars: Record<string, string> = {}) =>
  invoke<void>("apply_contexts", { agentId, contexts, vars });

// ── floors / worktrees (git.rs) ─────────────────────────────────────
export type Floor = { slug: string; branch: string; path: string };
export const createFloor = (repoPath: string, slug: string) => invoke<Floor>("create_floor", { repoPath, slug });
/// sem `force`, o Rust recusa remover floor com trabalho não commitado (regra 8)
export const removeFloor = (repoPath: string, slug: string, force = false) =>
  invoke<void>("remove_floor", { repoPath, slug, force });

// ── workspaces (workspace.rs) ───────────────────────────────────────
export type Viewport = { x: number; y: number; zoom: number };
export type WsAgent = {
  id: string; label: string; roleFile?: string | null; cmd: AgentCmd; cwd: string;
  floorSlug?: string | null; x: number; y: number; w: number; h: number;
};
export type WorkspaceMeta = { id: string; name: string; repoPath: string };
// estado serializado do canvas (nós de todo tipo + arestas) — opaco pro Rust
export type CanvasNode = { id: string; type: string; x: number; y: number; w?: number; h?: number; data: Record<string, unknown> };
export type CanvasState = { nodes: CanvasNode[]; edges: { id: string; source: string; target: string }[] };

export type Workspace = {
  id: string; name: string; repoPath: string; createdAt?: string;
  viewport: Viewport; agents: WsAgent[]; floors: Floor[];
  canvas?: CanvasState | null;
};
export const listWorkspaces = () => invoke<WorkspaceMeta[]>("list_workspaces");
export const loadWorkspace = (id: string) => invoke<Workspace>("load_workspace", { id });
export const saveWorkspace = (workspace: Workspace) => invoke<void>("save_workspace", { workspace });
export const deleteWorkspace = (id: string) => invoke<void>("delete_workspace", { id });

// ── editor externo (editor.rs) ──────────────────────────────────────
export const openEditor = (path: string, editor?: string) =>
  invoke<void>("open_editor", { path, editor: editor ?? null });
