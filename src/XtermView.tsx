import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";
import { spawnAgent, writeStdin, resizePty, killAgent, type AgentCmd } from "./lib/tauri";
import { terminals } from "./shared";

// Terminal xterm ligado a um PTY no Rust. Instância vive fora do React (ref).
export function XtermView({ agentId, cmd, cwd }: { agentId: string; cmd: AgentCmd; cwd: string }) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 12,
      cursorBlink: true,
      // canvas addon (não webgl): não estoura contextos com N terminais no canvas
      allowProposedApi: true,
      // paleta quente do app (fosso de orquestra) — casa com App.css
      theme: {
        background: "#14110f",
        foreground: "#e6ddd0",
        cursor: "#c69a55",
        cursorAccent: "#14110f",
        selectionBackground: "#c69a5540",
        black: "#1c1917",
        red: "#cf6a55",
        green: "#8fa876",
        yellow: "#d9a85f",
        blue: "#8ba3c7",
        magenta: "#b58dae",
        cyan: "#82a8a0",
        white: "#d8d0c4",
        brightBlack: "#6b6259",
        brightRed: "#e08a76",
        brightGreen: "#a9c290",
        brightYellow: "#eec27e",
        brightBlue: "#a9bedd",
        brightMagenta: "#cfa9c8",
        brightCyan: "#9fc4bc",
        brightWhite: "#efe9df",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new CanvasAddon());
    term.open(boxRef.current!);
    fit.fit();

    terminals.set(agentId, term);
    term.onData((d) => void writeStdin(agentId, d));
    // erro de spawn (ex: binário não encontrado) aparece no terminal em vez de tela vazia
    spawnAgent(agentId, cmd, cwd, term.cols, term.rows, (bytes) => term.write(bytes)).catch((e) =>
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
      ro.disconnect();
      terminals.delete(agentId);
      void killAgent(agentId);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return <div ref={boxRef} className="xterm-box" />;
}
