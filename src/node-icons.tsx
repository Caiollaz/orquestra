// Ícones SVG dos headers de nó (vetor escala limpo no zoom do canvas;
// glifos unicode ⇢×◎⏱ quebravam/borravam).
const base = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ni = {
  send: <svg {...base} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  x: <svg {...base} aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>,
  role: <svg {...base} aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>,
  clock: <svg {...base} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  enter: <svg {...base} aria-hidden><path d="M20 5v6a2 2 0 0 1-2 2H5" /><path d="m9 9-4 4 4 4" /></svg>,
  popout: <svg {...base} aria-hidden><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></svg>,
};
