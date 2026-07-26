// Protocolo ⇢NOME: — o parser das rotas que os agentes escrevem no terminal.
// Vive fora do App.tsx porque é lógica pura: dá pra rodar sem React nem Tauri
// (ver protocolo.check.ts).

// Setas aceitas como "isto é uma rota". Pedimos ⇢ (U+21E2) no prompt, mas modelo
// que não é claude normaliza glifo raro na saída: DeepSeek escreveu →opencode-1:
// e a rota morreu em silêncio, com o agente convencido de que delegou. Tolerar na
// ENTRADA não tem custo — linha começando com seta + rótulo + `:` é inequívoca.
//
// ASCII `->` e `=>` ficam FORA de propósito: saída de rustc/cargo é cheia de
// `--> src/main.rs:10:5`, que casaria com dest=src/main.rs.
const SETAS = "⇢→⇒⟹⟶➔➞➜➡⇨↦";

// Prefixos que o TUI enfia antes do texto do agente: bullets (claude usa ⏺),
// marcador de resultado (⎿), citação markdown (>), item de lista (-, *) e
// **caracteres de caixa** — opencode desenha uma borda │ na margem esquerda, e
// sem ela na classe a rota inteira era ignorada.
const PREFIXO = "\\s⏺●•>*\\-⎿│┃╎┆▌▏|";

// linha de rota: "⇢destino: mensagem"
export const ROTA = new RegExp(`^[${PREFIXO}]*[${SETAS}]\\s*([^\\s:]+)\\s*:\\s*(.+)$`, "u");

export const rotaKey = (dest: string, msg: string) => `${dest.toLowerCase()} :: ${msg.trim()}`;

// Destino multilinha (diagrama mermaid): o ⇢ só cabe na primeira linha, então o
// corpo é o que vem depois — até linha em branco ou até a próxima rota. Devolve
// o índice da última linha consumida, pro laço de fora continuar dali.
//
// ponytail: um bloco cortado no meio de duas leituras do buffer chega pela
// metade. Se virar problema, bufferizar por agente até a linha vazia.
// A ROTA tira o prefixo do TUI da PRIMEIRA linha; as de continuação vinham
// verbatim e carregavam a borda junto ("│ - item"), o que sujava a nota e
// quebrava o mermaid. Tira as molduras (e um espaço depois de cada): o resto da
// indentação é conteúdo e fica.
//
// ASCII `|` fica FORA daqui de propósito, embora esteja no prefixo da ROTA:
// linha de tabela markdown começa com `|` e um agente escrevendo tabela numa
// nota é caso comum — stripar ali corromperia a tabela.
const MOLDURA = /^(?:[⎿│┃╎┆▌▏]+ ?)+/u;

export function blocoDaRota(lines: string[], i: number): { msg: string; fim: number } {
  const m = lines[i].match(ROTA);
  if (!m) return { msg: "", fim: i };
  const corpo: string[] = [];
  let j = i;
  while (j + 1 < lines.length && lines[j + 1].trim() && !ROTA.test(lines[j + 1])) {
    corpo.push(lines[++j].replace(MOLDURA, ""));
  }
  return { msg: corpo.length ? [m[2], ...corpo].join("\n") : m[2], fim: j };
}
