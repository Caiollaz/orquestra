import { useEffect, useState } from "react";
import { renderMermaid } from "./mermaid";

// Editor do diagrama: código à esquerda, desenho à direita, erro de sintaxe
// embaixo. Preview com atraso curto — rodar o parser a cada tecla trava a
// digitação em diagrama grande.
export function MermaidEditor({ src, onSave, onClose }: {
  src: string;
  onSave: (src: string) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState(src);
  const [svg, setSvg] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    const t = window.setTimeout(() => {
      void renderMermaid(texto).then((r) => {
        if (!vivo) return;
        // erro não apaga o desenho anterior: some a cada tecla intermediária
        // seria pisca-pisca. Fica o último válido + a mensagem embaixo.
        if (r.erro) setErro(r.erro);
        else { setSvg(r.svg ?? ""); setErro(""); }
      });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [texto]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal mmd-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Diagrama</b>
          <button className="agent-btn" onClick={onClose}>×</button>
        </div>
        <div className="mmd-edit">
          <textarea
            className="mmd-code"
            autoFocus
            spellCheck={false}
            value={texto}
            placeholder={"flowchart LR\n  A[cliente] --> B[api]"}
            onChange={(e) => setTexto(e.target.value)}
            // Ctrl+Enter salva sem tirar a mão do teclado; Esc fecha
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(texto); }
              if (e.key === "Escape") onClose();
            }}
          />
          <div className="mmd-preview">
            {svg ? <div className="mmd-svg" dangerouslySetInnerHTML={{ __html: svg }} />
              : <span className="mmd-vazio">o desenho aparece aqui</span>}
          </div>
        </div>
        {erro && <div className="modal-err mmd-erro-linha">{erro}</div>}
        <div className="dialog-actions">
          {/* sem link: não há plugin de opener no app, e link morto é pior que
              nenhum. Quem quiser a referência abre num nó portal. */}
          <span className="mmd-doc">flowchart · sequenceDiagram · classDiagram · erDiagram · gantt</span>
          <button onClick={onClose}>cancelar</button>
          <button className="btn-claude" onClick={() => onSave(texto)}>salvar</button>
        </div>
      </div>
    </div>
  );
}
