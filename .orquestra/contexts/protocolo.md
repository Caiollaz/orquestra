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
do TUI e **um conjunto de setas**, não só o `⇢`: modelo que não é claude
normaliza glifo raro na saída — caso real, DeepSeek escreveu `→opencode-1:` e a
rota morreu calada, com o agente convencido de que havia delegado. Aceitas:
`⇢ → ⇒ ⟹ ⟶ ➔ ➞ ➜ ➡ ⇨ ↦`. Pedimos `⇢` no prompt e toleramos na entrada. O parser
é lógica pura e tem checagem rodável: `node src/protocolo.check.ts`.

ASCII `->` e `=>` valem **condicionalmente**: só quando o destino é um endereço
que existe (rótulo de nó no canvas, `nota` ou `todos`). Ignorar ASCII de vez
custou caro — o claude respondeu `->nota: oi` e a rota morreu calada — mas
aceitar de vez casaria com `--> src/main.rs:10:5` da saída do rustc. A condição
mata esse falso positivo por construção: `src/main.rs` não é rótulo de nó.
Quem decide é `rotaDaLinha(linha, conhecido)`; o `conhecido` vem do App
(`enderecoExiste`), porque o parser não conhece o canvas. `blocoDaRota` recebe o
mesmo `conhecido` — régua diferente entre os dois faz o bloco engolir a rota
seguinte como corpo.

**Rota sem destino avisa.** Linha bem formada apontando pra nome que ninguém
atende gera aviso na island (`claude-1: ⇢nome não existe aqui`) em vez de sumir.
Isso vale inclusive quando o agente **não tem aresta nenhuma** — o laço de rota
roda com `targets` vazio só pra avisar; ter um `return` antecipado ali era o
buraco mais silencioso do app. `⇢nota:` sem nota conectada tem aviso próprio
(`⇢nota sem nota conectada`), porque não passa pela busca por rótulo.

Palavra sobrecarregada: `anotar`/`registrar` puxava o agente pro `board.md`
(arquivo) em vez da nota (nó do canvas) — "pedi pra anotar um oi, ele disse que
anotou e nada apareceu". O `seedPrompt` separa os dois explicitamente.

## Semântica por tipo de destino
O tipo do nó decide o que a linha significa — e o aviso `(sistema)` mandado na
conexão diz ao agente qual ele pegou:

| Destino | `⇢NOME: x` faz |
|---|---|
| `agent` (claude/codex/…) | manda a mensagem, chega como `(de origem) x` |
| `agent` do tipo shell | **executa** `x` naquele terminal **e a saída volta** pra quem pediu como `(de shell-1) \`cmd\`` + as últimas 4KB |
| `portal` | `x` é URL → navega; `x` é `ler` (ou `ler <url>`) → **devolve o texto da página** pra quem pediu |
| `note` | escreve `x` na nota (`⇢nota: texto`), **anexando**; aceita bloco multilinha |
| `mermaid` | **substitui** o diagrama pelo código `x` (dois diagramas concatenados não compilam) |

**Shell devolve a saída.** Shell não fala `⇢`, então é o app que fecha o laço:
ao delegar, o par (shell → quem pediu) fica registrado e no **próximo idle do
shell** a saída nova volta pro delegante. Cauda e não cabeça — numa saída de
comando o que importa é o final (falha, resumo). PTY não "termina", então
ficar quieto depois de imprimir é o sinal; comando interativo que espera input
fica quieto também e a saída volta pela metade. Sem código de saída: só o texto.

**Portal é o outro destino que RESPONDE.** `⇢portal-1: ler` devolve a página no
stdin de quem pediu, como `(de portal-1) leu <url>` + o texto. A resposta volta
pela **mesma aresta do pedido** (não existe aresta portal→agente). Quem busca é o
`fetch_page` (curl no Rust), não o iframe: o que o agente lê pode divergir do que
o humano vê, porque são duas requisições sem cookie nem sessão em comum, e página
renderizada por JS chega vazia. Teto de 12KB por entrega, com aviso de truncagem.

Duas regras que **não** são negociáveis nesse caminho:
- **`⇢` do texto buscado é neutralizado pra `->`** (`extraiTexto` em
  `src/pagina.ts`). Página é fonte não-confiável e `rememberSent` só cobre a
  janela de `ECO_MS`: o TUI redesenha o scrollback e a linha reaparecendo depois
  da janela rotearia de verdade.
