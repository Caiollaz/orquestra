# Contexto: Arquitetura do orquestra

App desktop Tauri 2. Backend Rust (`src-tauri/src/`) expõe commands; frontend
React 19 + TS + Vite (`src/`) consome via wrappers em `src/lib/tauri.ts` — nada
chama `invoke` direto. Todo command registrado em `src-tauri/src/lib.rs`.

## Backend (Rust) — um módulo por feature
- **pty.rs** — coração. `spawn_agent` abre um PTY (portable-pty), spawna o
  programa e cria **UMA thread OS por agente** (read bloqueante de 16KB)
  streamando bytes crus pro front via `Channel<Vec<u8>>`. Também:
  `write_stdin`, `resize_pty`, `kill_agent`, `check_prereqs`,
  `forward_output` (stdin de outro agente, bracketed-paste = submissão única),
  e o **PATH aumentado** que todo spawn do app usa.
- **roles.rs** — papéis: `<repo>/.orquestra/roles/*.md` (frontmatter
  `name/agent/description` + corpo com `{{var}}`). `apply_role` renderiza e
  semeia. Puras: `slugify`, `render_template`, `parse_role`, `split_frontmatter`.
- **contexts.rs** — contextos: `<repo>/.orquestra/contexts/*.md`. Sem
  frontmatter, o primeiro `# título` vira o nome. `apply_contexts` compõe
  **todos os blocos numa submissão só**. Corpo vai *verbatim*, sem
  `render_template` — documentação cita `{{var}}` e o render apagava o trecho.
- **workspace.rs** — persistência em `~/.orquestra/` (`index.json` +
  `workspaces/<id>.json`). O campo `canvas` é `serde_json::Value` **opaco**: o
  front define o shape, o Rust só guarda. Escrita atômica (tmp + rename).
  `ORQUESTRA_HOME` sobrescreve a base (testes usam; é global do processo, então
  testes que setam compartilham um `Mutex`).
- **git.rs** — floors = `git worktree` em `<repo>/.orquestra/worktrees/<slug>`,
  branch `orquestra/<slug>`. Git por subprocess, não lib.
- **editor.rs** — abre editor externo (code/cursor/zed/subl) reusando o PATH
  aumentado.

## Frontend (React)
- **App.tsx** (~1000 linhas) — dono único do estado do canvas: nós, arestas,
  workspaces, floors, contextos, diálogos, roteamento entre agentes, autosave
  (debounce 1.2s). Mantém `useState` **e um espelho em `useRef`**
  (`nodesRef`/`edgesRef`/`contextsRef`/`defaultsRef`) porque a saída do PTY chega
  por Channel, fora do ciclo de render — closure de estado ficaria velha.
  `zustand` é dependência mas **não é usado**: não presuma que existe store.
- **Canvas**: `@xyflow/react` (React Flow). 4 tipos de nó, num mapa só em
  `App.tsx`: `agent` (XtermView), `note`, `mermaid` (diagrama), `portal`
  (iframe). As
  **arestas são o grafo de roteamento** — nó só fala com quem está conectado.
- **XtermView.tsx** — xterm + addon-fit, **renderer DOM** (nem canvas nem
  webgl: texto real escala nítido no zoom; o canvas addon virava bitmap
  borrado). Instâncias vivem **fora do React**, em Maps de `shared.ts`
  (`terminals`, `noteText`). `IDLE_MS = 1000`: 1s sem output → `onIdle(id)`.
- **Island.tsx** (atividades ao vivo), **Sidebar.tsx** (workspaces),
  **Batuta.tsx** (paleta, Ctrl+K), **Dialog.tsx**/**ContextMenu.tsx** (nada de
  `alert`/`prompt` nativo), **Welcome.tsx** (`check_prereqs`).

## Fluxo de uma mensagem entre agentes
saída do PTY → thread OS → Channel → `term.write` + debounce de idle →
`handleIdle` lê as linhas novas do buffer → casa a regex `ROTA` (`⇢NOME: msg`) →
resolve o destino pelos edges → `forward_output` → bracketed-paste no stdin do
destino. Detalhe do protocolo: contexto **Protocolo de roteamento**.
