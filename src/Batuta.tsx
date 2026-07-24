import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Batuta = paleta de comandos (Ctrl+K). Tudo que a topbar e os menus fazem,
// alcançável sem sair do teclado: criar nó, abrir workspace, semear contexto,
// trocar de floor, focar um nó pelo rótulo.
export type BatutaItem = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
};

/// Casa em subsequência ("wsp" acha "workspace"). Devolve null quando não casa;
/// número menor = melhor (casar prefixo/palavra inteira ganha de espalhado).
function score(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return direct;
  let i = 0;
  let gaps = 100;
  for (const c of q) {
    const at = t.indexOf(c, i);
    if (at < 0) return null;
    gaps += at - i;
    i = at + 1;
  }
  return gaps;
}

export function Batuta({ items, onClose }: { items: BatutaItem[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const scored = items
      .map((it) => ({ it, s: score(q, `${it.group} ${it.label} ${it.hint ?? ""}`) }))
      .filter((r): r is { it: BatutaItem; s: number } => r.s !== null);
    scored.sort((a, b) => a.s - b.s);
    return scored.slice(0, 40).map((r) => r.it);
  }, [items, q]);

  useEffect(() => { setCursor(0); }, [q]);
  // mantém o item ativo visível ao navegar com as setas
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".batuta-item.is-on")?.scrollIntoView({ block: "nearest" });
  }, [cursor, hits]);

  const pick = (it?: BatutaItem) => { if (it) { onClose(); it.run(); } };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(hits[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="modal-backdrop batuta-backdrop" onMouseDown={onClose}>
      <div className="batuta" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="batuta-input"
          autoFocus
          placeholder="comando, workspace, contexto, nó…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="batuta-list" ref={listRef}>
          {hits.length === 0 && <div className="role-empty">nada encontrado</div>}
          {hits.map((it, i) => (
            <button
              key={it.id}
              className={`batuta-item${i === cursor ? " is-on" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(it)}
            >
              <span className="ctx-ico">{it.icon}</span>
              <span className="batuta-lbl">{it.label}</span>
              <span className="batuta-group">{it.hint ?? it.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
