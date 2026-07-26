// Portal-leitor: o que o agente recebe quando pede `⇢portal-1: ler`.
//
// Tudo aqui é puro e sem DOM de propósito. `DOMParser` daria extração melhor,
// mas o único mecanismo de teste do frontend é rodar o arquivo de checagem no
// node (`node src/pagina.check.ts`), e node não tem DOM. Trocar uma checagem
// rodável por nav-stripping mais bonito não se paga quando quem lê é um LLM.
//
// ponytail: regex, não parser. HTML malformado, `<` dentro de atributo e charset
// não-UTF8 saem tortos. Upgrade = DOMParser na webview (perde a checagem) ou
// dom_query no Rust.

export type ComandoPortal = { ler: boolean; url: string | null };

const VERBOS = new Set(["ler", "leia", "le", "read"]);

// fold de acento: `lê`, `Lê`, `LER` caem todos em `le`/`ler` sem lista de alias
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const pareceUrl = (s: string) => /^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(s);

export const normalizaUrl = (u: string) => {
  const s = u.trim().replace(/^<|>$/g, "").trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

// `ler` / `ler <url>` vs URL pra navegar. O resto só conta como URL se PARECER
// uma — senão "ler a página atual" navegaria pra https://a.
export function comandoPortal(msg: string): ComandoPortal {
  const limpo = msg.trim().replace(/^<|>$/g, "").trim();
  if (!limpo) return { ler: false, url: null };
  const [primeiro, ...resto] = limpo.split(/\s+/);
  if (!VERBOS.has(semAcento(primeiro))) return { ler: false, url: limpo };
  const alvo = resto.join(" ").trim();
  return { ler: true, url: alvo && pareceUrl(alvo) ? alvo : null };
}

const BLOCOS = /<(script|style|noscript|svg|iframe|template|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
};

// &iacute; &ccedil; &atilde;… são centenas de nomes. Em vez da tabela inteira:
// o sufixo nomeia um diacrítico combinante, então letra + combinante + NFC
// resolve o conjunto Latin-1 todo em quatro linhas.
const COMBINANTE: Record<string, string> = {
  acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303",
  uml: "\u0308", cedil: "\u0327", ring: "\u030A",
};

const decodifica = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const nome = code.toLowerCase();
    if (ENTIDADES[nome]) return ENTIDADES[nome];
    // casa no nome minúsculo, mas usa a letra ORIGINAL: &Eacute; é É, não é
    const ac = /^([a-z])(acute|grave|circ|tilde|uml|cedil|ring)$/.exec(nome);
    if (ac) return (code[0] + COMBINANTE[ac[2]]).normalize("NFC");
    return m;
  });

const inline = (s: string) => decodifica(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const absoluta = (href: string, base: string) => {
  if (/^(javascript|mailto|tel):/i.test(href) || href.startsWith("#")) return null;
  try { return new URL(href, base).href; } catch { return null; }
};

// SEGURANÇA: texto de página é fonte totalmente não-confiável — diferente de um
// contexto, que o usuário escreveu. `rememberSent` só engole a rota ecoada dentro
// da janela de ECO_MS, e o TUI redesenha o scrollback: a mesma linha reaparecendo
// depois da janela roteia DE VERDADE. Uma página com `⇢shell-1: rm -rf .` seria
// execução de comando com um passo de atraso. Nenhuma página precisa de U+21E2.
const neutraliza = (s: string) => s.replace(/⇢/g, "->");

const colapsa = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/[^\S\n]+/g, " ").trim())
    // <li> sem conteúdo (item de menu que era só um ícone, ou <li><a></a></li>
    // esvaziado) virava uma linha "-" solta — em página real isso enche de ruído
    .filter((l) => l !== "-")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function deHtml(html: string, base: string): string {
  let s = html.replace(BLOCOS, " ");
  const t = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titulo = t ? `# ${inline(t[1])}\n\n` : "";
  s = s.replace(/<title[^>]*>[\s\S]*?<\/title>/i, " ");
  // links antes de varrer as tags: href é acionável pro agente ("leia, depois siga X")
  s = s.replace(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, txt: string) => {
    const texto = inline(txt);
    if (!texto) return " ";
    const abs = absoluta(href, base);
    return abs ? ` [${texto}](${abs}) ` : ` ${texto} `;
  });
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, txt: string) => `\n\n${"#".repeat(+n)} ${inline(txt)}\n`);
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|tr|section|article|h[1-6])\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  return titulo + decodifica(s);
}

// Ponto de entrada único: decide HTML vs texto cru e neutraliza em UM lugar.
// Corpo sem tag passa cru — faz `raw.githubusercontent`, `.md`, `.txt` e JSON
// funcionarem de graça, em vez de recusar por content-type.
export function extraiTexto(corpo: string, base: string): string {
  const ehHtml = /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(corpo);
  return neutraliza(colapsa(ehHtml ? deHtml(corpo, base) : corpo));
}
