import { memo, useEffect, useState } from "react";
import { NodeResizer, Handle, Position, type NodeProps } from "@xyflow/react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ni } from "./node-icons";

export type PortalNodeData = {
  label: string; // endereço nas mensagens ⇢NOME: (claude conectado navega o portal)
  url: string;
  onKill: (id: string) => void;
  onUrl: (id: string, url: string) => void;
};

// Portal = janela de navegador embutida no canvas (MVP: <iframe>).
//
// O agente LÊ a página via ⇢portal-1: ler — mas a leitura NÃO passa por aqui: o
// iframe é same-origin e ilegível de dentro do app, então quem busca é o
// fetch_page (curl no Rust). Consequência prática: o que o agente lê pode
// divergir do que você vê na tela, porque são duas requisições diferentes, sem
// cookie nem sessão em comum.
//
// ponytail: iframe é o mínimo que roda hoje. Muitos sites mandam
// X-Frame-Options/CSP e recusam ser embutidos (daí o botão de janela nativa), e
// o agente não PILOTA a página (clicar/digitar/screenshot). Upgrade real =
// webview nativa do Tauri + ponte com o agente conectado (o source handle segue
// reservado pra isso).
function PortalNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as PortalNodeData;
  const [draft, setDraft] = useState(d.url);
  // o agente também navega (⇢portal-1: url) e a barra ficava mostrando o
  // endereço velho: o rascunho precisa seguir a fonte da verdade
  useEffect(() => setDraft(d.url), [d.url]);
  const go = () => {
    const u = draft.trim();
    d.onUrl(id, /^https?:\/\//.test(u) ? u : `https://${u}`);
  };
  // sites com X-Frame-Options não abrem no iframe → webview nativa em janela
  const popOut = () => {
    if (!d.url) return;
    const w = new WebviewWindow(`portal-${id}-${Date.now()}`, { url: d.url, title: d.label, width: 1100, height: 780 });
    void w.once("tauri://error", () => {});
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
        <button className="agent-btn nodrag" title="Abrir em janela nativa (sites que bloqueiam embed)" onClick={popOut}>{ni.popout}</button>
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
