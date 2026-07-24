import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import App from "./App";

// mostra o erro em vez de tela branca se algo estourar no render
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <pre style={{ padding: 24, color: "#e05561", font: "13px ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
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
    <App />
  </ErrorBoundary>,
);
