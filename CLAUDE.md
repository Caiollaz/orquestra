# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Orquestra — desktop agent orchestrator (Tauri 2). Infinite canvas of draggable
nodes; each node is an **interactive PTY terminal** running an agent CLI
(`claude`, `codex`, `opencode`, `antigravity`) or a shell, and the agents talk to
each other. Model inspired by [Maestri](https://www.themaestri.app).

**Codebase, UI and commits are in Portuguese (pt-BR)** — match that.

## The docs live in `.orquestra/contexts/`

That directory is this project's real documentation, and the app **seeds those
files into every agent it spawns**. So: one fact, one owner. Don't restate them
here or in a new `docs/` file — fix the context instead.

| Read this | When |
|---|---|
| `regras-de-negocio.md` | always — the 11 rules the product doesn't break |
| `arquitetura.md` | orienting: module map, data flow, who owns state |
| `protocolo.md` | anything touching `⇢NOME:`, seeding, echo, labels |
| `contratos.md` | anything spanning Rust↔JS, persistence, spawning |
| `receitas.md` | adding a command, node type, agent CLI, preset, dialog |
| `armadilhas.md` | before "simplifying" something — past bugs, don't regress |

`docs/PRE-REQUISITOS.md` is user-facing (installing the CLIs). `ROADMAP.md` is
status + what's next.

## Commands

Uses **pnpm**. In a GUI-less shell `pnpm` may not be on PATH — it lives in
`~/.nvm/versions/node/<ver>/bin`.

- `pnpm tauri dev` — run the app (Tauri spawns `pnpm dev` / Vite on fixed port 1420).
- `pnpm build` — `tsc && vite build`. No lint step; `tsc` is the type gate.
- `pnpm tauri build` — full desktop bundle.
- `cd src-tauri && cargo test` — 22 Rust tests. Single: `cargo test agent_cmd_contrato_front`.

Before committing: `cargo test` + `pnpm build`. There are no frontend tests —
verify UI in `pnpm tauri dev`.

**Release:** bump the version in four files that must agree (`package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`),
then tag `v<version>`; CI builds the installers.

## Top invariants (the rest is in the contexts)

1. **`.orquestra/roles/` and `contexts/` are versioned**; everything else under
   `.orquestra/` (worktrees, `board.md`) is ignored.
2. **Never `git add -A`** — more than one agent edits this repo at once. Stage
   by file, and check `.orquestra/board.md` before starting.
3. Any new path that sends text into an agent must go through
   `forward_output_to` (which filters via `bracketed_safe`) **and** call
   `rememberSent` first, or a context documenting the `⇢` protocol executes for
   real. See `protocolo.md`.
4. Never offer role/context seeding on a shell node: markdown would run as
   commands. `isLLM(cmd)` is the single place that distinction lives.
5. Changing `AgentCmd` means changing `pty.rs`, `src/lib/tauri.ts` **and** the
   `agent_cmd_contrato_front` test.

## Writing code here

Match the surrounding style: dense pt-BR comments that explain **why** (the
tradeoff, the bug this prevents), not what. New pure logic gets a test in the
style of `roles.rs`/`git.rs` — the logic ported from the prior `agentdesk`
project is validated here, not just in the app.
