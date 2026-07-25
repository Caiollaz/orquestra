import { getCurrentWindow } from "@tauri-apps/api/window";

// Barra de janela própria (tauri.conf: decorations: false). O topo é cromo,
// não palco: mesma superfície da sidebar, marca pequena à esquerda (a lockup
// grande é da Island, que flutua sobre o canvas) e os três botões à direita.
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
      <span className="tb-brand">or<span className="brand-q">q</span>uestra</span>
      <span className="tb-gap" />
      <button className="ib" title="Minimizar" onClick={() => void win.minimize()}>{Ico.min}</button>
      <button className="ib" title="Maximizar" onClick={() => void win.toggleMaximize()}>{Ico.max}</button>
      <button className="ib tb-close" title="Fechar" onClick={() => void win.close()}>{Ico.close}</button>
    </div>
  );
}
