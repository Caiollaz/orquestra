import { memo, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";
import { noteText } from "./shared";

export type NoteNodeData = {
  onSend: (id: string) => void;
  onKill: (id: string) => void;
};

// Bloco de contexto: texto livre que se liga a agentes. ⇢ injeta o texto no stdin
// dos conectados (bracketed-paste), pra dar contexto a um ou vários agentes de uma vez.
function NoteNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as NoteNodeData;
  const [text, setText] = useState(noteText.get(id) ?? "");
  return (
    <div className="note-node">
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <Handle type="source" position={Position.Right} />
      <div className="note-head">
        <span className="note-label">contexto</span>
        <span className="agent-actions">
          <button className="agent-btn nodrag" title="Injetar texto nos conectados" onClick={() => d.onSend(id)}>⇢</button>
          <button className="agent-btn nodrag" title="Remover bloco" onClick={() => d.onKill(id)}>×</button>
        </span>
      </div>
      <textarea
        className="note-area nodrag nowheel"
        value={text}
        placeholder="Cole contexto, specs, links… e envie pros agentes conectados."
        spellCheck={false}
        onChange={(e) => { setText(e.target.value); noteText.set(id, e.target.value); }}
      />
    </div>
  );
}

export const NoteNode = memo(NoteNodeImpl);
