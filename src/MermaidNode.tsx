import { memo, useEffect, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";
import { PiPencilSimple } from "react-icons/pi";
import { ni } from "./node-icons";
import { noteText } from "./shared";
import { renderMermaid } from "./mermaid";

export type MermaidNodeData = {
  label: string;
  onKill: (id: string) => void;
  onSend: (id: string) => void;
  onEdit: (id: string) => void;
  onDirty?: () => void; // o código do diagrama vive fora do estado do React
};

// agente conectado mandou código novo (⇢rótulo: seguido do bloco mermaid)
export type DiagramWriteDetail = { id: string; src: string };

// Diagrama: mermaid renderizado no canvas. O código-fonte mora no mesmo map das
// notas (`noteText`) — é texto de nó, e assim o botão ⇢ manda o diagrama pros
// agentes conectados de graça. Editar é no modal (duplo-clique ou lápis):
// mermaid é multilinha, não cabe num campo dentro do nó.
function MermaidNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as MermaidNodeData;
  const [src, setSrc] = useState(() => noteText.get(id) ?? "");
  const [svg, setSvg] = useState("");
  const [erro, setErro] = useState("");

  // agente escreveu neste diagrama: SUBSTITUI o código (anexar dois diagramas
  // um embaixo do outro não compila — diferente da nota, que acumula)
  useEffect(() => {
    const h = (e: Event) => {
      const det = (e as CustomEvent<DiagramWriteDetail>).detail;
      if (det.id !== id) return;
      noteText.set(id, det.src);
      setSrc(det.src);
      d.onDirty?.();
    };
    window.addEventListener("diagram-write", h);
    return () => window.removeEventListener("diagram-write", h);
  }, [id]);

  // o modal salva direto no map; ao fechar, o nó relê
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<{ id: string }>).detail.id !== id) return;
      setSrc(noteText.get(id) ?? "");
    };
    window.addEventListener("diagram-saved", h);
    return () => window.removeEventListener("diagram-saved", h);
  }, [id]);

  // o tema entra na conta porque o SVG sai com as cores assadas dentro
  const [tema, setTema] = useState(0);
  useEffect(() => {
    const h = () => setTema((n) => n + 1);
    window.addEventListener("tema-mudou", h);
    return () => window.removeEventListener("tema-mudou", h);
  }, []);

  useEffect(() => {
    let vivo = true;
    void renderMermaid(src).then((r) => {
      if (!vivo) return;
      setSvg(r.svg ?? "");
      setErro(r.erro ?? "");
    });
    return () => { vivo = false; };
  }, [src, tema]);

  return (
    <div className="mmd-node" onDoubleClick={() => d.onEdit(id)}>
      <NodeResizer minWidth={220} minHeight={140} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="mmd-head">
        <span className="mmd-label">{d.label}</span>
        <span className="agent-actions">
          <button className="agent-btn nodrag" title="Editar diagrama" onClick={() => d.onEdit(id)}><PiPencilSimple /></button>
          <button className="agent-btn nodrag" title="Enviar código pros conectados" onClick={() => d.onSend(id)}>{ni.send}</button>
          <button className="agent-btn nodrag" title="Remover diagrama" onClick={() => d.onKill(id)}>{ni.x}</button>
        </span>
      </div>
      <div className="mmd-body nowheel">
        {erro ? <div className="mmd-erro">{erro}</div>
          : svg ? <div className="mmd-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          : <div className="mmd-vazio">duplo-clique pra desenhar</div>}
      </div>
    </div>
  );
}

export const MermaidNode = memo(MermaidNodeImpl);
