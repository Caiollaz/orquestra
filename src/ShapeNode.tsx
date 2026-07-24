import { memo, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";

export type ShapeNodeData = {
  label: string;
  variant: "box" | "pill"; // retângulo (componente) ou pílula (fluxo/decisão)
  onKill: (id: string) => void;
  onLabel: (id: string, label: string) => void;
};

// Forma de diagrama: caixa/rótulo pra desenhar arquitetura no canvas. Setas entre
// formas (e pra agentes) = arestas do React Flow. Handles nos 4 lados pra ligar
// em qualquer direção. Duplo-clique edita o rótulo. (Freehand fica pra depois.)
function ShapeNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as ShapeNodeData;
  const [editing, setEditing] = useState(false);
  const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left];
  return (
    <div className={`shape-node shape-${d.variant}${selected ? " is-sel" : ""}`} onDoubleClick={() => setEditing(true)}>
      <NodeResizer minWidth={80} minHeight={48} isVisible={selected} />
      {sides.map((p) => (
        <Handle key={`t-${p}`} id={`t-${p}`} type="target" position={p} className="shape-handle" />
      ))}
      {sides.map((p) => (
        <Handle key={`s-${p}`} id={`s-${p}`} type="source" position={p} className="shape-handle" />
      ))}
      <button className="shape-x nodrag" title="Remover" onClick={() => d.onKill(id)}>×</button>
      {editing ? (
        <input
          className="shape-input nodrag"
          autoFocus
          defaultValue={d.label}
          onBlur={(e) => { d.onLabel(id, e.target.value); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      ) : (
        <span className="shape-label">{d.label || "duplo-clique p/ editar"}</span>
      )}
    </div>
  );
}

export const ShapeNode = memo(ShapeNodeImpl);
