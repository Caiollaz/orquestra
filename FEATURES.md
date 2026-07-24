# Orquestra — Mapa de Features (melhoras inspiradas no Maestri)

## Contexto
Lista de features desejadas (copy do Maestri) mapeada contra o estado atual do
código. Objetivo: saber o que **já existe**, o que só falta **plugar UI** e o
que é **novo**. Backend está adiantado (M1–M6 em Rust, com testes); grande parte
do trabalho é frontend.

Stack canvas: `@xyflow/react` (React Flow) · terminal `@xterm` (addon-canvas) ·
`zustand` já é dep mas **não usado** (App.tsx usa `useState`/`useRef`).

## Legenda de status
- ✅ **PRONTO** — funciona hoje.
- 🟡 **SÓ-BACKEND** — comando Rust existe/testado, sem wrapper JS nem UI.
- 🟠 **PARCIAL** — parte funciona, falta uma direção/pedaço.
- 🔴 **NOVO** — sem nenhum código; fora do PLAN atual.

## Visão geral

| # | Feature (copy) | Status | Onde está / o que falta |
|---|----------------|--------|--------------------------|
| 1 | Agentes conversam entre si | ✅ PRONTO | `forward_output` pty.rs:263 + edges/protocolo `⇢NOME:` App.tsx:115-149 |
| 2 | Desenhe seu raciocínio (diagramas, formas à mão) | 🔴 NOVO | nada; só edges do React Flow |
| 3 | Dê um papel a cada agente | 🟡 SÓ-BACKEND | `roles.rs` (list/save/apply/parse) reg. lib.rs:16-19; falta wrapper+RolePicker |
| 4 | Terminal sem bordas (canvas infinito, zoom) | ✅ PRONTO* | React Flow pan/zoom App.tsx:188-201; nós têm moldura (quer borderless) |
| 5 | Motor de canvas próprio | ✅ (React Flow) | decisão: manter React Flow vs canvas do zero |
| 6 | Crie agentes em qualquer lugar | ✅ PRONTO* | `spawn_agent` pty.rs:169; shell/claude/nota; posição auto-grid (sem drop livre) |
| 7 | Portais (navegador embutido no canvas) | 🔴 NOVO | nada; precisa webview Tauri como tipo de nó |
| 8 | Configure e esqueça (prompts agendados) | 🔴 NOVO | nada; precisa scheduler + persistência |
| 9 | Notas escritas pelos agentes | 🟠 PARCIAL | nota→agente ok (NoteNode + `sendFrom`); **agente→nota falta** |
| 10 | Um canvas por contexto (workspaces, troca tmux) | 🟡 SÓ-BACKEND | `workspace.rs` (list/load/save) + index.json; falta wrapper+UI+restaurar layout |
| 11 | Vá direto para o código (editor externo) | 🔴 NOVO | nada; só picker de pasta App.tsx:171 |
| — | Floors / worktrees (do PLAN, não na copy) | 🟡 SÓ-BACKEND | `git.rs` create/remove_floor:39/57; falta FloorSwitcher |

\* Funciona, mas a copy pede um acabamento (borderless / drop livre).

---

## Detalhe por feature

### Grupo A — já pronto, só polir
**1. Agentes conversam entre si.** Roteamento por edge + protocolo `⇢NOME:`
detectado no idle. Funciona ponta a ponta. Polir: descoberta do protocolo (hoje
seed manual), visual da mensagem trafegando na aresta.

**4/6. Canvas + criar em qualquer lugar.** Pan/zoom prontos; nós shell/claude/nota.
Faltas cosméticas: nós *borderless*, posicionar por clique/drop no ponto do cursor
(hoje auto-grid via `seq`).

### Grupo B — backend pronto, falta plugar UI (maior ROI)
Padrão comum: comando Rust já registrado em `lib.rs`, mas **sem wrapper em
`src/lib/tauri.ts`** e sem UI. Passos por feature: (a) add wrapper em tauri.ts;
(b) componente UI; (c) fiar em App.tsx.

**3. Papéis por agente.** `list_roles`/`save_role`/`apply_role` (roles.rs:102-148).
UI: RolePicker no header do nó → `apply_role` semeia prompt (idle-debounce ~750ms
+ botão manual, conforme PLAN M4). Presets = os nomes da copy (Bug Whisperer, etc).

**10. Workspaces (canvas por contexto).** `list/load/save_workspace`
(workspace.rs:87-98) + `~/.orquestra/`. UI: barra de workspaces, salvar/restaurar
layout (viewport+agents), atalhos tmux pra trocar. Aqui entra usar o `zustand`
que já é dep.

**Floors/worktrees.** `create_floor`/`remove_floor` (git.rs:39-57). UI: FloorSwitcher,
spawn com `cwd=floor`. (Do PLAN M5; não está na copy mas complementa.)

### Grupo C — novo (fora do PLAN)
**9. Agente escreve na nota.** Já tem nota→agente. Falta agente→nota: um comando
que captura saída do agente e grava no `noteText` (shared.ts:6) da nota conectada.
Menor dos novos (reusa modelo de edge + note existente).

**11. Abrir no editor externo.** Comando Rust simples: `open -a`/`code`/`zed <path>`
no `cwd`/repoPath. Botão no nó/workspace. Baixo esforço.

**2. Diagramas / formas à mão.** Camada de desenho no canvas (setas, formas
freehand) junto aos nós. Esforço alto — avaliar lib (tldraw/excalidraw embutido)
vs custom sobre React Flow.

**6b. Portais (navegador embutido).** Novo tipo de nó = webview Tauri; conectar a
agente pra ele navegar/screenshot. Esforço alto (webview aninhada + ponte agente).

**7. Prompts agendados.** Scheduler (intervalo) que dispara `forward_output` no
agente; precisa persistir agendamentos. Esforço médio.

---

## Ordem sugerida (ROI ↓ esforço ↑)
1. **Grupo B** (papéis, workspaces, floors) — backend testado, só UI. Fecha M3–M5 do PLAN.
2. **9 agente→nota** e **11 editor externo** — novos pequenos, alto valor percebido.
3. **7 prompts agendados** — médio.
4. **2 diagramas** e **6b portais** — grandes; decidir lib/arquitetura antes.

## Verificação
Cada feature do Grupo B: `cd src-tauri && cargo test` (funções puras já cobertas)
e `pnpm tauri dev` — smoke por milestone (ex.: aplicar papel semeia prompt;
salvar/recarregar workspace restaura layout). Novos comandos Rust: teste de função
pura no mesmo estilo (roles.rs/git.rs) + contrato camelCase igual `agent_cmd_contrato_front`.