- **Nó shell nunca recebe resposta.** O laço de rota roda pra todo nó de agente
  (o `isLLM` só protege a semeadura), e colar uma página num prompt de bash é
  execução de comando.

## Nota tem modo: `contexto` ou `tarefa`
O toggle no cabeçalho da nota decide como o texto chega no agente
(`enquadraNota`, `src/nota.ts`) — e é **um lugar só**, usado pelos três caminhos
(conectar, 3º idle, botão ⇢), porque antes cada um mandava num formato diferente
e o agente respondia "OK" pra uma spec:

- `contexto` → `(contexto)\n<texto>`, referência.
- `tarefa` → `(tarefa do usuário)\n<texto>` + ordem de implementar e de perguntar
  antes se algo estiver ambíguo.

Padrão é `contexto`. Nota vazia não gera submissão, e o estágio de notas **só é
marcado como semeado quando havia texto** — quem liga a nota vazia e escreve
depois pega no idle seguinte. Conectar uma nota num agente que ainda não passou
pelo estágio não injeta na hora: a semeadura pega, senão a mesma nota chegava
duas vezes.

## O prompt de protocolo lista os vizinhos
`seedPrompt` inclui as conexões **atuais** do agente, descritas por
`descreveDestino` (mesma fonte do aviso `(sistema)`). Sem isso, workspace
recarregado tinha agente que sabia a sintaxe `⇢NOME:` e não sabia nome nenhum —
o grafo existia e ele estava amnésico, porque os avisos de conexão só saem no
`onConnect`.

## Agendamento espera o agente ficar ocioso
O relógio de `startSchedule` só **arma**; quem dispara é o idle. Antes era
`setInterval` cego colando prompt no meio do trabalho.

## Aresta é dirigida, e os dois lados são avisados
Só `source → target` roteia. Ligar dois agentes LLM avisa **os dois**: a origem
recebe "você pode falar com X via ⇢X:", o destino recebe "X pode te endereçar,
responda com ⇢X:". Sem o segundo aviso, uma ligação desenhada ao contrário morria
calada. A aresta tem ponta de seta no canvas por isso.

**Diagrama e nota aceitam bloco multilinha.** O `⇢` só cabe na primeira linha, então
`blocoDaRota` (`protocolo.ts`) engole as linhas seguintes até uma linha em branco
ou até a próxima rota:

```
⇢diagrama-1: flowchart LR
  Front --> API
  API --> Banco
```

As linhas de continuação passam por um stripping de **moldura** (`│ ⎿ ┃ ╎ ┆ ▌ ▏`):
o TUI desenha borda na margem e ela vinha junto, sujando a nota e quebrando o
mermaid. ASCII `|` fica de fora — linha de tabela markdown começa com `|`.

Teto conhecido: um bloco partido entre duas leituras do buffer do xterm chega
pela metade.

## Ler o terminal: watermark não basta, a tela é re-varrida
O bug mais caro da série. `lastLineRef` é uma marca d'água por **índice de
linha** do buffer do xterm, e isso só é válido pra saída append-only. O TUI do
agente não é: Ink mantém uma região viva embaixo (caixa de input, spinner,
status) e a **reescreve** a cada frame. O idle de 1s dispara com o cursor dentro
dessa região, a marca avança por cima daquelas linhas, e a resposta seguinte é
impressa **em cima delas** — abaixo da marca, nunca lida. Sintoma: `⇢nota: oi`
visível no terminal, nota vazia, e nem o aviso de destino inexistente, porque a
linha jamais chegou ao parser.

`readRouteLines` re-varre a **tela visível inteira** a cada idle, além do que
passou da marca. Quem impede rotear duas vezes é a dedupe por
`índice absoluto::conteúdo` (`rowsRoteadasRef`) — exata, sem janela de tempo:
linha reescrita tem conteúdo novo, rota repetida de verdade cai noutro índice.
Só rota entra no conjunto, então ele não cresce.

`readNewLines` (marca d'água, avança) continua existindo e é o que a **entrega
de saída de shell** usa: aquele caminho é append-only e reentregar duplicaria.
Remontagem do nó limpa `rowsRoteadasRef` junto com a marca — buffer novo,
índices antigos não valem.

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
