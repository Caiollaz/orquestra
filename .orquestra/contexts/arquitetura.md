# Contexto: Arquitetura do orquestra

App desktop Tauri 2. Backend Rust (src-tauri/src/) expõe commands; frontend
React 19 + TS + Vite (src/) consome via wrappers em src/lib/tauri.ts.
Todos os commands registrados em src-tauri/src/lib.rs.

## Backend (Rust)
- pty.rs — coração do app. spawn_agent abre um PTY (portable-pty), spawna
  claude/shell e cria UMA thread OS por agente (read bloqueante de 16KB)
  streamando bytes crus pro front via Channel<Vec<u8>>. write_stdin /
  resize_pty / kill_agent. forward_output escreve no stdin de outro agente
  com bracketed-paste (\x1b[200~…\x1b[201~\r) = uma submissão única.
- roles.rs — papéis em <repo>/.orquestra/roles/*.md (frontmatter
  name/agent/description + corpo com {{var}}). apply_role renderiza e semeia
  no stdin do agente. Funções puras: slugify, render_template, parse_role.
- workspace.rs — persistência em ~/.orquestra/ (index.json + workspaces/<id>.json).
  Campo `canvas` é serde_json::Value OPACO: o front serializa todos os nós/arestas,
  o Rust só guarda. ORQUESTRA_HOME sobrescreve a base (testes usam).
- git.rs — floors = git worktree em <repo>/.orquestra/worktrees/<slug>, branch
  orquestra/<slug>. Git via subprocess, não lib.
- editor.rs — abre editor externo (code/cursor/zed/subl) reusando o PATH
  aumentado do pty.rs.

## Frontend (React)
- App.tsx — orquestra tudo: estado nodes/edges (useState + refs espelhando pra
  callbacks), roteamento de mensagens entre agentes, workspaces, autosave
  (debounce 1.2s + flush no beforeunload), menus de contexto.
- Canvas: @xyflow/react (React Flow). Tipos de nó: agent (XtermView), note,
  shape, portal (iframe). nodeTypes em App.tsx.
- XtermView.tsx — xterm + addon-canvas (NÃO webgl: estoura contextos com N
  terminais). Instâncias vivem FORA do React em Maps de shared.ts
  (terminals, noteText). Idle = 1s sem output → onIdle(id).
- Comunicação: handleIdle lê linhas novas do buffer do xterm, casa
  ⇢NOME: msg e roteia pelos edges. Shell recebe texto cru; claude recebe
  "(de X) msg"; portal navega URL; ⇢nota: escreve na nota.
