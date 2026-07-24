# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Orquestra — desktop agent orchestrator (Tauri 2). Infinite canvas of draggable nodes; each node is an **interactive PTY terminal** running `claude` or a shell. Model inspired by [Maestri](https://www.themaestri.app). Codebase and UI are in **Portuguese (pt-BR)** — match that in comments/UI strings.

Design rationale, milestones (M0–M6), and the data model live in `PLAN.md`. Read it before non-trivial work.

## Commands

Uses **pnpm**. No git repo (`git init` not run yet).

- `pnpm tauri dev` — run the app (Tauri spawns `pnpm dev` / Vite on fixed port 1420).
- `pnpm build` — `tsc && vite build` (frontend only; type-checks then bundles to `dist/`).
- `pnpm tauri build` — full desktop bundle.
- `cd src-tauri && cargo test` — Rust unit tests (pure functions + integration).
- Single Rust test: `cd src-tauri && cargo test agent_cmd_contrato_front` (or any test name).

## Architecture

Rust backend (`src-tauri/src/`) exposes Tauri commands; React 19 + TS frontend (`src/`) drives them. All commands are registered in `lib.rs`; the JS wrappers live in `src/lib/tauri.ts`.

### Backend is ahead of the frontend

**Key gotcha:** the Rust side implements *all* milestones (M1–M6) — PTY, roles, workspaces, floors — each with tests. But `App.tsx` only wires **M1/M2**: spawn shell/claude nodes, note nodes, and `forward_output`. `roles`/`workspace`/`git` commands exist and pass tests but have **no UI yet** (PLAN.md marks M3–M6 ⬜). When adding those features, the backend command + its wrapper likely already exist — wire the UI, don't reimplement.

### PTY lifecycle (`pty.rs` + `XtermView.tsx`)

- `spawn_agent` opens a PTY, spawns the command, and starts **one dedicated OS thread per agent** (blocking `read` of 16KB) that streams raw bytes to the frontend via a Tauri `Channel<Vec<u8>>`. xterm writes them directly.
- Terminal instances live **outside React**, in module-level Maps in `src/shared.ts` (`terminals`, `noteText`) — the send button reads a node's live selection from there.
- Cleanup is layered: unmounting `XtermView` calls `kill_agent`; closing the app fires `RunEvent::ExitRequested` → `PtyState::kill_all()`. No orphaned child processes.
- **PATH augmentation** (`augmented_path`): GUI apps don't inherit the login shell's PATH, so `claude` in `~/.local/bin` etc. won't resolve. The augmented PATH is both used to resolve the program *and* passed as `PATH` env to the child, so claude's own subprocesses see it too.

### IPC contract (must stay in sync)

`AgentCmd` is a serde enum with `#[serde(tag = "kind", rename_all = "camelCase")]` in `pty.rs`. Its JSON shape (`{"kind":"shell","program":null}` / `{"kind":"claude","extra_args":[]}`) is mirrored by hand in `src/lib/tauri.ts` and guarded by the `agent_cmd_contrato_front` test. Change one side → update the other and that test. Same camelCase convention applies to `Workspace`/`Agent`/`Role`/`Floor` structs.

### Inter-agent communication (`forward_output`)

`forward_output_to` writes text to a target agent's stdin wrapped in **bracketed-paste** (`\x1b[200~…\x1b[201~\r`) so it lands as a single submission. Both node→node forwarding and `apply_role` (seed a role prompt) route through this one function.

### Persistence & filesystem layout

- Workspaces: `~/.orquestra/` — `index.json` (list) + `workspaces/<id>.json` (full state incl. layout). `workspace.rs`. Override the base dir with the `ORQUESTRA_HOME` env var (tests use it).
- Roles: `<repo>/.orquestra/roles/*.md` — markdown with `name`/`agent`/`description` frontmatter + body with `{{var}}` placeholders. `roles.rs`.
- Floors: git **worktrees** at `<repo>/.orquestra/worktrees/<slug>` on branch `orquestra/<slug>`. Git is invoked as a subprocess (`git.rs`), not a library.

### Tested pure functions

`slugify`, `render_template`, `parse_role` (`roles.rs`); `branch_name`, `worktree_path` (`git.rs`); workspace roundtrip (`workspace.rs`). Keep new pure logic testable in the same style — the ported logic (from the prior `agentdesk` project) is validated here, not just in the app.
