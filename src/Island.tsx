import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Dynamic Island do orquestra: pastilha compacta que MORFA — expande no hover
// pra barra completa, e estica sozinha pra mostrar atividades ao vivo
// (mensagem fluindo entre agentes, agente que saiu, workspace salvo).
// Largura anima via FLIP + WAAPI com easing de mola; conteúdo troca com
// fade/blur/slide. Respeita prefers-reduced-motion.

export type IslandActivity = { text: string; tone?: "ok" | "flow" | "bad" };

export const islandNotify = (a: IslandActivity) =>
  window.dispatchEvent(new CustomEvent<IslandActivity>("island-activity", { detail: a }));

const ACTIVITY_MS = 2200;

export function Island({ pill, children }: { pill: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<IslandActivity | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const queue = useRef<IslandActivity[]>([]);
  const showing = useRef(false);
  const leaveTimer = useRef<number | undefined>(undefined);

  // fila de atividades: cada uma segura o palco por ACTIVITY_MS
  useEffect(() => {
    const next = () => {
      const a = queue.current.shift();
      if (!a) {
        showing.current = false;
        setActivity(null);
        return;
      }
      showing.current = true;
      setActivity(a);
      window.setTimeout(next, ACTIVITY_MS);
    };
    const onAct = (e: Event) => {
      const det = (e as CustomEvent<IslandActivity>).detail;
      queue.current.push(det);
      if (queue.current.length > 4) queue.current.shift(); // rajada não vira fila infinita
      if (!showing.current) next();
    };
    window.addEventListener("island-activity", onAct);
    return () => window.removeEventListener("island-activity", onAct);
  }, []);

  const state: "activity" | "open" | "pill" = activity ? "activity" : open ? "open" : "pill";

  // FLIP de largura: o conteúdo novo já está no DOM (width:auto); anima da
  // largura anterior pra atual com overshoot de mola
  const prevW = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const oldW = prevW.current;
    const newW = el.offsetWidth;
    prevW.current = newW;
    if (oldW == null || Math.abs(oldW - newW) < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ width: `${oldW}px` }, { width: `${newW}px` }],
      { duration: 460, easing: "cubic-bezier(0.34, 1.32, 0.44, 1)" },
    );
  }, [state, children, pill, activity]);

  const enter = () => {
    clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 550);
  };

  return (
    <div
      ref={shellRef}
      className={`island is-${state}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onClick={() => { if (state === "pill") enter(); }}
    >
      {state === "activity" && activity ? (
        <div className={`island-swap island-act tone-${activity.tone ?? "flow"}`} key={`a-${activity.text}`}>
          <span className="island-act-dot" />
          <span className="island-act-text">{activity.text}</span>
        </div>
      ) : state === "open" ? (
        <div className="island-swap island-row" key="open">{children}</div>
      ) : (
        <div className="island-swap island-row" key="pill">{pill}</div>
      )}
    </div>
  );
}
