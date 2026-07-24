import { memo, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";
import { ni } from "./node-icons";

export type PortalNodeData = {
  label: string; // endereço nas mensagens ⇢NOME: (claude conectado navega o portal)
  url: string;
  onKill: (id: string) => void;
  onUrl: (id: string, url: string) => void;
};

// Portal = janela de navegador embutida no canvas (MVP: <iframe>).
// ponytail: iframe é o mínimo que roda hoje. Muitos sites mandam
// X-Frame-Options/CSP e recusam ser embutidos; e o agente ainda não pilota a
// página (clicar/digitar/screenshot). Upgrade real = webview nativa do Tauri +
// ponte com o agente conectado (source handle já exposto pra essa ligação futura).
function PortalNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as PortalNodeData;
  const [draft, setDraft] = useState(d.url);
  const go = () => {
    const u = draft.trim();
    d.onUrl(id, /^https?:\/\//.test(u) ? u : `https://${u}`);
  };
  return (
    <div className="portal-node">
      <NodeResizer minWidth={280} minHeight={200} isVisible={selected} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="portal-head">
        <span className="portal-label">{d.label}</span>
        <input
          className="portal-url nodrag"
          value={draft}
          spellCheck={false}
          placeholder="url…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
        />
        <button className="agent-btn nodrag" title="Ir" onClick={go}>{ni.enter}</button>
        <button className="agent-btn nodrag" title="Remover" onClick={() => d.onKill(id)}>{ni.x}</button>
      </div>
      {d.url ? (
        <iframe className="portal-frame nodrag nowheel" src={d.url} title={`portal-${id}`} sandbox="allow-scripts allow-same-origin allow-forms" />
      ) : (
        <div className="portal-empty">digite uma url acima</div>
      )}
    </div>
  );
}

export const PortalNode = memo(PortalNodeImpl);
