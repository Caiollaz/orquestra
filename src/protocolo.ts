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

// Seta ASCII. Fica FORA da ROTA pelo motivo acima, mas ignorá-la de vez custou
// caro: caso real, o claude respondeu `->nota: oi` e a rota morreu calada. O
// modelo escreve o que é fácil de digitar, não o glifo que pedimos.
//
// A saída é condicionar, não alargar: seta ASCII só vira rota quando o DESTINO
// é um endereço que existe (rótulo de nó no canvas, `nota` ou `todos`). Isso
// mata o falso positivo do rustc por construção — `src/main.rs` não é rótulo de
// nó — sem depender de heurística sobre a forma do texto.
export const ROTA_ASCII = new RegExp(`^[${PREFIXO}]*(?:->|=>)\\s*([^\\s:]+)\\s*:\\s*(.+)$`, "u");

// O parser é lógica pura e não conhece o canvas: quem sabe quais endereços
// existem é o App, que injeta `conhecido`. Sem ele, só seta unicode passa.
//
// A `msg` sai SEM moldura: a ROTA tira o prefixo do TUI da esquerda, mas a ponta
// direita (borda de caixa, barra de rolagem) ficava colada no fim do texto.
export function rotaDaLinha(
  line: string,
  conhecido: (dest: string) => boolean = () => false,
): { dest: string; msg: string } | null {
  const m = line.match(ROTA) ?? ((a) => (a && conhecido(a[1]) ? a : null))(line.match(ROTA_ASCII));
  return m ? { dest: m[1], msg: semMoldura(m[2]).trimEnd() } : null;
}

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
// nota é caso comum — stripar ali corromperia a tabela. Vale pras duas pontas:
// linha de tabela TERMINA com `|` também.
const MOLDURA_ESQ = /^(?:[⎿│┃╎┆▌▏]+ ?)+/u;

// A ponta DIREITA existe por causa da barra de rolagem: o opencode desenha `█`
// (e meios-blocos) na coluna da direita, em TODA linha da área de mensagens. Uma
// linha em branco vinha como "            █" — que não é vazia pro `.trim()`, e
// o bloco não parava nela: engolia a tela inteira até a barra de status. Sintoma
// exato: pedir uma nota e receber o texto + o nome do modelo + "barras pretas".
const MOLDURA_DIR = /\s*[│┃╎┆█▉▊▋▌▍▎▏░▒▓]+\s*$/u;

// Linha que é só régua/borda de caixa fecha o bloco. O TUI desenha a base da
// caixa antes da barra de status; sem isto ela e tudo abaixo entravam na nota.
// Só box-drawing: `---` de markdown é ASCII e continua sendo conteúdo.
const REGUA = /^[\s─━═╌╍┄┅┈┉╭╮╰╯┌┐└┘├┤┬┴┼╔╗╚╝║╠╣╦╩╬]+$/u;

export const semMoldura = (s: string) => s.replace(MOLDURA_ESQ, "").replace(MOLDURA_DIR, "");

// Fim do bloco: linha que sobra vazia depois de tirar a moldura, ou régua.
const fechaBloco = (linha: string) => {
  const limpa = semMoldura(linha);
  return !limpa.trim() || REGUA.test(limpa);
};

// `conhecido` vai junto porque o bloco tem de enxergar rota com a MESMA régua do
// laço: se o laço aceita `->nota:` e o bloco não, ele não acha a mensagem da
// primeira linha (volta vazio) nem para na rota seguinte (engole ela como corpo).
export function blocoDaRota(
  lines: string[],
  i: number,
  conhecido: (dest: string) => boolean = () => false,
): { msg: string; fim: number } {
  const m = rotaDaLinha(lines[i], conhecido);
  if (!m) return { msg: "", fim: i };
  const corpo: string[] = [];
  let j = i;
  while (j + 1 < lines.length && !fechaBloco(lines[j + 1]) && !rotaDaLinha(lines[j + 1], conhecido)) {
    corpo.push(semMoldura(lines[++j]).trimEnd());
  }
  return { msg: corpo.length ? [m.msg, ...corpo].join("\n") : m.msg, fim: j };
}
