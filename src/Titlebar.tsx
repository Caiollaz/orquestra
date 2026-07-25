import { getCurrentWindow } from "@tauri-apps/api/window";

// Barra de janela própria (tauri.conf: decorations: false). O topo é cromo,
// não palco: sinal + marca pequenos à esquerda (a lockup grande é da Island,
// que flutua sobre o canvas) e os três botões de janela à direita.
// Arrastar e duplo-clique-pra-maximizar vêm do data-tauri-drag-region.

const win = getCurrentWindow();

const Ico = {
  min: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 12h12" /></svg>,
  max: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M7 7l10 10M17 7 7 17" /></svg>,
};

export function Titlebar() {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="tb-brand">
        {/* sinal "oq": os dois anéis se cruzam — as duas primeiras letras e,
            de novo, dois nós ligados. Mesmo desenho da landing page. */}
        <svg viewBox="0 0 32 26" fill="none" aria-hidden>
          <circle cx="8.9" cy="11" r="7.4" stroke="currentColor" strokeWidth="2.3" />
          <circle cx="22.5" cy="11" r="7.4" stroke="currentColor" strokeWidth="2.3" />
          <path d="M29.9 11v12.8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
        <span>or<span className="brand-q">q</span>uestra</span>
      </span>
      <span className="tb-gap" />
      <button className="ib" title="Minimizar" onClick={() => void win.minimize()}>{Ico.min}</button>
      <button className="ib" title="Maximizar" onClick={() => void win.toggleMaximize()}>{Ico.max}</button>
      <button className="ib tb-close" title="Fechar" onClick={() => void win.close()}>{Ico.close}</button>
    </div>
  );
}
