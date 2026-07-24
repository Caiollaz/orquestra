# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Orquestra — desktop agent orchestrator (Tauri 2). Infinite canvas of draggable nodes; each node is an **interactive PTY terminal** running `claude` or a shell. Model inspired by [Maestri](https://www.themaestri.app). Codebase and UI are in **Portuguese (pt-BR)** — match that in comments/UI strings.

Design rationale, milestones (M0–M6), and the data model live in `PLAN.md`. Read it before non-trivial work.

## Commands

Uses **pnpm**. In a GUI-less shell `pnpm` may not be on PATH — it lives in
`~/.nvm/versions/node/<ver>/bin`.

- `pnpm tauri dev` — run the app (Tauri spawns `pnpm dev` / Vite on fixed port 1420).
- `pnpm build` — `tsc && vite build` (frontend only; type-checks then bundles to `dist/`).
- `pnpm tauri build` — full desktop bundle.
- `cd src-tauri && cargo test` — Rust unit tests (pure functions + integration).
- Single Rust test: `cd src-tauri && cargo test agent_cmd_contrato_front` (or any test name).

## Architecture

Rust backend (`src-tauri/src/`) exposes Tauri commands; React 19 + TS frontend (`src/`) drives them. All commands are registered in `lib.rs`; the JS wrappers live in `src/lib/tauri.ts`.

### Roles vs contexts (don't conflate them)

Two separate primitives, both markdown seeded into an agent's stdin:

- **Role** (`roles.rs`, `<repo>/.orquestra/roles/*.md`) — *who the agent is*. One
  per agent. Frontmatter `name/agent/description`. Applied via `apply_role`.
- **Context** (`contexts.rs`, `<repo>/.orquestra/contexts/*.md`) — *what it needs
  to know* (business rules, architecture, contracts). Several per agent,
  stackable. Frontmatter optional: without it the first `# heading` becomes the
  name. Applied via `apply_contexts`, which composes **all blocks into one
  submission** — two bracketed-pastes back to back trample each other in
  claude's prompt.

A workspace has **default contexts** (`canvas.defaultContexts`): every new claude
agent gets them automatically on its *second* idle (the first carries the
`⇢NOME:` protocol prompt). That ordering is the whole point — don't merge them.

`.orquestra/roles/` and `.orquestra/contexts/` are **versioned**; everything else
under `.orquestra/` (worktrees, `board.md`) is ignored.

### PTY lifecycle (`pty.rs` + `XtermView.tsx`)

- `spawn_agent` opens a PTY, spawns the command, and starts **one dedicated OS thread per agent** (blocking `read` of 16KB) that streams raw bytes to the frontend via a Tauri `Channel<Vec<u8>>`. xterm writes them directly.
- Terminal instances live **outside React**, in module-level Maps in `src/shared.ts` (`terminals`, `noteText`) — the send button reads a node's live selection from there.
- Cleanup is layered: unmounting `XtermView` calls `kill_agent`; closing the app fires `RunEvent::ExitRequested` → `PtyState::kill_all()`. No orphaned child processes.
- **PATH augmentation** (`augmented_path`): GUI apps don't inherit the login shell's PATH, so `claude` in `~/.local/bin` etc. won't resolve. The augmented PATH is both used to resolve the program *and* passed as `PATH` env to the child, so claude's own subprocesses see it too.

### IPC contract (must stay in sync)

`AgentCmd` is a serde enum with `#[serde(tag = "kind", rename_all = "camelCase")]` in `pty.rs`. Its JSON shape (`{"kind":"shell","program":null}` / `{"kind":"claude","extra_args":[]}`) is mirrored by hand in `src/lib/tauri.ts` and guarded by the `agent_cmd_contrato_front` test. Change one side → update the other and that test. Same camelCase convention applies to `Workspace`/`Agent`/`Role`/`Floor` structs.

### Inter-agent communication (`forward_output`)

`forward_output_to` writes text to a target agent's stdin wrapped in **bracketed-paste** (`\x1b[200~…\x1b[201~\r`) so it lands as a single submission. Node→node forwarding, `apply_role` and `apply_contexts` all route through this one function.

Text is passed through `bracketed_safe` first, which strips control characters. A `\x1b[201~` inside the payload would close the paste early and the remainder would land as **raw keystrokes** in the target terminal — command injection from another agent's output, a note, or a context file. Keep that filter on any new path into `forward_output_to`.

Labels are **routing addresses** (`⇢NOME: msg`), so renaming a node has to tell the node itself and every claude pointing at it (`renameNode` in App.tsx), otherwise messages go to a name nobody answers to.

### Persistence & filesystem layout

- Workspaces: `~/.orquestra/` — `index.json` (list) + `workspaces/<id>.json` (full state incl. layout). `workspace.rs`. Override the base dir with the `ORQUESTRA_HOME` env var (tests use it — and it's process-global, so tests that set it share a `Mutex`). Writes are atomic (tmp + rename): autosave fires every 1.2s and a truncated file would cost the user the whole canvas.
- Roles: `<repo>/.orquestra/roles/*.md` — markdown with `name`/`agent`/`description` frontmatter + body with `{{var}}` placeholders. `roles.rs`.
- Floors: git **worktrees** at `<repo>/.orquestra/worktrees/<slug>` on branch `orquestra/<slug>`. Git is invoked as a subprocess (`git.rs`), not a library. `remove_floor` refuses to delete a floor with uncommitted work unless `force` is passed explicitly.

### Tested pure functions

`slugify`, `render_template`, `parse_role`, `split_frontmatter`, `file_ok` (`roles.rs`); `parse_context`, `compose_contexts` (`contexts.rs`); `branch_name`, `worktree_path`, `pending_changes` (`git.rs`); `bracketed_safe` (`pty.rs`); workspace roundtrip + atomic write (`workspace.rs`). 21 tests today. Keep new pure logic testable in the same style — the ported logic (from the prior `agentdesk` project) is validated here, not just in the app.
