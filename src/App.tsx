import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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

export default function App() {
  const [cwd, setCwd] = useState("/home/ti-17");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  edgesRef.current = edges;

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
  }, []);

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
    const data: AgentNodeData = { label, cmd, cwd, section: SECTIONS[seq % SECTIONS.length], onKill: killNode, onSend: sendFrom };
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

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">or<span className="brand-q">q</span>uestra</span>
        <input className="cwd" value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} placeholder="pasta do projeto" />
        <button onClick={() => addAgent({ kind: "shell", program: null }, "shell")}>+ shell</button>
        <button onClick={() => addAgent({ kind: "claude", extra_args: [] }, "claude")}>+ claude</button>
        <button onClick={addNote}>+ contexto</button>
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
