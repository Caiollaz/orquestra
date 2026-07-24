# Contexto: Contratos & pegadinhas (leia antes de mexer)

## Contratos que quebram silenciosamente
1. IPC Rust↔JS: AgentCmd é serde enum com tag "kind" camelCase
   ({"kind":"shell","program":null} / {"kind":"claude","extra_args":[]}).
   Espelhado À MÃO em src/lib/tauri.ts e guardado pelo teste
   agent_cmd_contrato_front. Mudou um lado → muda o outro + o teste.
   Mesmo camelCase vale pra Workspace/Agent/Role/Floor.
2. Campo canvas do workspace: o FRONT define o shape (CanvasState em
   tauri.ts); Rust guarda opaco. Adicionar tipo de nó novo = serializar em
   buildWorkspace + restaurar em doLoad (App.tsx), senão o nó some no reload.
3. Command novo no Rust exige 3 passos: fn em src-tauri/src/*.rs +
   registro em lib.rs (generate_handler) + wrapper em src/lib/tauri.ts.

## Pegadinhas de ambiente
4. PATH de GUI ≠ PATH do shell de login: app gráfico não vê ~/.local/bin etc.
   SEMPRE usar augmented_path()/resolve_program() do pty.rs pra spawnar
   qualquer binário (claude, git, editor). O PATH aumentado também é passado
   como env pro filho.
5. xterm usa addon-canvas, não webgl (muitos terminais = estouro de contexto).
6. Instâncias de terminal e texto de nota vivem FORA do React
   (shared.ts: terminals/noteText Maps). Não mover pra estado React.
7. Callbacks em nodes leem nodesRef/edgesRef (refs espelhando estado), não o
   estado direto — senão closure velha.
8. Mutação de canvas deve chamar dirty() (autosave). setNodes direto sem
   dirty() = mudança que não persiste.

## Verificação
9. cd src-tauri && cargo test (9 testes, funções puras + contrato).
   pnpm build = tsc + vite (type-check obrigatório antes de commit).
10. Testes de workspace usam ORQUESTRA_HOME apontando pra tmp — nunca tocar
    ~/.orquestra real em teste.
11. Smoke manual: pnpm tauri dev → criar claude+shell, ligar aresta, pedir
    "rode ls no terminal" → comando tem que executar NO shell (aresta acende).
