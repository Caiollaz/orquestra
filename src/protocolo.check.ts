// Checagem do parser de rota. Não há runner de teste no front (o gate é o
// `tsc`), então isto roda direto no node:
//   node --experimental-strip-types src/protocolo.check.ts
import assert from "node:assert/strict";
import { ROTA, rotaKey, blocoDaRota, rotaDaLinha } from "./protocolo.ts";

// rota simples, com e sem bullet do TUI
assert.deepEqual("⇢api: sobe o servidor".match(ROTA)?.slice(1), ["api", "sobe o servidor"]);
assert.deepEqual("⏺ ⇢api: sobe".match(ROTA)?.slice(1), ["api", "sobe"]);
// borda de caixa do TUI (opencode desenha │ na margem) não pode matar a rota
assert.deepEqual("│ ⇢api: sobe".match(ROTA)?.slice(1), ["api", "sobe"]);
assert.deepEqual("  ⎿  →api: sobe".match(ROTA)?.slice(1), ["api", "sobe"]);
assert.deepEqual("| ⇢api: sobe".match(ROTA)?.slice(1), ["api", "sobe"]);
assert.equal("nada aqui".match(ROTA), null);

// setas que modelo não-claude escreve no lugar do ⇢: tolerar na entrada, senão a
// rota morre calada (caso real: DeepSeek escreveu →opencode-1:)
for (const seta of ["→", "⇒", "⟶", "➔", "➞", "➜", "➡", "⇨", "↦"]) {
  assert.deepEqual(`${seta}opencode-1: sobe o dev`.match(ROTA)?.slice(1), ["opencode-1", "sobe o dev"], `seta ${seta}`);
}
// ASCII fica fora: `--> src/main.rs:10:5` do rustc casaria com dest=src/main.rs
assert.equal("-> api: oi".match(ROTA), null);
assert.equal("--> src/main.rs:10:5".match(ROTA), null);
assert.equal("=> api: oi".match(ROTA), null);
assert.equal(rotaKey("API", " oi "), "api :: oi");

// ── seta ASCII: só vale com destino que existe ─────────────────────────────
// Caso real que motivou isto: o claude respondeu `->nota: oi` e a rota morreu.
const canvas = (d: string) => ["nota", "todos", "api", "shell-1"].includes(d.toLowerCase());

assert.deepEqual(rotaDaLinha("->nota: oi", canvas), { dest: "nota", msg: "oi" });
assert.deepEqual(rotaDaLinha("⏺ -> api: sobe", canvas), { dest: "api", msg: "sobe" });
assert.deepEqual(rotaDaLinha("=> shell-1: ls", canvas), { dest: "shell-1", msg: "ls" });
// o falso positivo que fez o ASCII ficar de fora: destino não é nó, não é rota
assert.equal(rotaDaLinha("--> src/main.rs:10:5", canvas), null);
assert.equal(rotaDaLinha("-> resultado: deu certo", canvas), null);
// sem saber o canvas, ASCII continua não valendo (o parser puro é conservador)
assert.equal(rotaDaLinha("->nota: oi"), null);
// unicode não depende de nada disso
assert.deepEqual(rotaDaLinha("⇢desconhecido: x"), { dest: "desconhecido", msg: "x" });

// ── moldura na ponta DIREITA (barra de rolagem do opencode) ────────────────
// Caso real: nota recebia o texto + o nome do modelo + "barras pretas". A área
// de mensagens do opencode leva `█` na coluna da direita em TODA linha, então
// linha em branco não era vazia pro .trim() e o bloco engolia a tela até a
// barra de status.
assert.deepEqual(rotaDaLinha("│ ⇢nota: oi                    █"), { dest: "nota", msg: "oi" });
assert.deepEqual(rotaDaLinha("│ ⇢nota: oi │"), { dest: "nota", msg: "oi" });

const opencode = [
  "│ ⇢nota: primeira                                   █",
  "│ segunda                                           █",
  "│                                                   █",   // "vazia" com a barra
  "│ ─── isto é a barra de status ───                  █",
  "│ anthropic/claude-sonnet-4                         █",
];
assert.deepEqual(blocoDaRota(opencode, 0), { msg: "primeira\nsegunda", fim: 1 });

// régua/base de caixa também fecha o bloco
assert.deepEqual(
  blocoDaRota(["⇢nota: texto", "mais texto", "╰──────────────╯", "barra de status"], 0),
  { msg: "texto\nmais texto", fim: 1 },
);

// tabela markdown sobrevive: ASCII `|` não é moldura em NENHUMA das duas pontas
assert.deepEqual(
  blocoDaRota(["⇢nota: Status", "| # | Tarefa |", "|---|--------|"], 0),
  { msg: "Status\n| # | Tarefa |\n|---|--------|", fim: 2 },
);

// bloco multilinha tem de enxergar rota com a MESMA régua: primeira linha ASCII
// devolvia msg vazia, e uma rota ASCII seguinte era engolida como corpo
assert.deepEqual(
  blocoDaRota(["->nota: linha 1", "linha 2", "->api: outra"], 0, canvas),
  { msg: "linha 1\nlinha 2", fim: 1 },
);

// diagrama: o bloco vai até a linha em branco
const l1 = ["⇢diagrama-1: flowchart LR", "  A --> B", "  B --> C", "", "sobrou"];
assert.deepEqual(blocoDaRota(l1, 0), { msg: "flowchart LR\n  A --> B\n  B --> C", fim: 2 });

// ...ou até a próxima rota, sem engolir ela
const l2 = ["⇢diagrama-1: flowchart LR", "  A --> B", "⇢api: pronto"];
assert.deepEqual(blocoDaRota(l2, 0), { msg: "flowchart LR\n  A --> B", fim: 1 });
assert.deepEqual(blocoDaRota(l2, 2), { msg: "pronto", fim: 2 });

// ...ou até o fim do pedaço lido do buffer
assert.deepEqual(blocoDaRota(["⇢d: graph TD", "  X-->Y"], 0), { msg: "graph TD\n  X-->Y", fim: 1 });

// linha de continuação perde a moldura do TUI, mas não a indentação de conteúdo
const boxed = ["│ ⇢diagrama-1: flowchart LR", "│   A --> B", "│ ⎿ B --> C", ""];
assert.deepEqual(blocoDaRota(boxed, 0), { msg: "flowchart LR\n  A --> B\nB --> C", fim: 2 });
// tabela markdown sobrevive: `|` não é stripado (agente escrevendo tabela em nota)
const tabela = ["⇢nota: Status", "| # | Tarefa |", "|---|--------|", ""];
assert.deepEqual(blocoDaRota(tabela, 0), { msg: "Status\n| # | Tarefa |\n|---|--------|", fim: 2 });

// rota de uma linha só continua de uma linha só
assert.deepEqual(blocoDaRota(["⇢api: oi", "", "outra coisa"], 0), { msg: "oi", fim: 0 });

console.log("protocolo: ok");
