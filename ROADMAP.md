# Roadmap — orquestra

Estado em **0.8.1**. Como o app funciona por dentro está em
`.orquestra/contexts/` (arquitetura, protocolo, contratos, receitas,
armadilhas) — aqui é só o que existe, o que falta e por quê.

## Decisões travadas
- **Terminais interativos (PTY)**, não headless. Veio do agentdesk, que rodava
  `claude -p` num pipeline fixo PO→TL; o modelo desejado é o Maestri — agentes
  vivos que você vê e comanda num canvas.
- **Rust puro**, sem sidecar Node: `portable-pty`, `git` por subprocess, JSON por
  `serde`.
- **Canvas**: `@xyflow/react`. Alternativa (motor próprio) descartada por ora.
- **Terminal**: `@xterm/xterm` com renderer DOM. Canvas addon virava bitmap
  borrado no zoom; webgl estoura contexto com N terminais. Se TUI pesado jankar,
  o upgrade é webgl **só no terminal focado**.
- **Sem detach/resume** e **sem persistir scrollback**: respawn é limpo.

## Pronto
Canvas multi-agente · vários CLIs de agente (claude/codex/opencode/antigravity)
· comunicação `⇢NOME:` com cabo que acende · papéis (+8 presets) · contextos
empilháveis com padrões do workspace · workspaces com autosave · floors
(worktrees) · portais · notas automáticas · diagramas mermaid · prompts
agendados · editor
externo · Batuta (Ctrl+K) · Dynamic Island · sidebar flutuante · boas-vindas com
`check_prereqs` · barra de janela custom.

## Falta (do que o Maestri tem e nós não)

| Feature | Esforço | Nota |
|---|---|---|
| Grupos de nós, alinhar/distribuir | baixo | só frontend sobre o React Flow; alivia canvas cheio |
| Vars `{{var}}` de contexto por diálogo | baixo | o Rust já renderiza — hoje contexto vai *verbatim* de propósito (documentação cita `{{var}}`) |
| Árvore de arquivos como nó | médio-alto | lista o repo, abre no editor, mostra status git; `git.rs` já tem o padrão de subprocess |
| Diff viewer / git no canvas | alto | depende da árvore de arquivos |
| Traço livre no diagrama | alto | o nó `mermaid` cobre diagrama declarativo (e agente escreve nele); traço à mão pede tldraw/excalidraw embutido vs camada própria |
| Ambientes remotos (SSH/Docker) | alto | `spawn_agent` teria de aceitar transporte além do PTY local — mudança estrutural no `pty.rs` |

**Acabamento pedido pela copy**: nós *borderless* (moldura só no hover/seleção) e
thumbnail em zoom baixo — só se medir dor com muitos terminais.

## Ordem sugerida (ROI ↓ esforço ↑)
1. Grupos + alinhar/distribuir.
2. Vars de contexto por diálogo.
3. Árvore de arquivos (abre caminho pro diff viewer).
4. Traço livre e ambientes remotos — grandes; decidir arquitetura antes.

## Dívida conhecida
- `zustand` é dependência e **não é usado** (`App.tsx` é dono único com refs
  espelho). Ou some com a dep, ou migra de verdade.
- Os 6 contextos somam ~18KB e o teto de paste é 16KB: não dá pra semear todos
  de uma vez. Se crescerem mais, o `apply_contexts` precisa quebrar em lotes.
- `src/Welcome.tsx` ainda diz que outros CLIs rodam "num nó do tipo shell" —
  texto da 0.7, desmentido pela 0.8.
- A regex de rota aceita `⇢` indentado (achado de red team sem correção). A
  janela de anti-eco cobre o caso real; exigir coluna 0 quebraria a saída com
  bullet do claude.
