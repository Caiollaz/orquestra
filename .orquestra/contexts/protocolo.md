# Contexto: Protocolo de roteamento (⇢NOME:)

Como os nós do canvas conversam. É a parte mais delicada do app: quase todo bug
grave da história do projeto nasceu aqui.

## A regra
Um agente fala com um nó **conectado** escrevendo uma linha própria:

```
⇢NOME: mensagem
```

`NOME` é o rótulo do nó de destino, ou `todos` (broadcast pros conectados).
A regex `ROTA` (em `src/protocolo.ts`, usada pelos dois lados) tolera os bullets
do TUI: `^[\s⏺●•>*-]*⇢\s*([^\s:]+)\s*:\s*(.+)$`. O parser é lógica pura e tem
checagem rodável: `node --experimental-strip-types src/protocolo.check.ts`.

## Semântica por tipo de destino
O tipo do nó decide o que a linha significa — e o aviso `(sistema)` mandado na
conexão diz ao agente qual ele pegou:

| Destino | `⇢NOME: x` faz |
|---|---|
| `agent` (claude/codex/…) | manda a mensagem, chega como `(de origem) x` |
| `agent` do tipo shell | **executa** `x` naquele terminal |
| `portal` | navega o iframe até a URL `x` |
| `note` | escreve `x` na nota (`⇢nota: texto`), **anexando** ao que já tem |
| `mermaid` | **substitui** o diagrama pelo código `x` (dois diagramas concatenados não compilam) |

**Diagrama é o único destino multilinha.** O `⇢` só cabe na primeira linha, então
`blocoDaRota` (`protocolo.ts`) engole as linhas seguintes até uma linha em branco
ou até a próxima rota:

```
⇢diagrama-1: flowchart LR
  Front --> API
  API --> Banco
```

Teto conhecido: um bloco partido entre duas leituras do buffer do xterm chega
pela metade.

`isLLM(cmd)` (`App.tsx`) é o **único** lugar que separa "recebe prosa"
(`claude` + `agent`: protocolo, papéis, contextos, avisos) de "recebe comando
cru" (`shell`). Agente CLI novo = ensinar `isLLM`, não espalhar
`kind === "claude"`.

## Semeadura: 3 idles, uma submissão cada
`handleIdle` semeia em estágios, **nunca juntos** — dois bracketed-paste
seguidos se atropelam no prompt do CLI:

1. **1º idle** — prompt do protocolo `⇢NOME:` (quem ele é, como falar, o quadro
   `.orquestra/board.md`).
2. **2º idle** — contextos (os do nó + os padrões do workspace).
3. **3º idle** — texto das notas já conectadas ao agente.

Prontidão é detectada por **idle-debounce**, jamais casando a string do prompt
do CLI. Remontagem do nó respawna o processo: `onSpawn` limpa o transiente do
id (`seededRef`/`ctxSeededRef`), senão o processo novo nasce sem nada.

## Anti-eco (o bug que volta se você esquecer)
O TUI **ecoa** tudo que colamos. Um bloco de contexto que documenta o protocolo
— uma linha começando com `⇢` — casaria a regex e **executaria de verdade**
(caso real: contexto com `- ⇢shell-1: rm -rf .` disparou o comando).

`rememberSent(id, texto)` guarda as rotas que **nós** enviamos, por agente, com
janela de tempo (`ECO_MS`); `handleIdle` engole as repetições dentro da janela.
Janela e não "engole a primeira": o TUI redesenha e a mesma linha reaparece
várias vezes. Depois da janela a rota volta a valer — o agente pode legitimamente
repetir um comando.

**Todo caminho novo que manda texto pro agente chama `rememberSent` antes.**

## Rótulo é endereço
- Único por canvas, sem espaço nem `:`; numeração por tipo (`claude-1`,
  `shell-1`) conta só o workspace atual.
- `todos` e `nota` são **destinos reservados** — nó não pode usar.
- Renomear avisa **o próprio nó e todo mundo que aponta pra ele**
  (`renameNode`), senão as mensagens vão pra um nome que ninguém atende.

## Transporte
`forward_output_to` embrulha em bracketed-paste (`\x1b[200~…\x1b[201~\r`) pra
cair como submissão única. Antes passa por `bracketed_safe`, que tira controles:
um `\x1b[201~` no payload fecharia o paste e o resto viraria **tecla digitada**
no terminal do destino — injeção de comando vinda de outro agente, de uma nota
ou de um arquivo de contexto. Teto de 16KB por paste (`MAX_PASTE`); o PTY do
destino trava se o filho não drena o stdin.
