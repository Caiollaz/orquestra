import { temaSalvo, type Tema } from "./tema";

// Carga do mermaid sob demanda: são ~2 MB de parser que a maioria dos canvas
// nunca abre. Uma promessa só, compartilhada por todos os nós de diagrama.
let carga: Promise<typeof import("mermaid").default> | null = null;
const carregar = () => (carga ??= import("mermaid").then((m) => m.default));

// Mesma exceção do xterm (ver tema.ts): a paleta do mermaid é config JS, não
// CSS, então as duas versões moram aqui em vez de sair de token. Nada de azul
// de marca — ele é reservado (naipe, workspace ativo, cabo aceso).
const MMD_TEMA: Record<Tema, Record<string, string>> = {
  escuro: {
    background: "#17171b",
    primaryColor: "#17171b",
    primaryTextColor: "#e6e6ea",
    primaryBorderColor: "#3a3a44",
    secondaryColor: "#101014",
    tertiaryColor: "#0a0a0c",
    lineColor: "#8b8b93",
    textColor: "#e6e6ea",
    mainBkg: "#1d1d22",
    nodeBorder: "#3a3a44",
    clusterBkg: "#101014",
    clusterBorder: "#2b2b32",
    titleColor: "#f2f2f4",
    edgeLabelBackground: "#131317",
  },
  claro: {
    background: "#fffdf3",
    primaryColor: "#f3f1e4",
    primaryTextColor: "#23231f",
    primaryBorderColor: "#c2bfae",
    secondaryColor: "#eceadd",
    tertiaryColor: "#f7f7f8",
    lineColor: "#62626c",
    textColor: "#23231f",
    mainBkg: "#f3f1e4",
    nodeBorder: "#c2bfae",
    clusterBkg: "#f7f6ec",
    clusterBorder: "#dcdce1",
    titleColor: "#16161a",
    edgeLabelBackground: "#fffdf3",
  },
};

let seq = 0;

// Renderiza pra string de SVG. Erro de sintaxe não é exceção pra tratar lá em
// cima: é o estado normal de quem está digitando o diagrama, então volta como
// dado (o editor mostra a mensagem embaixo do preview).
export async function renderMermaid(src: string): Promise<{ svg: string; erro?: undefined } | { svg?: undefined; erro: string }> {
  const texto = src.trim();
  if (!texto) return { svg: "" };
  const mm = await carregar();
  // initialize a cada render (é só atribuir config): assim o diagrama segue o
  // tema atual sem precisar recarregar o módulo.
  mm.initialize({
    startOnLoad: false,
    securityLevel: "strict", // sem <script>/click handler: o código pode vir de agente
    theme: "base",
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    themeVariables: MMD_TEMA[temaSalvo()],
  });
  const id = `mmd-${++seq}`;
  try {
    const { svg } = await mm.render(id, texto);
    return { svg };
  } catch (e) {
    // mermaid deixa o <div> temporário órfão no body quando o parse quebra —
    // sem isso, cada tecla digitada num diagrama inválido vaza um nó no DOM.
    document.getElementById(`d${id}`)?.remove();
    return { erro: String((e as { message?: string })?.message ?? e) };
  }
}
