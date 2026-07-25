import { useEffect, useState } from "react";
import { svgIcone, svgIconeAsync } from "@edusites/icons/core";

// Ícone da @edusites/icons como componente React. A lib entrega SVG string
// (tree-shakeable, carrega o desenho sob demanda); herdamos a cor via
// currentColor e deixamos o CSS existente (.ib svg, .agent-btn svg, .ctx-ico
// svg) mandar no tamanho final.
export function Icone({ nome, tamanho = 16 }: { nome: string; tamanho?: number }) {
  const [svg, setSvg] = useState<string | null>(
    () => svgIcone({ nome, cor: "currentColor", tamanho }), // síncrono se já em cache
  );
  useEffect(() => {
    if (svg) return;
    let vivo = true;
    svgIconeAsync({ nome, cor: "currentColor", tamanho })
      .then((s: string | null) => { if (vivo && s) setSvg(s); })
      .catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, tamanho]);
  return <span className="icone" aria-hidden dangerouslySetInnerHTML={{ __html: svg ?? "" }} />;
}
