# Orquestra — Mapa de Features (melhoras inspiradas no Maestri)

## Contexto
Lista de features desejadas (copy do Maestri) mapeada contra o estado atual do
código. **M1–M6 estão fechados** (backend Rust *e* UI): canvas, papéis,
workspaces, floors, comunicação, persistência com autosave. O que sobra é
acabamento e as features que o Maestri tem e nós não.

Stack canvas: `@xyflow/react` (React Flow) · terminal `@xterm` (addon-canvas) ·
`zustand` é dep mas **não usado** (App.tsx usa `useState`/`useRef` + refs espelho).

## Legenda de status
- ✅ **PRONTO** — funciona hoje.
- 🟡 **SÓ-BACKEND** — comando Rust existe/testado, sem wrapper JS nem UI.
- 🟠 **PARCIAL** — parte funciona, falta uma direção/pedaço.
- 🔴 **NOVO** — sem nenhum código; fora do PLAN atual.

## Visão geral

| # | Feature (copy) | Status | Onde está / o que falta |
|---|----------------|--------|--------------------------|
| 1 | Agentes conversam entre si | ✅ PRONTO | `forward_output` pty.rs + protocolo `⇢NOME:` no `handleIdle` (App.tsx) |
| 2 | Desenhe seu raciocínio (diagramas, formas à mão) | 🟠 PARCIAL | `ShapeNode` (caixas com rótulo); falta traço livre |
| 3 | Dê um papel a cada agente | ✅ PRONTO | `roles.rs` + `RolePicker` + selo no header do nó |
| 4 | Terminal sem bordas (canvas infinito, zoom) | ✅ PRONTO* | React Flow pan/zoom; nós têm moldura (a copy quer borderless) |
| 5 | Motor de canvas próprio | ✅ (React Flow) | decisão: manter React Flow vs canvas do zero |
| 6 | Crie agentes em qualquer lugar | ✅ PRONTO | click direito no ponto do cursor (`paneContext`) ou Batuta (centro) |
| 7 | Portais (navegador embutido no canvas) | ✅ PRONTO | `PortalNode` (iframe); claude navega com `⇢portal-1: url` |
| 8 | Configure e esqueça (prompts agendados) | ✅ PRONTO | `scheduleAgent` + spec persistido no canvas (`schedule`) |
| 9 | Notas escritas pelos agentes | ✅ PRONTO | `⇢nota: texto` → evento `note-write`; texto vai no workspace |
| 10 | Um canvas por contexto (workspaces) | ✅ PRONTO | `workspace.rs` + Sidebar + autosave (debounce 1.2s) |
| 11 | Vá direto para o código (editor externo) | ✅ PRONTO | `editor.rs` reusando o PATH aumentado |
| — | Floors / worktrees | ✅ PRONTO | `git.rs`; menu de floors na ilha; remover exige force se houver trabalho |
| — | **Contextos** (nosso; Maestri não tem igual) | ✅ PRONTO | `contexts.rs` + `ContextPicker`; padrões do workspace semeiam agente novo |
| — | **Batuta** (paleta de comandos, Cmd+P do Maestri) | ✅ PRONTO | `Batuta.tsx`, Ctrl+K (fora do terminal) / Ctrl+Shift+K (em qualquer lugar) |
| — | Renomear rótulo (rota) | ✅ PRONTO | menu do nó; avisa o nó e quem aponta pra ele |
| — | Árvore de arquivos como nó | 🔴 NOVO | Maestri 0.18/0.30; nada aqui |
| — | Grupos de nós, alinhar/distribuir | 🔴 NOVO | Maestri 0.26/0.32 |
| — | Diff viewer / git no canvas | 🔴 NOVO | Maestri 0.21/0.24 |
| — | Ambientes remotos (SSH/Docker) | 🔴 NOVO | Maestri 0.20/0.34 |

\* Funciona, mas a copy pede um acabamento (borderless / drop livre).

---

## Detalhe do que ainda falta

**Contextos (feito, mas dá pra crescer).** Hoje o contexto é semeado no stdin do
agente no 2º idle (o 1º leva o protocolo `⇢NOME:`). Falta: variável `{{var}}`
preenchida por diálogo na hora de semear (o Rust já renderiza), e contexto por
papel (papel que já vem com seus contextos).

**2. Traço livre no diagrama.** `ShapeNode` cobre caixa com rótulo; falta desenho
à mão. Esforço alto — avaliar tldraw/excalidraw embutido vs camada própria sobre
o React Flow.

**Árvore de arquivos como nó** (Maestri 0.18/0.30). Nó novo que lista o repo,
abre arquivo no editor e mostra status do git. Esforço médio-alto; o `git.rs` já
tem o padrão de chamar `git` por subprocess.

**Grupos de nós / alinhar & distribuir** (Maestri 0.26/0.32). Puramente frontend
sobre o React Flow. Esforço baixo, ganho grande com canvas cheio.

**Diff viewer e git no canvas** (Maestri 0.21/0.24). Depende da árvore de arquivos.

**Ambientes remotos (SSH/Docker)** (Maestri 0.20/0.34). O `spawn_agent` teria de
aceitar um transporte além do PTY local — mudança estrutural no `pty.rs`.

**Acabamento pedido pela copy.** Nós *borderless* (moldura só no hover/seleção) e
thumbnail em zoom baixo (só se medir dor com muitos terminais).

---

## Ordem sugerida (ROI ↓ esforço ↑)
1. **Grupos + alinhar/distribuir** — só frontend, alivia canvas cheio.
2. **Vars de contexto por diálogo** — backend já renderiza `{{var}}`.
3. **Árvore de arquivos** — abre caminho pro diff viewer.
4. **Traço livre** e **ambientes remotos** — grandes; decidir arquitetura antes.

## Verificação
`cd src-tauri && cargo test` (21 testes: funções puras + contrato + roundtrip de
workspace + floors num repo git de verdade) e `pnpm build` (tsc + vite) antes de
commitar. Smoke no `pnpm tauri dev`: criar claude+shell, ligar aresta, pedir
"rode ls no terminal" → o comando executa **no shell** e o cabo acende.
Comando Rust novo = função pura testada no mesmo estilo (roles.rs/git.rs) +
contrato camelCase igual `agent_cmd_contrato_front`.
