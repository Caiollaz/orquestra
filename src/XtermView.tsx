import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { spawnAgent, writeStdin, resizePty, killAgent, type AgentCmd } from "./lib/tauri";
import { terminals } from "./shared";

// ponytail: 1s sem output = agente ocioso; spinner do claude emite a cada ~100ms
const IDLE_MS = 1000;

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

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      cursorBlink: true,
      // renderer DOM (sem canvas/webgl): texto real escala NÍTIDO no zoom do
      // React Flow — o canvas addon virava bitmap borrado ao ampliar.
      // ponytail: se N terminais com TUI pesado jankarem, upgrade = webgl addon
      // só no terminal focado (canvas addon foi removido por causa do borrão).
      allowProposedApi: true,
      // paleta quente do app (fosso de orquestra) — casa com App.css
      theme: {
        background: "#0c0c0e",
        foreground: "#e4e4e8",
        cursor: "#ffffff",
        cursorAccent: "#0c0c0e",
        selectionBackground: "#ffffff26",
        black: "#17171b",
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
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(boxRef.current!);
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
      terminals.delete(agentId);
      void killAgent(agentId);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return <div ref={boxRef} className="xterm-box" />;
}
