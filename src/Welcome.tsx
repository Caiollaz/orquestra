import { useEffect, useState } from "react";
import {
  PiTerminalWindow, PiRobot, PiNote, PiTreeStructure, PiGlobeHemisphereWest,
  PiStack, PiFileText, PiMusicNotes, PiCode, PiFloppyDisk, PiCaretDown,
} from "react-icons/pi";
import { checkPrereqs, type Prereqs } from "./lib/tauri";

// Boas-vindas de primeiro uso. Duas funções, nesta ordem de importância:
//
// 1. ENSINAR. O canvas abre vazio e o único ponto de entrada é a ilha lá em
//    cima, que por padrão está recolhida numa pastilha — quem não passa o mouse
//    por cima não descobre que ali mora o app inteiro. Era a queixa: gente
//    instalando e não sabendo usar.
// 2. Conferir pré-requisitos: o Orquestra não embute o claude, roda o CLI da
//    máquina. Sem isso o usuário só descobre quando um nó abre com "os error 2".
//    Com `npx` o requisito deixa de ser bloqueante (ver PACOTE_NPM em pty.rs).
//
// Em passos, não numa página só: onboarding longo não é lido. Cada passo cabe
// numa tela e responde uma pergunta — onde clico / como eles conversam / o que
// falta instalar.

const WIN = navigator.userAgent.includes("Windows");
const KEY = "orquestra:welcomed";

export const jaViuBoasVindas = () => localStorage.getItem(KEY) === "1";

const installClaude = WIN
  ? "irm https://claude.ai/install.ps1 | iex"
  : "curl -fsSL https://claude.ai/install.sh | bash";

const MOD = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";

