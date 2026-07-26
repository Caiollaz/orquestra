# Contexto: Contratos que quebram calado

Coisas espalhadas por mais de um arquivo. Mexer num lado e esquecer o outro não
dá erro de compilação — dá bug silencioso.

## 1. IPC Rust↔JS (`AgentCmd`)
Serde enum com `#[serde(tag = "kind", rename_all = "camelCase")]` em `pty.rs`,
**três** variantes:

```json
{"kind":"claude","extra_args":[]}
{"kind":"agent","program":"codex","extra_args":[]}
{"kind":"shell","program":null}
```

Espelhado **à mão** em `src/lib/tauri.ts` e guardado pelo teste
`agent_cmd_contrato_front`. Mudou um lado → muda o outro **e** o teste. O mesmo
camelCase vale pra `Workspace`/`Agent`/`Role`/`Floor`.

## 2. Serialização do canvas
O **front** define o shape (`CanvasState` em `tauri.ts`); o Rust guarda opaco.
Tipo de nó novo = serializar no `switch` do `buildWorkspace` **e** restaurar no
`switch` do `doLoad` (ambos em `App.tsx`). Faltou um dos dois → o nó some no
reload, sem erro.

## 3. Command novo no Rust = 3 passos
`fn` em `src-tauri/src/*.rs` → registro em `lib.rs` (`generate_handler!`) →
wrapper em `src/lib/tauri.ts`. Pular o registro só falha em runtime.

## 4. Spawn de binário
**Sempre** `augmented_path()` / `resolve_program()` do `pty.rs` — pra claude,
git, editor, qualquer coisa. O PATH da GUI vem capado (não vê `~/.local/bin`,
nvm, brew…). O PATH aumentado também vai como env pro filho, senão os
subprocessos do agente quebram (`node: not found`).

Pra **agente**, o ponto de entrada é `invocacao(nome, path)`, não
`resolve_program` direto: ela devolve `(programa, args)` e cai pro
`npx -y <pacote>` (tabela `PACOTE_NPM`) quando o binário não existe. Quem chamar
`resolve_program` na mão pra spawnar agente tira o npx da jogada sem perceber.

## 5. `dirty()` no autosave
Toda mutação de canvas chama `dirty()`. `setNodes` direto sem `dirty()` = mudança
que não persiste (já aconteceu com floors).

## 6. Refs espelho
Callback de nó lê `nodesRef`/`edgesRef`/`contextsRef`/`defaultsRef`, nunca o
estado direto — a saída do PTY chega por Channel, fora do render, e a closure
estaria velha. Ao mexer no estado, atualize o espelho.

## 7. Fora do React
Instância de terminal e texto de nota vivem em Maps de `shared.ts`
(`terminals`, `noteText`). Não mover pra estado React.

## 8. Teto do paste
`forward_output_to` recusa acima de `MAX_PASTE` (16KB) — e isso vale pro
**conjunto** de contextos, que vão numa submissão só. Contexto novo: mantenha
enxuto.

## 9. Versão em 4 arquivos
Release = bumpar `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` e `src-tauri/Cargo.lock` (têm que bater), depois tag
`v<versão>`. O CI monta os instaladores.

## Verificação antes de commitar
- `cd src-tauri && cargo test` — 22 testes (puras + contrato + roundtrip de
  workspace + floors num repo git de verdade). Testes de workspace usam
  `ORQUESTRA_HOME` num tmp: **nunca** tocar o `~/.orquestra` real.
- `pnpm build` — `tsc` + vite. Não há lint; o type-check é o portão. Não há
  teste de frontend.
- Smoke no `pnpm tauri dev`: criar claude+shell, ligar aresta, pedir "rode ls no
  terminal" → o comando executa **no shell** e o cabo acende.
