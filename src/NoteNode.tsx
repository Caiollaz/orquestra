import { memo, useEffect, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";
import { noteText } from "./shared";

export type NoteNodeData = {
  onSend: (id: string) => void;
  onKill: (id: string) => void;
};

// evento disparado pelo App quando um agente escreve numa nota (linha ⇢nota: …)
export type NoteWriteDetail = { id: string; text: string };

// Bloco de contexto: texto livre que se liga a agentes.
// ⇢ (source, direita) injeta o texto no stdin dos conectados (bracketed-paste).
// handle de destino (esquerda) recebe o que agentes conectados escrevem via ⇢nota:.
function NoteNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as NoteNodeData;
  const [text, setText] = useState(noteText.get(id) ?? "");

  // agente conectado escreveu nesta nota → anexa e mantém o map em sincronia
  useEffect(() => {
    const h = (e: Event) => {
      const det = (e as CustomEvent<NoteWriteDetail>).detail;
      if (det.id !== id) return;
      setText((t) => {
        const next = (t ? `${t}\n` : "") + det.text;
        noteText.set(id, next);
        return next;
      });
    };
    window.addEventListener("note-write", h);
    return () => window.removeEventListener("note-write", h);
  }, [id]);

  return (
    <div className="note-node">
      <NodeResizer minWidth={200} minHeight={120} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
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
        placeholder="Cole contexto, specs, links… e envie pros agentes conectados. Agentes conectados podem escrever aqui com ⇢nota: texto."
        spellCheck={false}
        onChange={(e) => { setText(e.target.value); noteText.set(id, e.target.value); }}
      />
    </div>
  );
}

export const NoteNode = memo(NoteNodeImpl);
