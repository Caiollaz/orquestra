// Checagem do enquadramento de nota. Não há runner de teste no front (o gate é o
// `tsc`), então isto roda direto no node:
//   node --experimental-strip-types src/nota.check.ts
import assert from "node:assert/strict";
import { enquadraNota, enquadraNotas, modoValido, MODO_PADRAO } from "./nota.ts";

// tarefa manda implementar; contexto só apresenta
const tarefa = enquadraNota("tarefa", "export csv com ; e BOM");
assert.match(tarefa, /^\(tarefa do usuário\)\n/);
assert.match(tarefa, /Implemente\./);
assert.equal(enquadraNota("contexto", "regra: só admin exporta"), "(contexto)\nregra: só admin exporta");

// nota vazia (ou só espaço) não vira submissão: colar um cabeçalho sozinho no
// stdin do agente é pior que não mandar nada
assert.equal(enquadraNota("tarefa", "   \n  "), "");
assert.equal(enquadraNota("contexto", ""), "");

// texto do usuário vai íntegro, sem trim no meio
assert.match(enquadraNota("contexto", "linha 1\n\nlinha 3"), /linha 1\n\nlinha 3$/);

// workspace salvo antes do modo existir cai no padrão
assert.equal(modoValido(undefined), MODO_PADRAO);
assert.equal(modoValido("lixo"), MODO_PADRAO);
assert.equal(modoValido("tarefa"), "tarefa");
assert.equal(MODO_PADRAO, "contexto");

// várias notas: tarefa vem primeiro, vazia é descartada, separador é linha branca
const varias = enquadraNotas([
  { modo: "contexto", texto: "usa ; como separador" },
  { modo: "tarefa", texto: "implementa o export" },
  { modo: "contexto", texto: "   " },
]);
assert.match(varias, /^\(tarefa do usuário\)/);
assert.ok(varias.indexOf("(tarefa do usuário)") < varias.indexOf("(contexto)"));
assert.equal(varias.split("(contexto)").length - 1, 1);
assert.equal(enquadraNotas([]), "");

console.log("nota: ok");
