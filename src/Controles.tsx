import { useReactFlow, useStore } from "@xyflow/react";
import { PiPlus, PiMinus, PiCornersOut, PiLockSimple, PiLockSimpleOpen } from "react-icons/pi";

// Controles do canvas. Substituem o <Controls> do React Flow (coluna de quatro
// quadradinhos com ícone preenchido) por uma barra na mesma linguagem da
// Island: pastilha flutuante, blur, um raio só. Ganhos além do visual:
//
// - o zoom aparece em número e o número é clicável pra voltar a 100% (antes não
//   dava pra saber onde você estava, nem voltar sem tentativa e erro);
// - transições com duração, então o zoom não pula;
// - a trava diz o que está travado no title e acende na cor da marca.
//
// A porcentagem é mono de propósito: é dado que muda a cada tique, e em fonte
// proporcional a largura dançaria e a barra ficaria tremendo.

export function Controles({ travado, onTravar }: { travado: boolean; onTravar: () => void }) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const pct = Math.round(zoom * 100);

  return (
    <div className="zoom-bar">
      <button className="ib" title="Afastar" onClick={() => void rf.zoomOut({ duration: 180 })}>
        <PiMinus />
      </button>
      <button
        className="zoom-pct"
        title={pct === 100 ? "Zoom em 100%" : "Voltar pra 100%"}
        onClick={() => void rf.zoomTo(1, { duration: 200 })}
      >
        {pct}%
      </button>
      <button className="ib" title="Aproximar" onClick={() => void rf.zoomIn({ duration: 180 })}>
        <PiPlus />
      </button>
      <span className="zoom-sep" />
      <button
        className="ib"
        title="Enquadrar tudo"
        onClick={() => void rf.fitView({ duration: 260, padding: 0.15 })}
      >
        <PiCornersOut />
      </button>
      <button
        className={`ib${travado ? " is-on" : ""}`}
        title={travado ? "Destravar (mover e ligar nós)" : "Travar: só navegar, sem mover nem ligar nós"}
        aria-pressed={travado}
        onClick={onTravar}
      >
        {travado ? <PiLockSimple /> : <PiLockSimpleOpen />}
      </button>
    </div>
  );
}
