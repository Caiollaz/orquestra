// Protocolo ⇢NOME: — o parser das rotas que os agentes escrevem no terminal.
// Vive fora do App.tsx porque é lógica pura: dá pra rodar sem React nem Tauri
// (ver protocolo.check.ts).

// linha de rota: "⇢destino: mensagem", tolerando bullets do TUI
export const ROTA = /^[\s⏺●•>*-]*⇢\s*([^\s:]+)\s*:\s*(.+)$/u;

export const rotaKey = (dest: string, msg: string) => `${dest.toLowerCase()} :: ${msg.trim()}`;

// Destino multilinha (diagrama mermaid): o ⇢ só cabe na primeira linha, então o
// corpo é o que vem depois — até linha em branco ou até a próxima rota. Devolve
// o índice da última linha consumida, pro laço de fora continuar dali.
//
// ponytail: um bloco cortado no meio de duas leituras do buffer chega pela
// metade. Se virar problema, bufferizar por agente até a linha vazia.
export function blocoDaRota(lines: string[], i: number): { msg: string; fim: number } {
  const m = lines[i].match(ROTA);
  if (!m) return { msg: "", fim: i };
  const corpo: string[] = [];
  let j = i;
  while (j + 1 < lines.length && lines[j + 1].trim() && !ROTA.test(lines[j + 1])) corpo.push(lines[++j]);
  return { msg: corpo.length ? [m[2], ...corpo].join("\n") : m[2], fim: j };
}
