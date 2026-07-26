// Enquadramento do texto de uma nota ao entrar num agente.
//
// Existe porque os três caminhos que injetam nota mandavam em formatos
// diferentes: ao conectar ia CRU, no 3º idle ia com "(contexto das notas
// conectadas)", e o botão ⇢ ia cru de novo. Texto cru chegando logo depois do
// prompt de protocolo — que termina com "Responda apenas OK" — fazia o agente
// responder OK e ignorar a spec que o usuário acabou de escrever.
//
// O modo é escolha do usuário, por nota, não adivinhação do modelo: nota de spec
// e nota de referência são coisas diferentes e só quem escreveu sabe qual é.

export type ModoNota = "contexto" | "tarefa";

export const MODO_PADRAO: ModoNota = "contexto";

// aceita o que veio do workspace salvo (nota antiga não tem modo)
export const modoValido = (v: unknown): ModoNota => (v === "tarefa" ? "tarefa" : MODO_PADRAO);

export function enquadraNota(modo: ModoNota, texto: string): string {
  const t = texto.trim();
  if (!t) return "";
  return modo === "tarefa"
    ? `(tarefa do usuário)\n${t}\n\nImplemente. Se algo estiver ambíguo, pergunte antes de começar.`
    : `(contexto)\n${t}`;
}

// várias notas ligadas no mesmo agente (semeadura do 3º idle). Tarefa primeiro:
// o pedido é o que o agente tem de agir sobre, o contexto é o apoio.
export function enquadraNotas(notas: { modo: ModoNota; texto: string }[]): string {
  const ordem = [...notas].sort((a, b) => Number(b.modo === "tarefa") - Number(a.modo === "tarefa"));
  return ordem.map((n) => enquadraNota(n.modo, n.texto)).filter(Boolean).join("\n\n");
}
