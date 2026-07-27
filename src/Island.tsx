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
// Saída própria da atividade. Sem ela o texto sumia de um frame pro outro
// enquanto a largura ainda voltava com mola: a pastilha "piscava" no fim.
// Curta de propósito — é despedida, não evento.
const SAIDA_MS = 180;

// pinned = tem dropdown aberto ancorado num botão daqui. Enquanto estiver, a
// barra não recolhe e nem cede o palco pra uma atividade: o menu vive FORA da
// island (posição fixa na viewport), então o mouse indo até ele dispara o
// onMouseLeave — e a barra sumia embaixo do próprio dropdown que abriu.
export function Island({ pill, children, pinned = false }: { pill: ReactNode; children: ReactNode; pinned?: boolean }) {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<IslandActivity | null>(null);
  const [saindo, setSaindo] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const queue = useRef<IslandActivity[]>([]);
  const showing = useRef(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const hover = useRef(false);

  // fila de atividades: cada uma segura o palco por ACTIVITY_MS
  useEffect(() => {
    const next = () => {
      const a = queue.current.shift();
      if (!a) {
        // fila vazia: a última atividade sai animando antes de ceder o palco.
        // `showing` continua true durante a saída — quem chegar nesse meio tempo
        // entra na fila e é retomado no fim, senão a mensagem era descartada.
        setSaindo(true);
        window.setTimeout(() => {
          setSaindo(false);
          if (queue.current.length) return next();
          showing.current = false;
          setActivity(null);
        }, SAIDA_MS);
        return;
      }
      setSaindo(false);
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

  const state: "activity" | "open" | "pill" =
    pinned ? "open" : activity ? "activity" : open ? "open" : "pill";

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
    hover.current = true;
    clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const leave = () => {
    hover.current = false;
    if (pinned) return; // o dropdown segura a barra aberta
    clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 550);
  };

  // dropdown fechou: se o mouse não voltou pra barra, recolhe com o mesmo
  // atraso de sempre (o onMouseEnter não redispara se o cursor já está dentro)
  useEffect(() => {
    if (pinned || hover.current) return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 550);
    return () => clearTimeout(leaveTimer.current);
  }, [pinned]);

  // O tom vai na CASCA, não no filho: custom property só herda pra BAIXO, então
  // `.island` nunca enxergava o `--act` declarado em `.island-act` — a borda de
  // atividade caía sempre no accent, fosse verde, azul ou vermelho o aviso.
  const tom = state === "activity" && activity ? ` tone-${activity.tone ?? "flow"}` : "";

  return (
    <div
      ref={shellRef}
      className={`island is-${state}${tom}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onClick={() => { if (state === "pill") enter(); }}
    >
      {state === "activity" && activity ? (
        <div className={`island-swap island-act${saindo ? " is-out" : ""}`} key={`a-${activity.text}`}>
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
