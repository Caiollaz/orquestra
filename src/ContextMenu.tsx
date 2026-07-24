import { useEffect, useRef, type ReactNode } from "react";

export type MenuItem =
  | { sep: true }
  | { sep?: false; label: string; onClick: () => void; danger?: boolean; icon?: ReactNode };

export type MenuState = { x: number; y: number; items: MenuItem[] };

// Menu de contexto (click direito). Fecha ao clicar fora, Esc, scroll ou blur.
// Reposiciona pra não vazar da janela.
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // clampa dentro da viewport depois de medir
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth) el.style.left = `${window.innerWidth - r.width - 6}px`;
    if (r.bottom > window.innerHeight) el.style.top = `${window.innerHeight - r.height - 6}px`;
  }, [menu]);

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) =>
        it.sep ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className={`ctx-item${it.danger ? " danger" : ""}`}
            onClick={() => { it.onClick(); onClose(); }}
          >
            <span className="ctx-ico">{it.icon}</span>
            <span className="ctx-lbl">{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
