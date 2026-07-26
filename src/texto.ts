// Corte de texto por BYTES, compartilhado por quem entrega texto no stdin de um
// agente (leitura de página, saída de shell). Mora aqui e não em pagina.ts
// porque tem dois donos.
//
// Por que bytes: MAX_PASTE do Rust é em bytes (pty.rs) e `.length` de JS conta
// unidades UTF-16 — acento pt-BR são 2 bytes, então orçamento em caracteres
// estoura calado.

export type Lado = "inicio" | "fim";

export function trunca(s: string, maxBytes: number, lado: Lado = "inicio"): { texto: string; cortado: boolean; bytes: number } {
  const enc = new TextEncoder();
  const bytes = enc.encode(s).length;
  if (bytes <= maxBytes) return { texto: s, cortado: false, bytes };
  // busca binária no índice de caractere: encolher de 1 em 1 seria O(n²)
  let lo = 0, hi = s.length;
  const cabe = (n: number) => enc.encode(lado === "inicio" ? s.slice(0, n) : s.slice(s.length - n)).length <= maxBytes;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cabe(mid)) lo = mid; else hi = mid - 1;
  }
  let corte = lado === "inicio" ? s.slice(0, lo) : s.slice(s.length - lo);
  // fecha em linha inteira quando a quebra não custa metade do orçamento
  if (lado === "inicio") {
    const nl = corte.lastIndexOf("\n");
    if (nl > lo * 0.5) corte = corte.slice(0, nl);
  } else {
    const nl = corte.indexOf("\n");
    if (nl >= 0 && nl < lo * 0.5) corte = corte.slice(nl + 1);
  }
  return { texto: corte, cortado: true, bytes };
}

export const kb = (n: number) => `${Math.round(n / 1024)}KB`;
