# Contexto: Receitas (como adicionar X)

Passo a passo do que este repo já faz. Siga o padrão existente em vez de
inventar um novo.

## Command novo no Rust
1. `fn` com `#[tauri::command]` no módulo da feature (`src-tauri/src/*.rs`).
   Retorne `Result<T, String>` — o front mostra a string no diálogo de erro.
2. Registre em `lib.rs`, dentro do `generate_handler!`.
3. Wrapper tipado em `src/lib/tauri.ts` (camelCase nos argumentos).
4. Se spawnar binário: `resolve_program(nome, &augmented_path())`.
5. Extraia a lógica pura numa função sem I/O e **teste ela** no mesmo estilo dos
   módulos existentes (`roles.rs`, `git.rs`).

## Tipo de nó novo no canvas
1. Componente em `src/`, no padrão de `NoteNode.tsx`/`MermaidNode.tsx`.
2. Registre no mapa `nodeTypes` de `App.tsx`.
3. **Serialize** no `switch` do `buildWorkspace` e **restaure** no `switch` do
   `doLoad` — os dois. Faltou um → o nó some no reload, calado.
4. Criação: menu do click direito (`paneContext`) e Batuta.
5. Se for destino de rota, ensine o `handleIdle` e o aviso `(sistema)` da
   conexão (ver contexto do protocolo).
6. Toda mutação chama `dirty()`.

## CLI de agente novo (tipo codex/opencode)
1. Entrada em `CLIS` (`App.tsx`): `{ program, label, hint }` — `program` é o
   binário real (antigravity é `agy`).
2. Nada de Rust: `AgentCmd::Agent { program, extra_args }` já cobre. Se você
   está escrevendo uma variante nova de `AgentCmd`, provavelmente errou.
3. `isLLM()` já inclui `kind === "agent"` — o CLI recebe protocolo, contextos,
   notas, papéis e avisos igual ao claude.
4. Confira que o binário resolve no PATH aumentado (`check_prereqs` cobre só
   claude/node/git).

## Papel novo pronto (preset)
Entrada em `role-presets.ts`. Todo preset fala o protocolo `⇢NOME:` — copie o
rodapé dos existentes. Um clique salva em `.orquestra/roles/` e aplica.

## Contexto novo (arquivo deste tipo)
1. `.orquestra/contexts/<slug>.md`, primeiro `# título` vira o nome (frontmatter
   é opcional).
2. **Enxuto**: todos os contextos escolhidos vão numa submissão só, teto de 16KB
   (`MAX_PASTE`). Os 6 arquivos de hoje somam ~18KB — **não dá pra semear todos
   de uma vez**. Padrões do workspace sugeridos: `regras-de-negocio` +
   `protocolo` + `contratos` (~9KB); `arquitetura`, `receitas` e `armadilhas`
   por agente, conforme a tarefa.
3. Corpo vai *verbatim* — pode citar `{{var}}` sem medo.
4. Versionado (o `.gitignore` abre exceção pra `roles/` e `contexts/`): contexto
   não commitado não serve pra quem clona.

## Diálogo / menu na UI
Nada de `alert`/`confirm`/`prompt` nativo: use `Dialog.tsx` (`askText`,
`alertMsg`, confirmação) e `ContextMenu.tsx`. Exceção única: o seletor de pasta
(plugin nativo do SO). Envolva todo `await askText` com guarda de `wsId` — o
usuário pode trocar de workspace com o modal aberto.

## Ícone
`react-icons`, importado direto do componente — nada de wrapper. Família
padrão: **Phosphor** (`react-icons/pi`); só saia dela quando for logo de marca
(`SiClaude`, `SiGooglegemini`, `RiOpenaiFill`) — agente com logo próprio não
vira robô genérico. Herdam cor por `currentColor` e tamanho pelo CSS
(`.ib svg`, `.ctx-ico svg`, `.agent-btn svg`); use a prop `size` só onde não há
regra de CSS mandando (ex.: `.sb-badge`). Mapas centrais: `icons` em `App.tsx`
(island/menus/batuta) e `ni` em `node-icons.tsx` (headers de nó).
