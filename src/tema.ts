import { terminals } from "./shared";

// Tema claro/escuro. O CSS vive todo em tokens (App.css: :root e
// :root[data-tema="claro"]), então trocar o tema é escrever um atributo no
// <html>. O xterm é a exceção: a paleta dele é JS, não CSS — por isso as duas
// versões moram aqui e os terminais vivos são repintados no toggle.

export type Tema = "escuro" | "claro";

const CHAVE = "orquestra:tema";

export const XTERM_TEMA: Record<Tema, Record<string, string>> = {
  escuro: {
    background: "#06060a",
    foreground: "#e6e6ea",
    cursor: "#ffffff",
    cursorAccent: "#06060a",
    selectionBackground: "#ffffff26",
    black: "#101014",
    red: "#f0616a",
    green: "#3fb950",
    yellow: "#e3b341",
    blue: "#58a6ff",
    magenta: "#db6e8c",
    cyan: "#56d4c0",
    white: "#d4d4d9",
    brightBlack: "#6d6d77",
    brightRed: "#ff8288",
    brightGreen: "#5fd177",
    brightYellow: "#f2c95c",
    brightBlue: "#7fbcff",
    brightMagenta: "#ee8ea9",
    brightCyan: "#7ce6d5",
    brightWhite: "#f4f4f7",
  },
  // no claro os 16 ANSI precisam de tons escuros: os mesmos hexes do escuro
  // sobre fundo branco ficariam ilegíveis (amarelo desaparece)
  claro: {
    background: "#fbfbfd",
    foreground: "#1f2328",
    cursor: "#1f2328",
    cursorAccent: "#fbfbfd",
    selectionBackground: "#0060df2e",
    black: "#24292f",
    red: "#cf222e",
    green: "#116329",
    yellow: "#7d4e00",
    blue: "#0969da",
    magenta: "#8250df",
    cyan: "#1b7c83",
    white: "#6e7781",
    brightBlack: "#57606a",
    brightRed: "#a40e26",
    brightGreen: "#1a7f37",
    brightYellow: "#9a6700",
    brightBlue: "#218bff",
    brightMagenta: "#a475f9",
    brightCyan: "#3192aa",
    brightWhite: "#8c959f",
  },
};

export const temaSalvo = (): Tema => {
  try {
    if (localStorage.getItem(CHAVE) === "claro") return "claro";
    if (localStorage.getItem(CHAVE) === "escuro") return "escuro";
  } catch { /* localStorage bloqueado: cai no tema do sistema */ }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
};

export const aplicaTema = (t: Tema) => {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(CHAVE, t); } catch { /* idem */ }
  // terminais já abertos: a paleta é opção do xterm, não CSS
  for (const term of terminals.values()) term.options.theme = XTERM_TEMA[t];
  // mesma exceção do xterm: o SVG do mermaid tem cor assada dentro, então os
  // diagramas no canvas precisam redesenhar (quem escuta é o MermaidNode)
  window.dispatchEvent(new Event("tema-mudou"));
};
