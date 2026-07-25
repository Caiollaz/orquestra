// Checagem do parser de rota. Não há runner de teste no front (o gate é o
// `tsc`), então isto roda direto no node:
//   node --experimental-strip-types src/protocolo.check.ts
import assert from "node:assert/strict";
import { ROTA, rotaKey, blocoDaRota } from "./protocolo.ts";

// rota simples, com e sem bullet do TUI
assert.deepEqual("⇢api: sobe o servidor".match(ROTA)?.slice(1), ["api", "sobe o servidor"]);
assert.deepEqual("⏺ ⇢api: sobe".match(ROTA)?.slice(1), ["api", "sobe"]);
assert.equal("nada aqui".match(ROTA), null);
assert.equal(rotaKey("API", " oi "), "api :: oi");

// diagrama: o bloco vai até a linha em branco
const l1 = ["⇢diagrama-1: flowchart LR", "  A --> B", "  B --> C", "", "sobrou"];
assert.deepEqual(blocoDaRota(l1, 0), { msg: "flowchart LR\n  A --> B\n  B --> C", fim: 2 });

// ...ou até a próxima rota, sem engolir ela
const l2 = ["⇢diagrama-1: flowchart LR", "  A --> B", "⇢api: pronto"];
assert.deepEqual(blocoDaRota(l2, 0), { msg: "flowchart LR\n  A --> B", fim: 1 });
assert.deepEqual(blocoDaRota(l2, 2), { msg: "pronto", fim: 2 });

// ...ou até o fim do pedaço lido do buffer
assert.deepEqual(blocoDaRota(["⇢d: graph TD", "  X-->Y"], 0), { msg: "graph TD\n  X-->Y", fim: 1 });

// rota de uma linha só continua de uma linha só
assert.deepEqual(blocoDaRota(["⇢api: oi", "", "outra coisa"], 0), { msg: "oi", fim: 0 });

console.log("protocolo: ok");
