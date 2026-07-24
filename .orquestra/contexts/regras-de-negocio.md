# Contexto: Regras de negócio do orquestra

Produto: orquestrador de agentes de IA num canvas infinito (modelo Maestri).
Usuário rege vários agentes interativos em paralelo, cada um num terminal vivo.

## Regras que não se quebram
1. Terminais são INTERATIVOS (PTY), nunca headless. O usuário vê e digita.
2. Fechar o app mata todos os processos filhos (kill_all no ExitRequested).
   Nunca deixar órfão. Fechar nó (unmount do XtermView) chama kill_agent.
3. Workspace lembra TUDO sozinho: nós de todo tipo, arestas, texto de notas,
   agendamentos, papel aplicado, viewport. Autosave — usuário não deve
   precisar clicar salvar. Workspaces antigos (só agents) carregam pelo
   caminho legado.
4. Comunicação entre agentes é opt-in por aresta (source→target) e visível:
   o cabo acende quando dado flui. Sem aresta, sem mensagem.
5. Protocolo ⇢NOME: é semeado no claude no primeiro idle + aviso "(sistema)"
   a cada conexão nova. Eco "(de X)" sem ⇢ NÃO recompõe cascata (anti-loop).
6. Delegação: pedido "rode no terminal" = claude manda ⇢shell-N: comando pro
   shell conectado, não executa nele mesmo.
7. Rótulos são endereço: únicos por canvas, numeração por tipo conta só o
   workspace atual (claude-1, shell-1…). Renomear/label é identidade de rota.
8. Floors isolam trabalho por branch (worktree); agente novo nasce no cwd do
   floor ativo. Remover floor não pode destruir trabalho sem --force explícito.
9. UI 100% no tema (dark, fosso de orquestra): nada de dialog/select/prompt
   nativo do navegador — usar Dialog.tsx/ContextMenu.tsx. Única exceção: file
   picker de pasta (plugin nativo do SO).
10. Idioma do produto e do código: pt-BR (comentários, strings, commits).
