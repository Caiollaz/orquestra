import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode, type AgentNodeData } from "./AgentNode";
import { NoteNode, type NoteNodeData } from "./NoteNode";
import { forwardOutput, type AgentCmd } from "./lib/tauri";
import { terminals, noteText } from "./shared";
import "./App.css";

const nodeTypes: NodeTypes = { agent: AgentNode, note: NoteNode };
let seq = 0;

// naipes da orquestra: cada agente novo pega a próxima cor (latão, cordas,
// madeiras, percussão) — identidade visual pra distinguir nós de relance
const SECTIONS = ["#c69a55", "#b3543f", "#6f8f5e", "#7d8fa8"];

// ícones inline (16px, stroke herda a cor do botão)
const icons = {
  folder: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.4.6L12 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  shell: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="m6 9 4 3-4 3" />
      <path d="M12 16h5" />
    </svg>
  ),
  claude: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 6.6L19 4.9l-3.6 5.7L22 12l-6.6 1.4L19 19.1l-5.2-3.7L12 22l-1.8-6.6L5 19.1l3.6-5.7L2 12l6.6-1.4L5 4.9l5.2 3.7Z" />
    </svg>
  ),
  note: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3h14a1 1 0 0 1 1 1v10l-6 6H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 20v-5a1 1 0 0 1 1-1h5" />
    </svg>
  ),
};

export default function App() {
  const [cwd, setCwd] = useState("/home/ti-17");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  edgesRef.current = edges;
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;
  // comunicação automática: até onde já lemos o buffer de cada agente, e quem já foi semeado
  const lastLineRef = useRef(new Map<string, number>());
  const seededRef = useRef(new Set<string>());

  // backend emite "agent-exited" quando o processo do PTY morre → lâmpada do nó
  useEffect(() => {
    const un = listen<string>("agent-exited", (e) => {
      setNodes((ns) => ns.map((n) => (n.id === e.payload ? { ...n, data: { ...n.data, exited: true } } : n)));
    });
    return () => { void un.then((f) => f()); };
  }, []);

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((es) => applyEdgeChanges(c, es)), []);
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, animated: true }, es)), []);

  const killNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id)); // desmontar XtermView chama kill_agent
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    noteText.delete(id);
    lastLineRef.current.delete(id);
    seededRef.current.delete(id);
  }, []);

  // lê as linhas novas (texto limpo, sem ANSI) do buffer do xterm desde a última leitura
  const readNewLines = useCallback((id: string): string[] => {
    const term = terminals.get(id);
    if (!term) return [];
    const buf = term.buffer.active;
    const end = buf.baseY + buf.cursorY;
    const start = lastLineRef.current.get(id) ?? 0;
    const lines: string[] = [];
    for (let i = start; i <= end; i++) {
      const line = buf.getLine(i);
      if (!line) continue;
      // linha quebrada por largura é continuação da anterior
      if (line.isWrapped && lines.length) lines[lines.length - 1] += line.translateToString(true);
      else lines.push(line.translateToString(true));
    }
    lastLineRef.current.set(id, end + 1);
    return lines;
  }, []);

  // protocolo semeado em cada claude no primeiro idle (= terminou de subir)
  const seedPrompt = (label: string) =>
    `Você é o nó "${label}" num canvas do orquestra, junto com outros agentes. Mensagens de outros chegam como "(de nome) texto". Para falar com um agente conectado a você, escreva uma linha própria no formato ⇢NOME: mensagem — NOME é o título do nó de destino, ou a palavra todos para mandar a todos os conectados. Alinhamento: mantenha o quadro .orquestra/board.md na raiz do projeto — registre nele suas ações, decisões e status, e consulte-o antes de cada tarefa nova. Responda apenas OK.`;

  // agente ficou ocioso: semeia protocolo (claude, 1ª vez) e roteia linhas ⇢NOME: msg
  const handleIdle = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const d = node.data as AgentNodeData;
    const lines = readNewLines(id); // sempre avança o marcador, mesmo sem arestas
    if (d.cmd.kind === "claude" && !seededRef.current.has(id)) {
      seededRef.current.add(id);
      void forwardOutput(id, seedPrompt(d.label)).catch(() => {});
      return;
    }
    const targets = edgesRef.current.filter((e) => e.source === id).map((e) => e.target);
    if (!targets.length) return;
    for (const line of lines) {
      // tolera bullets/indentação que o TUI do claude põe antes da linha
      const m = line.match(/^[\s⏺●•>*-]*⇢\s*([^\s:]+)\s*:\s*(.+)$/u);
      if (!m) continue;
      const [, dest, msg] = m;
      const wanted =
        dest === "todos"
          ? targets
          : targets.filter((t) => (nodesRef.current.find((n) => n.id === t)?.data as AgentNodeData | undefined)?.label === dest);
      // "(de X)" sem marcador ⇢: o eco no destino não dispara reenvio em cascata
      wanted.forEach((t) => void forwardOutput(t, `(de ${d.label}) ${msg}`).catch(() => {}));
    }
  }, [readNewLines]);

  // envia o texto da origem (seleção do terminal, ou texto da nota) pros alvos conectados
  const sendFrom = useCallback((sourceId: string) => {
    const targets = edgesRef.current.filter((e) => e.source === sourceId).map((e) => e.target);
    if (!targets.length) return;
    const term = terminals.get(sourceId);
    const text = (term?.getSelection() || noteText.get(sourceId) || "").trim();
    if (!text) return; // nada selecionado/escrito
    targets.forEach((t) => void forwardOutput(t, text).catch(() => {}));
  }, []);

  const addAgent = (cmd: AgentCmd, label: string) => {
    const id = `agent-${++seq}`;
    // label único ("claude-2"): é o endereço nas mensagens ⇢NOME:
    const data: AgentNodeData = { label: `${label}-${seq}`, cmd, cwd, section: SECTIONS[seq % SECTIONS.length], onKill: killNode, onSend: sendFrom, onIdle: handleIdle };
    setNodes((ns) => [
      ...ns,
      { id, type: "agent", position: { x: 60 + (ns.length % 3) * 520, y: 60 + Math.floor(ns.length / 3) * 380 }, width: 480, height: 320, data },
    ]);
  };

  const addNote = () => {
    const id = `note-${++seq}`;
    const data: NoteNodeData = { onKill: killNode, onSend: sendFrom };
    setNodes((ns) => [
      ...ns,
      { id, type: "note", position: { x: 60, y: 60 + ns.length * 40 }, width: 280, height: 180, data },
    ]);
  };

  // dialog nativo de pasta; cancelou → mantém o cwd atual
  const pickFolder = async () => {
    const dir = await open({ directory: true, defaultPath: cwd }).catch(() => null);
    if (typeof dir === "string") setCwd(dir);
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">or<span className="brand-q">q</span>uestra</span>
        <input className="cwd" value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} placeholder="pasta do projeto" />
        <button onClick={pickFolder} title="Escolher a pasta do projeto">{icons.folder} abrir pasta</button>
        <span className="topbar-sep" />
        <button onClick={() => addAgent({ kind: "shell", program: null }, "shell")} title="Novo terminal shell">{icons.shell} shell</button>
        <button className="btn-claude" onClick={() => addAgent({ kind: "claude", extra_args: [] }, "claude")} title="Novo agente claude">{icons.claude} claude</button>
        <button onClick={addNote} title="Novo bloco de contexto">{icons.note} contexto</button>
      </header>
      <div className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={26} size={1.4} color="#302a25" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
