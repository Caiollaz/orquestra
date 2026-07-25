# Contexto: Regras de negócio do orquestra

Produto: orquestrador de agentes de IA num canvas infinito (modelo Maestri).
O usuário rege vários agentes interativos em paralelo, cada um num terminal vivo.

## Regras que não se quebram
1. Terminais são **interativos** (PTY), nunca headless. O usuário vê e digita.
2. O app **não embute agente nenhum** — roda o CLI que já está na máquina do
   usuário (`claude`, `codex`, `opencode`, `agy`). Falta de binário é erro de
   pré-requisito, não motivo pra baixar nada.
3. Fechar o app mata todos os filhos (`kill_all` no `ExitRequested`). Nunca
   deixar órfão. Fechar nó (unmount do `XtermView`) chama `kill_agent`.
4. O workspace lembra **tudo** sozinho: nós de todo tipo, arestas, texto de
   notas, agendamentos, papel/contextos aplicados, viewport. Autosave — o
   usuário não deve precisar clicar em salvar. Workspaces antigos (só `agents`)
   carregam pelo caminho legado.
5. Comunicação entre agentes é **opt-in por aresta** (source→target) e visível:
   o cabo acende quando dado flui. Sem aresta, sem mensagem.
6. Delegação: pedido "rode no terminal" = o agente manda `⇢shell-N: comando` pro
   shell conectado, **não executa nele mesmo**.
7. Rótulo é **endereço de rota**: único por canvas, numeração por tipo contando
   só o workspace atual (`claude-1`, `shell-1`). Renomear é mudar identidade de
   rota — tem que avisar o nó e quem aponta pra ele.
8. Floors isolam trabalho por branch (worktree); agente novo nasce no cwd do
   floor ativo. **Remover floor não destrói trabalho sem `force` explícito** —
   inclui arquivo ignorado pelo git (`.env`).
9. Todo CLI de agente é cidadão de primeira classe: o que o claude recebe
   (protocolo, papéis, contextos, notas, avisos), codex/opencode/antigravity
   recebem igual. Só o nó **shell** recebe comando cru.
10. UI 100% no tema (dark, fosso de orquestra): nada de `dialog`/`select`/
    `prompt` nativo do navegador — usar `Dialog.tsx`/`ContextMenu.tsx`. Exceção
    única: o seletor de pasta (plugin nativo do SO).
11. Idioma do produto e do código: **pt-BR** (comentários, strings, commits).

## Papel × contexto (não confundir)
- **Papel** = *quem o agente é*. Um por agente. `.orquestra/roles/*.md`,
  frontmatter `name/agent/description`, corpo com `{{var}}` renderizado.
- **Contexto** = *o que ele precisa saber* (regra de negócio, arquitetura,
  contrato). Vários por agente, empilháveis, iguais pra todo mundo do canvas.
  `.orquestra/contexts/*.md`, corpo *verbatim*. Os **padrões do workspace**
  semeiam todo agente novo — é isso que dá o fluxo contínuo: agente novo já
  nasce sabendo as regras, sem copiar/colar.
