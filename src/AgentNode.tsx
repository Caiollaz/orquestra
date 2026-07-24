import { memo, type CSSProperties } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";
import { XtermView } from "./XtermView";
import type { AgentCmd } from "./lib/tauri";

export type AgentNodeData = {
  label: string;
  cmd: AgentCmd;
  cwd: string;
  section: string; // cor do naipe (borda, lâmpada, handles) via --section
  exited?: boolean; // setado pelo App quando o backend emite "agent-exited"
  onKill: (id: string) => void;
  onSend: (id: string) => void;
};

// Nó = frame + header arrastável + terminal. Handles ligam nós; `nodrag/nowheel`
// deixam mouse/scroll pro xterm. Botão ⇢ envia a seleção do terminal pros conectados.
function AgentNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  return (
    <div
      className={`agent-node${d.exited ? " is-exited" : ""}`}
      style={{ "--section": d.section } as CSSProperties}
    >
      <NodeResizer minWidth={320} minHeight={200} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="agent-head">
        <span className="agent-title">
          <span className="agent-lamp" />
          <span className="agent-label">{d.label}</span>
          {d.exited && <span className="agent-exited-tag">saiu</span>}
        </span>
        <span className="agent-actions">
          <button className="agent-btn nodrag" title="Enviar seleção pros conectados" onClick={() => d.onSend(id)}>⇢</button>
          <button className="agent-btn nodrag" title="Encerrar agente" onClick={() => d.onKill(id)}>×</button>
        </span>
      </div>
      <div className="agent-term nodrag nowheel">
        <XtermView agentId={id} cmd={d.cmd} cwd={d.cwd} />
      </div>
    </div>
  );
}

export const AgentNode = memo(AgentNodeImpl);