function Item({ ok, name, children }: { ok: boolean | null; name: string; children: React.ReactNode }) {
  return (
    <div className="wc-item">
      <span className={`wc-dot ${ok === null ? "wc-wait" : ok ? "wc-ok" : "wc-no"}`}>
        {ok === null ? "…" : ok ? "✓" : "✕"}
      </span>
      <div className="wc-item-body">
        <b>{name}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}

/** Uma faixa do mapa da ilha: ícones + o que aquele grupo faz. */
function Grupo({ icones, titulo, children }: { icones: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="wc-grupo">
      <span className="wc-grupo-ico">{icones}</span>
      <div className="wc-item-body">
        <b>{titulo}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}

// ── passo 1: a ilha ───────────────────────────────────────────────────
function PassoIlha() {
  return (
    <>
      <p className="dialog-msg">
        Todo o app mora na <b>ilha</b>, a pastilha no topo do canvas. Ela fica
        recolhida mostrando só o projeto aberto e quantos agentes estão vivos —
        <b> passe o mouse por cima</b> e ela vira a barra inteira. Sozinha, ela
        também estica pra avisar o que está acontecendo (mensagem indo de um
        agente pro outro, workspace salvo, agente que saiu).
      </p>

      <div className="wc-mapa">
        <Grupo icones={<PiCaretDown />} titulo="Projeto">
          O nome da pasta aberta. Clique pra trocar de workspace, abrir outra
          pasta, renomear ou remover. Cada projeto guarda o canvas inteiro — nós,
          ligações, notas, papéis — e salva sozinho.
        </Grupo>
        <Grupo icones={<PiStack />} titulo="Floors">
          Uma branch isolada por tarefa (<code>git worktree</code>). Com um floor
          ativo, todo agente novo nasce lá dentro em vez de mexer na raiz.
        </Grupo>
        <Grupo
          icones={<><PiTerminalWindow /><PiRobot /><PiNote /><PiTreeStructure /><PiGlobeHemisphereWest /></>}
          titulo="Criar nó"
        >
          Terminal shell · agente (claude, codex, gemini, opencode, antigravity) ·
          bloco de contexto · diagrama · portal (navegador embutido). Clique com o
          <b> botão direito no canvas</b> pra criar já na posição do cursor.
        </Grupo>
        <Grupo icones={<><PiFileText /><PiMusicNotes /><PiCode /><PiFloppyDisk /></>} titulo="Projeto e atalhos">
          Contextos do projeto · Batuta (<kbd>{MOD}+K</kbd>, faz tudo pelo
          teclado) · abrir no editor · salvar (<kbd>{MOD}+S</kbd>) · tema.
        </Grupo>
      </div>

      <p className="wc-note">
        No canvas: roda do mouse dá zoom, roda na horizontal move de lado, e
        arrastar o fundo move a vista. Dentro de um terminal a roda rola o
        terminal, não o canvas.
      </p>
    </>
  );
}

// ── passo 2: como os agentes conversam ────────────────────────────────
function PassoRotas() {
  return (
    <>
      <p className="dialog-msg">
        O que torna o Orquestra diferente de várias abas de terminal: os nós
        <b> se falam</b>. Ligue a saída de um na entrada do outro arrastando de
        uma borda à outra — <b>sem ligação, sem mensagem</b>. O cabo acende
        quando passa dado.
      </p>

      <p className="dialog-msg">
        Ligado, o agente escreve uma linha no formato{" "}
        <code>⇢NOME: mensagem</code>, onde NOME é o título do nó de destino. O
        que acontece depende de <b>quem recebe</b>:
      </p>

      <div className="wc-rotas">
        <div><code>⇢claude-2:</code><span>manda a mensagem pro outro agente</span></div>
        <div><code>⇢shell-1:</code><span><b>executa</b> a linha naquele terminal</span></div>
        <div><code>⇢portal-1:</code><span>navega o navegador até a URL</span></div>
        <div><code>⇢nota:</code><span>escreve na nota conectada</span></div>
        <div><code>⇢todos:</code><span>manda pra todos os nós ligados nele</span></div>
      </div>

      <p className="wc-note">
        Por isso o <b>rótulo do nó é um endereço</b>: peça "rode os testes no
        terminal" pro claude e ele delega com <code>⇢shell-1: pnpm test</code> em
        vez de rodar sozinho. Renomear um nó avisa todo mundo que aponta pra ele.
      </p>

      <div className="wc-mapa">
        <Grupo icones={<PiFileText />} titulo="Papel × contexto">
          <b>Papel</b> é <i>quem o agente é</i> — um por agente, com 8 prontos
          (Maestro, Revisor, Caçador de Bugs…). <b>Contexto</b> é <i>o que ele
          precisa saber</i> — regra de negócio, arquitetura, contrato —, vários
          por agente. Marque contextos como padrão do projeto e todo agente novo
          já nasce sabendo, sem copiar e colar.
        </Grupo>
      </div>
    </>
  );
}

// ── passo 3: pré-requisitos ───────────────────────────────────────────
function PassoPrereqs({ p, recheck }: { p: Prereqs | null; recheck: () => void }) {
  return (
    <>
      <p className="dialog-msg">
        Cada nó é um terminal rodando um agente de verdade. O Orquestra{" "}
        <b>não instala</b> esses agentes — ele chama os que já estão na sua
        máquina. Confira o que ele encontrou:
      </p>

      <Item ok={p ? p.claude || p.npx : null} name="claude — CLI do Claude Code">
        {p?.claude
          ? "encontrado no PATH."
          : p?.npx
            ? "sem o binário, mas você tem npx: o app roda via npm. A primeira execução baixa o pacote e demora."
            : "não encontrado. O app de desktop do Claude não conta — precisa do comando de terminal."}
      </Item>
      {p && !p.claude && !p.npx && (
        <div className="wc-fix">
          <span>Instale e reinicie o Orquestra:</span>
          <code>{installClaude}</code>
          <span>ou via npm: <code>npm i -g @anthropic-ai/claude-code</code></span>
        </div>
      )}

      <Item ok={p?.node ?? null} name="node — Node.js 18+ (recomendado)">
        {p?.node ? "ok." : "o claude usa Node nos subprocessos. Sem ele: node: not found."}
      </Item>
      <Item ok={p?.git ?? null} name="git (opcional — só pros Floors)">
        {p?.git ? "ok." : "só precisa se for usar Floors (git worktree por feature)."}
      </Item>

      <p className="wc-note">
        <code>codex</code>, <code>gemini</code> e <code>opencode</code> são nós
        próprios, não nós shell — e seguem a mesma regra do claude: binário no
        PATH, ou npx. Só o <code>agy</code> (antigravity) não tem pacote npm e
        precisa estar instalado. Rechecar não custa nada:{" "}
        <button className="wc-link" onClick={recheck}>rechecar agora</button>.
      </p>
    </>
  );
}

const PASSOS = [
  { titulo: "onde fica tudo", el: "ilha" },
  { titulo: "como eles conversam", el: "rotas" },
  { titulo: "antes de começar", el: "prereqs" },
] as const;

export function Welcome({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<Prereqs | null>(null);
  const [passo, setPasso] = useState(0);

  const recheck = () => { setP(null); void checkPrereqs().then(setP); };
  useEffect(recheck, []);

  const fechar = () => { localStorage.setItem(KEY, "1"); onClose(); };
  const ultimo = passo === PASSOS.length - 1;

  return (
    <div className="modal-backdrop" onMouseDown={fechar}>
      <div className="modal wc" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wc-hero">
          <span className="wc-mark">or<i>q</i>uestra</span>
          <div className="dialog-title" style={{ margin: 0 }}>{PASSOS[passo].titulo}</div>
        </div>

        <div className="wc-corpo">
          {passo === 0 && <PassoIlha />}
          {passo === 1 && <PassoRotas />}
          {passo === 2 && <PassoPrereqs p={p} recheck={recheck} />}
        </div>

        <div className="wc-rodape">
          <div className="wc-pontos" role="tablist" aria-label="passos">
            {PASSOS.map((s, i) => (
              <button
                key={s.el}
                role="tab"
                aria-selected={i === passo}
                aria-label={s.titulo}
                className={`wc-ponto${i === passo ? " on" : ""}`}
                onClick={() => setPasso(i)}
              />
            ))}
          </div>
          <div className="dialog-actions" style={{ margin: 0 }}>
            {passo > 0 && <button onClick={() => setPasso(passo - 1)}>voltar</button>}
            {ultimo ? (
              <button className="btn-claude" onClick={fechar}>
                {p && (p.claude || p.npx) ? "começar" : "começar mesmo assim"}
              </button>
            ) : (
              <button className="btn-claude" onClick={() => setPasso(passo + 1)}>próximo</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
