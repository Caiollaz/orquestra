import { useEffect, useRef, useState } from "react";
import { useOnViewportChange, useReactFlow } from "@xyflow/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { spawnAgent, writeStdin, resizePty, killAgent, type AgentCmd } from "./lib/tauri";
import { terminals } from "./shared";
import { XTERM_TEMA, temaSalvo } from "./tema";

// ponytail: 1s sem output = agente ocioso; spinner do claude emite a cada ~100ms
const IDLE_MS = 1000;

const FONTE = 12;

// Terminal xterm ligado a um PTY no Rust. Instância vive fora do React (ref).
export function XtermView({ agentId, cmd, cwd, onIdle, onSpawn }: {
  agentId: string; cmd: AgentCmd; cwd: string;
  onIdle?: (id: string) => void;
  /// avisa que subiu um processo NOVO pra esse id (montagem ou remontagem do nó):
  /// o processo não lembra nada, então quem semeia protocolo/contexto precisa
  /// esquecer o que já semeou pro id.
  onSpawn?: (id: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const rf = useReactFlow();

  // ── zoom: rasterizar em pixel nativo em vez de esticar o DOM ───────────
  // O React Flow escala o pane inteiro com transform: scale(z). Um terminal
  // dentro disso é texto DOM esticado: as linhas do xterm têm altura inteira em
  // CSS px, mas multiplicadas por um z fracionário cada uma cai numa fronteira
  // de pixel diferente, e o arredondamento aparece como costura entre linhas —
  // o "quebrado" visível no Windows (WebView2 arredonda mais duro que o
  // WebKitGTK, e ainda entra o fator de escala do monitor).
  // Truque: a caixa cresce z× no layout, a fonte cresce z×, e um scale(1/z)
  // cancela o scale(z) do pane. Transform acumulado = identidade, então os
  // glifos são rasterizados no tamanho final, sem transform nenhum — é o mesmo
  // caminho de um app nativo, e a costura entre linhas desaparece.
  // Só pra z > 1: ao afastar, deixar o DOM encolher é mais barato e não costura.
  // Não usar `zoom` do CSS aqui: dentro dele o xterm mede a célula com
  // getBoundingClientRect (escalado) e o FitAddon mede a caixa com clientHeight
  // (não escalado) — as duas contas divergem e o terminal perde metade das
  // linhas. Medido: 19 linhas viravam 9.
  // O reajuste no fim do gesto pode mover ±1 coluna (a métrica da fonte
  // arredonda: 12px dá linha de 14px, 20.7px dá 27px, não é proporcional), aí a
  // TUI do agente redesenha — mesmo efeito de redimensionar o nó, que o
  // ResizeObserver abaixo já provoca.
  const [z, setZ] = useState(1);
  const zc = Math.max(1, z);
  useOnViewportChange({ onEnd: (vp) => setZ(vp.zoom) });
  useEffect(() => { setZ(rf.getZoom()); }, [rf]);

  useEffect(() => {
    const fit = fitRef.current, term = terminals.get(agentId);
    if (!fit || !term) return;
    term.options.fontSize = FONTE * zc;
    try {
      fit.fit();
      void resizePty(agentId, term.cols, term.rows);
    } catch { /* nó pode estar oculto */ }
  }, [zc, agentId]);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: FONTE,
      cursorBlink: true,
      // renderer DOM (sem canvas/webgl): é texto de verdade, então escala sem
      // virar bitmap borrado. A nitidez vem da contra-escala acima.
      // ponytail: se N terminais com TUI pesado jankarem, upgrade = webgl addon
      // só no terminal focado (canvas addon foi removido por causa do borrão).
      allowProposedApi: true,
      // paleta em tema.ts (o xterm não lê CSS): o toggle de tema repinta os
      // terminais vivos iterando o Map de shared.ts
      theme: XTERM_TEMA[temaSalvo()],
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(boxRef.current!);
    fitRef.current = fit;
    term.options.fontSize = FONTE * Math.max(1, rf.getZoom());
    fit.fit();

    terminals.set(agentId, term);
    term.onData((d) => void writeStdin(agentId, d));

    // debounce de ociosidade: cada rajada de output reinicia o timer
    let idleTimer: number | undefined;
    const bump = () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => onIdle?.(agentId), IDLE_MS);
    };

    onSpawn?.(agentId);
    // erro de spawn (ex: binário não encontrado) aparece no terminal em vez de tela vazia
    spawnAgent(agentId, cmd, cwd, term.cols, term.rows, (bytes) => { term.write(bytes); bump(); }).catch((e) =>
      term.write(`\r\n\x1b[31m[falha ao iniciar: ${e}]\x1b[0m\r\n`),
    );

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        void resizePty(agentId, term.cols, term.rows);
      } catch { /* nó pode estar oculto */ }
    });
    ro.observe(boxRef.current!);

    return () => {
      clearTimeout(idleTimer);
      ro.disconnect();
      fitRef.current = null;
      terminals.delete(agentId);
      void killAgent(agentId);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return (
    <div
      ref={boxRef}
      className="xterm-box"
      style={zc === 1 ? undefined : {
        width: `${zc * 100}%`, height: `${zc * 100}%`,
        transform: `scale(${1 / zc})`, transformOrigin: "0 0",
      }}
    />
  );
}
