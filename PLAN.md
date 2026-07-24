# Orquestra — orquestrador de agentes (Tauri)

App desktop tipo [Maestri](https://www.themaestri.app): canvas infinito com nós
arrastáveis, cada nó um **terminal PTY interativo** rodando `claude` ou shell.

## Contexto / porquê
Vem do agentdesk (agentflow), que roda `claude -p` headless num pipeline fixo
PO→TL. O usuário quer o modelo Maestri: agentes interativos vivos que você vê e
comanda num canvas, coordenando vários em paralelo. Decisões travadas:
- **Terminais interativos (PTY)**, não headless.
- **Projeto novo standalone** (`dev/test/orquestra`), separado do agentdesk.
- **Rust puro** (sem sidecar Node): `portable-pty`, `git` via shell, JSON via `serde`.
- **v1 = 4 features**: canvas multi-agente · papéis/presets · floors (worktrees) · comunicação entre agentes.

## Stack
- **Tauri 2** (Rust) + **React 19 + TS + Vite**.
- PTY: `portable-pty` (wezterm). Git: shell `git worktree`. Persistência: `serde_json`.
- Terminal: `@xterm/xterm` + addon-fit + **addon-canvas** (não webgl — não estoura contextos).
- Canvas: **`@xyflow/react`** (pan/zoom + nós custom = terminal). State: `zustand` (a partir do M3).

## API Rust↔JS (Tauri commands)
Em `src-tauri/src/pty.rs` (feito no M1/M2):
- `spawn_agent(agentId, cmd, cwd, cols, rows, onBytes: Channel<Vec<u8>>)` — abre PTY, thread OS lê 16KB e streama pelo Channel.
- `write_stdin(agentId, data)` · `resize_pty(agentId, cols, rows)` · `kill_agent(agentId)`.
- `forward_output(toAgent, text)` — bracketed-paste (`\x1b[200~…\x1b[201~\r`) no stdin do destino.
- Fechar app → `PtyState::kill_all()` (RunEvent::ExitRequested), sem órfãos.

A definir (M3+): `list/create/load/save_workspace`, `pick_directory` (tauri-plugin-dialog),
`list/save/delete_role`, `apply_role`, `create_floor/remove_floor`.

## Modelo de dados (M3+)
`Workspace { id, name, repoPath, viewport, agents[], floors[] }` → `~/.orquestra/workspaces/<id>.json` (índice em `index.json`).
`Agent { id, label, roleFile?, cmd, cwd, floorSlug?, x,y,w,h }` (status é transiente).
`Role` = markdown `.orquestra/roles/*.md` (frontmatter name/agent/description + corpo `{{var}}`).
`Floor` = git worktree em `.orquestra/worktrees/<slug>` na branch `orquestra/<slug>`.

## Milestones
- **M0 — scaffold** ✅ create-tauri-app react-ts, deps.
- **M1 — hello PTY** ✅ spawn/stream/stdin/resize/kill via Channel.
- **M2 — canvas multi-agente** ✅ ReactFlow + AgentNode(xterm), + shell / + claude, drag/zoom, kill.
- **M3 — persistência/workspaces** ⬜ index.json + workspaces/<id>.json, pick_directory, restaura layout.
- **M4 — papéis** ⬜ parse `.orquestra/roles/*.md`, RolePicker, apply_role (idle-debounce ~750ms + botão manual).
- **M5 — floors** ⬜ create/remove_floor via `git worktree`, FloorSwitcher, spawn com cwd=floor.
- **M6 — comunicação** ⬜ forward_output entre nós + aresta no ReactFlow.

## Pontos delicados (ver §5 da arquitetura)
- Muitos terminais: **addon-canvas** (não webgl). Thumbnail em zoom baixo só se medir dor.
- Lifecycle: mata filhos no fechar; v1 sem detach/resume.
- Readiness do claude: **idle-debounce + botão "semear agora"**, sem casar string do prompt.
- Scrollback: **não** persiste no v1 (respawn limpo).

## Verificação
- `cargo test` nas funções puras (slug, render `{{var}}`, parse frontmatter, path de worktree).
- `pnpm tauri dev` por milestone. Smoke PTY: agente rodando `cat` ecoa stdin (prova o loop read/write/channel).

## Reaproveitado (conceito, do agentdesk)
- Fluxo de worktree: `agentdesk/api/src/git.ts`.
- Papel markdown + validação: `agentdesk/api/src/agentmgr.ts`, render `{{var}}`: `prompt.ts`.
- Registry JSON: `agentdesk/api/src/registry.ts`.
