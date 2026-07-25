import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import { aplicaTema, temaSalvo } from "./tema";
import App from "./App";
import { Titlebar } from "./Titlebar";

// tema antes do primeiro paint: sem isso o app pisca escuro no claro
aplicaTema(temaSalvo());

// mostra o erro em vez de tela branca se algo estourar no render
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <pre style={{ padding: 24, color: "#f0616a", font: "13px ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
          {String(this.state.err.stack || this.state.err.message)}
        </pre>
      );
    }
    return this.props.children;
  }
}

// sem StrictMode: o double-mount dele reinicializa o xterm/PTY e duplica agentes
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <Titlebar />
    <App />
  </ErrorBoundary>,
);
