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
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode, type AgentNodeData } from "./AgentNode";
import { NoteNode, type NoteNodeData } from "./NoteNode";
import { ShapeNode, type ShapeNodeData } from "./ShapeNode";
import { PortalNode, type PortalNodeData } from "./PortalNode";
import { RolePicker } from "./RolePicker";
import { Sidebar, folderName } from "./Sidebar";
import { ContextMenu, type MenuState, type MenuItem } from "./ContextMenu";
import { DialogHost, askText, askConfirm, alertMsg } from "./Dialog";
import {
  forwardOutput, applyRole, createFloor, removeFloor, openEditor,
  listWorkspaces, loadWorkspace, saveWorkspace, deleteWorkspace,
  type AgentCmd, type Role, type Floor, type WorkspaceMeta, type WsAgent, type Workspace, type CanvasState,
} from "./lib/tauri";
import { terminals, noteText } from "./shared";
import "./App.css";

const nodeTypes: NodeTypes = { agent: AgentNode, note: NoteNode, shape: ShapeNode, portal: PortalNode };
let seq = 0;

// naipes da orquestra: cada agente novo pega a próxima cor (latão, cordas,
// madeiras, percussão) — identidade visual pra distinguir nós de relance
const SECTIONS = ["#c69a55", "#b3543f", "#6f8f5e", "#7d8fa8"];

// ícones inline (stroke herda a cor do botão)
const icons = {
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.4.6L12 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /></svg>,
  shell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="3" width="20" height="18" rx="2" /><path d="m6 9 4 3-4 3" /><path d="M12 16h5" /></svg>,
  claude: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 6.6L19 4.9l-3.6 5.7L22 12l-6.6 1.4L19 19.1l-5.2-3.7L12 22l-1.8-6.6L5 19.1l3.6-5.7L2 12l6.6-1.4L5 4.9l5.2 3.7Z" /></svg>,
  note: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 3h14a1 1 0 0 1 1 1v10l-6 6H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 20v-5a1 1 0 0 1 1-1h5" /></svg>,
  shape: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="6" width="8" height="6" rx="1" /><rect x="14" y="12" width="7" height="6" rx="1" /><path d="M11 9h3v6" /></svg>,
  portal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>,
  code: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m8 6-6 6 6 6M16 6l6 6-6 6" /></svg>,
  save: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M8 3v5h7M8 21v-7h8v7" /></svg>,
  layers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" /></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  role: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
};

export default function App() {
  const [cwd, setCwd] = useState("/home/ti-17");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  edgesRef.current = edges;
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;
  const lastLineRef = useRef(new Map<string, number>());
  const seededRef = useRef(new Set<string>());
  const schedRef = useRef(new Map<string, number>());
  // spec dos agendamentos (intervalo+texto) pra persistir no workspace
  const schedSpecRef = useRef(new Map<string, { secs: number; text: string }>());
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // autosave: qualquer mutação marca sujo; 1.2s depois persiste (se há workspace)
  const persistRef = useRef<() => Promise<void>>(async () => {});
  const dirtyTimer = useRef<number | undefined>(undefined);
  const dirty = useCallback(() => {
    clearTimeout(dirtyTimer.current);
    dirtyTimer.current = window.setTimeout(() => { void persistRef.current(); }, 1200);
  }, []);
  useEffect(() => {
    const flush = () => { void persistRef.current(); };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  const [floors, setFloors] = useState<Floor[]>([]);
  const [activeFloor, setActiveFloor] = useState("");
  const activeCwd = activeFloor ? (floors.find((f) => f.slug === activeFloor)?.path ?? cwd) : cwd;

  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [wsId, setWsId] = useState("");
  const [wsName, setWsName] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const [roleTarget, setRoleTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const refreshWs = useCallback(() => { listWorkspaces().then(setWorkspaces).catch(() => {}); }, []);
  useEffect(() => { refreshWs(); }, [refreshWs]);

  useEffect(() => {
    const un = listen<string>("agent-exited", (e) => {
      setNodes((ns) => ns.map((n) => (n.id === e.payload ? { ...n, data: { ...n.data, exited: true } } : n)));
    });
    return () => { void un.then((f) => f()); };
  }, []);

  const onNodesChange = useCallback((c: NodeChange[]) => { setNodes((ns) => applyNodeChanges(c, ns)); dirty(); }, [dirty]);
  const onEdgesChange = useCallback((c: EdgeChange[]) => { setEdges((es) => applyEdgeChanges(c, es)); dirty(); }, [dirty]);

  // ao ligar uma aresta, avisa o claude de origem quem é o alvo (senão ele não
  // sabe o label e executa tudo nele mesmo em vez de delegar)
  const onConnect = useCallback((c: Connection) => {
    setEdges((es) => addEdge(c, es));
    dirty();
    const src = nodesRef.current.find((n) => n.id === c.source);
    const tgt = nodesRef.current.find((n) => n.id === c.target);
    if (!src || !tgt) return;
    const sd = src.data as AgentNodeData;
    if (src.type !== "agent" || sd.cmd.kind !== "claude") return;
    const kind =
      tgt.type === "note" ? "uma nota — escreva nela com ⇢nota: texto"
      : tgt.type === "portal" ? `um navegador — ⇢${(tgt.data as PortalNodeData).label}: URL navega o navegador até a URL`
      : tgt.type !== "agent" ? "uma forma de diagrama (sem interação)"
      : (tgt.data as AgentNodeData).cmd.kind === "shell"
        ? `um terminal shell — ⇢${(tgt.data as AgentNodeData).label}: comando executa o comando LÁ, não rode você mesmo`
        : `um agente claude — fale com ele via ⇢${(tgt.data as AgentNodeData).label}: mensagem`;
    const label = tgt.type === "note" ? "nota" : (tgt.data as { label?: string }).label ?? tgt.id;
    void forwardOutput(c.source, `(sistema) você foi conectado ao nó "${label}": ${kind}. Responda apenas OK.`).catch(() => {});
  }, [dirty]);

  const flashTimers = useRef(new Map<string, number>());
  const flashEdge = useCallback((source: string, target: string) => {
    const match = (e: Edge) => e.source === source && e.target === target;
    setEdges((es) => es.map((e) => (match(e) ? { ...e, animated: true } : e)));
    const key = `${source}->${target}`;
    const prev = flashTimers.current.get(key);
    if (prev) clearTimeout(prev);
    flashTimers.current.set(key, window.setTimeout(() => {
      setEdges((es) => es.map((e) => (match(e) ? { ...e, animated: false } : e)));
      flashTimers.current.delete(key);
    }, 1200));
  }, []);

  const killNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    noteText.delete(id);
    lastLineRef.current.delete(id);
    seededRef.current.delete(id);
    const t = schedRef.current.get(id);
    if (t) { clearInterval(t); schedRef.current.delete(id); }
    schedSpecRef.current.delete(id);
    dirty();
  }, [dirty]);

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
      if (line.isWrapped && lines.length) lines[lines.length - 1] += line.translateToString(true);
      else lines.push(line.translateToString(true));
    }
    lastLineRef.current.set(id, end + 1);
    return lines;
  }, []);

  const seedPrompt = (label: string) =>
    `Você é o nó "${label}" num canvas do orquestra, junto com outros agentes. Mensagens de outros chegam como "(de nome) texto". Para falar com um nó conectado a você, escreva uma linha própria no formato ⇢NOME: texto — NOME é o título do nó de destino, ou a palavra todos para todos os conectados. Se o nó conectado for um terminal shell, ⇢NOME: comando digita e executa o comando NAQUELE terminal — quando o usuário pedir para rodar algo "no terminal", delegue assim, não execute você mesmo. Para registrar algo numa nota conectada, escreva ⇢nota: texto. Você será avisado com "(sistema) ..." quando novas conexões forem criadas. Alinhamento: mantenha o quadro .orquestra/board.md na raiz do projeto — registre nele suas ações, decisões e status, e consulte-o antes de cada tarefa nova. Responda apenas OK.`;

  const handleIdle = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const d = node.data as AgentNodeData;
    const lines = readNewLines(id);
    if (d.cmd.kind === "claude" && !seededRef.current.has(id)) {
      seededRef.current.add(id);
      void forwardOutput(id, seedPrompt(d.label)).catch(() => {});
      return;
    }
    const targets = edgesRef.current.filter((e) => e.source === id).map((e) => e.target);
    if (!targets.length) return;
    for (const line of lines) {
      const m = line.match(/^[\s⏺●•>*-]*⇢\s*([^\s:]+)\s*:\s*(.+)$/u);
      if (!m) continue;
      const [, dest, msg] = m;
      if (dest.toLowerCase() === "nota") {
        targets.forEach((t) => {
          if (nodesRef.current.find((n) => n.id === t)?.type !== "note") return;
          flashEdge(id, t);
          window.dispatchEvent(new CustomEvent("note-write", { detail: { id: t, text: `(${d.label}) ${msg}` } }));
        });
        continue;
      }
      const wanted =
        dest === "todos"
          ? targets
          : targets.filter((t) => (nodesRef.current.find((n) => n.id === t)?.data as { label?: string } | undefined)?.label === dest);
      wanted.forEach((t) => {
        const tn = nodesRef.current.find((n) => n.id === t);
        if (!tn) return;
        flashEdge(id, t);
        // portal não tem PTY: a mensagem é uma URL → navega
        if (tn.type === "portal") {
          const u = msg.trim().replace(/^<|>$/g, "");
          setPortalUrl(t, /^https?:\/\//.test(u) ? u : `https://${u}`);
          return;
        }
        // Shell recebe o texto CRU: o prefixo "(de X)" viraria comando inválido.
        const isShell = tn.type === "agent" && (tn.data as AgentNodeData).cmd.kind === "shell";
        void forwardOutput(t, isShell ? msg : `(de ${d.label}) ${msg}`).catch(() => {});
      });
    }
  }, [readNewLines, flashEdge]);

  const sendFrom = useCallback((sourceId: string) => {
    const targets = edgesRef.current.filter((e) => e.source === sourceId).map((e) => e.target);
    if (!targets.length) return;
    const term = terminals.get(sourceId);
    const text = (term?.getSelection() || noteText.get(sourceId) || "").trim();
    if (!text) return;
    targets.forEach((t) => { flashEdge(sourceId, t); void forwardOutput(t, text).catch(() => {}); });
  }, [flashEdge]);

  const openRole = useCallback((id: string) => setRoleTarget(id), []);
  const applyRoleToTarget = (role: Role) => {
    const id = roleTarget;
    if (!id) return;
    void applyRole(id, role).catch(() => {});
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, roleName: role.name } } : n)));
    dirty();
  };

  // liga o intervalo e registra o spec (o spec vai pro workspace no autosave)
  const startSchedule = useCallback((id: string, secs: number, text: string) => {
    const t = window.setInterval(() => { void forwardOutput(id, text).catch(() => {}); }, secs * 1000);
    schedRef.current.set(id, t);
    schedSpecRef.current.set(id, { secs, text });
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, scheduled: true } } : n)));
  }, []);

  const scheduleAgent = useCallback(async (id: string) => {
    const existing = schedRef.current.get(id);
    if (existing) {
      clearInterval(existing);
      schedRef.current.delete(id);
      schedSpecRef.current.delete(id);
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, scheduled: false } } : n)));
      dirty();
      return;
    }
    const r = await askText("Agendar prompt", [
      { label: "intervalo (segundos)", default: "300", type: "number" },
      { label: "prompt a enviar", placeholder: "ex: rode os testes e me diga o status" },
    ]);
    if (!r) return;
    const secs = Number(r[0]);
    const text = r[1]?.trim();
    if (!secs || secs <= 0 || !text) return;
    startSchedule(id, secs, text);
    dirty();
  }, [startSchedule, dirty]);

  const agentData = (label: string, cmd: AgentCmd, section: string, extra: Partial<AgentNodeData> = {}): AgentNodeData => ({
    label, cmd, cwd: activeCwd, section,
    onKill: killNode, onSend: sendFrom, onIdle: handleIdle, onRole: openRole, onSchedule: scheduleAgent,
    ...extra,
  });

  // posição padrão em grade quando não vem do menu de contexto
  const gridPos = (len: number): XYPosition => ({ x: 60 + (len % 3) * 520, y: 60 + Math.floor(len / 3) * 380 });

  // rótulo por tipo, contando só o canvas atual: workspace novo começa em claude-1
  // (seq global continua garantindo ids únicos, mas não vaza pro rótulo)
  const nextLabel = (base: string) => {
    let max = 0;
    for (const n of nodesRef.current) {
      const l = (n.data as { label?: string }).label;
      const m = l?.match(new RegExp(`^${base}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${base}-${max + 1}`;
  };

  const addAgent = (cmd: AgentCmd, label: string, pos?: XYPosition) => {
    const id = `agent-${++seq}`;
    const data = agentData(nextLabel(label), cmd, SECTIONS[seq % SECTIONS.length]);
    setNodes((ns) => [...ns, { id, type: "agent", position: pos ?? gridPos(ns.length), width: 480, height: 320, data }]);
    dirty();
  };
  const noteData = (): NoteNodeData => ({ onKill: killNode, onSend: sendFrom, onDirty: dirty });
  const addNote = (pos?: XYPosition) => {
    const id = `note-${++seq}`;
    setNodes((ns) => [...ns, { id, type: "note", position: pos ?? { x: 60, y: 60 + ns.length * 40 }, width: 280, height: 180, data: noteData() }]);
    dirty();
  };
  const setShapeLabel = useCallback((id: string, label: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    dirty();
  }, [dirty]);
  const addShape = (variant: ShapeNodeData["variant"], pos?: XYPosition) => {
    const id = `shape-${++seq}`;
    const data: ShapeNodeData = { label: "", variant, onKill: killNode, onLabel: setShapeLabel };
    setNodes((ns) => [...ns, { id, type: "shape", position: pos ?? { x: 120 + ns.length * 24, y: 120 + ns.length * 24 }, width: 160, height: 64, data }]);
    dirty();
  };
  const setPortalUrl = useCallback((id: string, url: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, url } } : n)));
    dirty();
  }, [dirty]);
  const addPortal = (pos?: XYPosition) => {
    const id = `portal-${++seq}`;
    const data: PortalNodeData = { label: nextLabel("portal"), url: "", onKill: killNode, onUrl: setPortalUrl };
    setNodes((ns) => [...ns, { id, type: "portal", position: pos ?? { x: 80, y: 80 }, width: 420, height: 320, data }]);
    dirty();
  };

  // ── floors ──────────────────────────────────────────────────────
  const addFloor = async () => {
    const r = await askText("Novo floor (git worktree)", [{ label: "nome", placeholder: "minha-feature" }]);
    const slug = r?.[0]?.trim();
    if (!slug) return;
    try {
      const f = await createFloor(cwd, slug);
      setFloors((fs) => [...fs, f]);
      setActiveFloor(f.slug);
    } catch (e) { void alertMsg("Erro ao criar floor", String(e)); }
  };
  const dropFloor = async (slug: string) => {
    try { await removeFloor(cwd, slug); } catch (e) { void alertMsg("Erro ao remover floor", String(e)); }
    setFloors((fs) => fs.filter((f) => f.slug !== slug));
    if (activeFloor === slug) setActiveFloor("");
  };

  // ── workspaces ──────────────────────────────────────────────────
  // canvas completo (todo tipo de nó + arestas + notas + agendamentos) vai no
  // campo `canvas` (JSON opaco pro Rust); `agents` continua preenchido por compat.
  const buildWorkspace = (id: string, name: string): Workspace => {
    const agents: WsAgent[] = nodesRef.current
      .filter((n) => n.type === "agent")
      .map((n) => {
        const d = n.data as AgentNodeData;
        return { id: n.id, label: d.label, roleFile: null, cmd: d.cmd, cwd: d.cwd, floorSlug: null,
          x: n.position.x, y: n.position.y, w: n.width ?? 480, h: n.height ?? 320 };
      });
    const canvas: CanvasState = {
      nodes: nodesRef.current.map((n) => {
        const base = { id: n.id, type: n.type ?? "agent", x: n.position.x, y: n.position.y, w: n.width, h: n.height };
        const d = n.data as Record<string, unknown>;
        switch (n.type) {
          case "agent": {
            const a = n.data as AgentNodeData;
            return { ...base, data: { label: a.label, cmd: a.cmd, cwd: a.cwd, roleName: a.roleName ?? null, schedule: schedSpecRef.current.get(n.id) ?? null } };
          }
          case "note": return { ...base, data: { text: noteText.get(n.id) ?? "" } };
          case "shape": return { ...base, data: { label: d.label ?? "", variant: d.variant ?? "box" } };
          case "portal": return { ...base, data: { label: d.label ?? "", url: d.url ?? "" } };
          default: return { ...base, data: {} };
        }
      }),
      edges: edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    const viewport = rfRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    return { id, name, repoPath: cwd, viewport, agents, floors, canvas };
  };
  const persistCurrent = useCallback(async () => {
    if (!wsId) return;
    try { await saveWorkspace(buildWorkspace(wsId, wsName)); } catch { /* ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, wsName, cwd, floors]);
  useEffect(() => { persistRef.current = persistCurrent; }, [persistCurrent]);

  const doSave = async () => {
    if (wsId) { await persistCurrent(); refreshWs(); return; }
    const r = await askText("Salvar workspace", [{ label: "nome", placeholder: "meu-projeto" }]);
    const name = r?.[0]?.trim();
    if (!name) return;
    const id = `ws-${Date.now()}`;
    try { await saveWorkspace(buildWorkspace(id, name)); setWsId(id); setWsName(name); refreshWs(); }
    catch (e) { void alertMsg("Erro ao salvar", String(e)); }
  };

  // limpa agendamentos/estado transiente do canvas anterior
  const resetTransient = () => {
    for (const t of schedRef.current.values()) clearInterval(t);
    schedRef.current.clear();
    schedSpecRef.current.clear();
    noteText.clear();
    lastLineRef.current.clear();
    seededRef.current.clear();
  };

  const doLoad = async (id: string) => {
    try {
      const ws = await loadWorkspace(id);
      resetTransient();
      setCwd(ws.repoPath);
      setFloors(ws.floors ?? []);
      setActiveFloor("");
      let maxSeq = 0;
      const bump = (nid: string) => { const m = nid.match(/(\d+)$/); if (m) maxSeq = Math.max(maxSeq, Number(m[1])); };
      let restored: Node[];
      let restoredEdges: Edge[] = [];
      const canvas = ws.canvas;
      if (canvas?.nodes?.length || canvas?.edges?.length) {
        let idx = 0;
        restored = (canvas.nodes ?? []).map((cn) => {
          bump(cn.id);
          const base = { id: cn.id, type: cn.type, position: { x: cn.x, y: cn.y }, width: cn.w, height: cn.h };
          const d = cn.data as Record<string, unknown>;
          switch (cn.type) {
            case "agent": {
              const sched = d.schedule as { secs: number; text: string } | null;
              if (sched) window.setTimeout(() => startSchedule(cn.id, sched.secs, sched.text), 0);
              return { ...base, data: agentData(String(d.label ?? cn.id), d.cmd as AgentCmd, SECTIONS[idx++ % SECTIONS.length], {
                cwd: String(d.cwd ?? ws.repoPath),
                roleName: (d.roleName as string | null) ?? undefined,
                scheduled: !!sched,
              }) };
            }
            case "note":
              noteText.set(cn.id, String(d.text ?? ""));
              return { ...base, data: noteData() };
            case "shape":
              return { ...base, data: { label: String(d.label ?? ""), variant: (d.variant as ShapeNodeData["variant"]) ?? "box", onKill: killNode, onLabel: setShapeLabel } satisfies ShapeNodeData };
            case "portal":
              return { ...base, data: { label: String(d.label ?? ""), url: String(d.url ?? ""), onKill: killNode, onUrl: setPortalUrl } satisfies PortalNodeData };
            default:
              return { ...base, data: {} };
          }
        });
        restoredEdges = (canvas.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target }));
      } else {
        // workspaces antigos (pré-canvas): só agentes
        let idx = 0;
        restored = ws.agents.map((a) => {
          bump(a.id);
          return { id: a.id, type: "agent", position: { x: a.x, y: a.y }, width: a.w, height: a.h,
            data: agentData(a.label, a.cmd, SECTIONS[idx++ % SECTIONS.length]) };
        });
      }
      seq = Math.max(seq, maxSeq);
      setNodes(restored);
      setEdges(restoredEdges);
      setWsId(ws.id); setWsName(ws.name);
      if (ws.viewport) rfRef.current?.setViewport(ws.viewport);
    } catch (e) { void alertMsg("Erro ao abrir workspace", String(e)); }
  };

  // troca de workspace: salva o atual antes de abrir outro
  const openWs = async (id: string) => {
    if (id === wsId) return;
    await persistCurrent();
    await doLoad(id);
  };

  // abrir pasta → cria um workspace novo com o nome da pasta e abre
  const newWorkspaceFromFolder = async () => {
    const dir = await open({ directory: true, defaultPath: cwd }).catch(() => null);
    if (typeof dir !== "string") return;
    await persistCurrent();
    const name = folderName({ repoPath: dir });
    const id = `ws-${Date.now()}`;
    const ws: Workspace = { id, name, repoPath: dir, viewport: { x: 0, y: 0, zoom: 1 }, agents: [], floors: [] };
    try {
      await saveWorkspace(ws);
      refreshWs();
      resetTransient();
      setCwd(dir); setFloors([]); setActiveFloor(""); setNodes([]); setEdges([]);
      setWsId(id); setWsName(name);
    } catch (e) { void alertMsg("Erro ao abrir pasta", String(e)); }
  };

  const renameWs = async (ws: WorkspaceMeta) => {
    const r = await askText("Renomear workspace", [{ label: "nome", default: folderName(ws) }]);
    const name = r?.[0]?.trim();
    if (!name) return;
    try {
      const full = await loadWorkspace(ws.id);
      await saveWorkspace({ ...full, name });
      if (ws.id === wsId) setWsName(name);
      refreshWs();
    } catch (e) { void alertMsg("Erro ao renomear", String(e)); }
  };
  const removeWs = async (ws: WorkspaceMeta) => {
    if (!(await askConfirm("Remover workspace", `Remover "${folderName(ws)}"? Os terminais deste workspace serão encerrados.`, true))) return;
    try { await deleteWorkspace(ws.id); } catch (e) { void alertMsg("Erro ao remover", String(e)); }
    if (ws.id === wsId) { resetTransient(); setWsId(""); setWsName(""); setNodes([]); setEdges([]); }
    refreshWs();
  };

  // ── menus de contexto (click direito) ───────────────────────────
  const wsContext = (e: React.MouseEvent, ws: WorkspaceMeta) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: [
      { label: "Abrir", icon: icons.folder, onClick: () => openWs(ws.id) },
      { label: "Abrir no editor", icon: icons.code, onClick: () => { void openEditor(ws.repoPath).catch((err) => alertMsg("Erro ao abrir editor", String(err))); } },
      { sep: true },
      { label: "Renomear", icon: icons.edit, onClick: () => renameWs(ws) },
      { label: "Remover", danger: true, icon: icons.trash, onClick: () => removeWs(ws) },
    ] });
  };

  const paneContext = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    const pos = rfRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };
    setMenu({ x: e.clientX, y: e.clientY, items: [
      { label: "Terminal shell", icon: icons.shell, onClick: () => addAgent({ kind: "shell", program: null }, "shell", pos) },
      { label: "Agente claude", icon: icons.claude, onClick: () => addAgent({ kind: "claude", extra_args: [] }, "claude", pos) },
      { label: "Bloco de contexto", icon: icons.note, onClick: () => addNote(pos) },
      { sep: true },
      { label: "Forma (diagrama)", icon: icons.shape, onClick: () => addShape("box", pos) },
      { label: "Portal (navegador)", icon: icons.portal, onClick: () => addPortal(pos) },
    ] });
  };

  const nodeContext = (e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    const items: MenuItem[] = [];
    if (node.type === "agent") {
      items.push(
        { label: "Atribuir papel", icon: icons.role, onClick: () => openRole(node.id) },
        { label: "Agendar prompt", icon: icons.clock, onClick: () => scheduleAgent(node.id) },
        { label: "Enviar seleção", icon: icons.send, onClick: () => sendFrom(node.id) },
        { sep: true },
      );
    }
    items.push({ label: "Remover", danger: true, icon: icons.trash, onClick: () => killNode(node.id) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const activeName = wsId ? (workspaces.find((w) => w.id === wsId) ? folderName(workspaces.find((w) => w.id === wsId)!) : wsName) : "sem workspace";

  return (
    <div className="app">
      <Sidebar
        workspaces={workspaces}
        activeId={wsId}
        collapsed={collapsed}
        onOpen={openWs}
        onAddFolder={newWorkspaceFromFolder}
        onContext={wsContext}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main className="main">
        <div className="island">
          <span className="island-id" title={cwd}>
            <span className="island-brand">or<span className="brand-q">q</span></span>
            <span className="island-ws">{activeName}</span>
          </span>
          <span className="island-sep" />
          <button
            className={`ib${activeFloor ? " ib-accent" : ""}`}
            title={activeFloor ? `Floor ativo: ${activeFloor}` : "Floors (git worktree)"}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const items: MenuItem[] = [];
              // só lista "raiz"/floors quando há floor pra escolher
              if (floors.length) {
                items.push(
                  { label: activeFloor ? "raiz" : "✓ raiz", icon: icons.folder, onClick: () => setActiveFloor("") },
                  ...floors.map((f) => ({ label: `${activeFloor === f.slug ? "✓ " : ""}${f.slug}`, icon: icons.layers, onClick: () => setActiveFloor(f.slug) })),
                  { sep: true } as MenuItem,
                );
              }
              items.push({ label: "Novo floor…", icon: icons.layers, onClick: addFloor });
              if (activeFloor) items.push({ label: `Remover "${activeFloor}"`, danger: true, icon: icons.trash, onClick: () => dropFloor(activeFloor) });
              setMenu({ x: r.left, y: r.bottom + 8, items });
            }}
          >
            {icons.layers}
          </button>
          <span className="island-sep" />
          <button className="ib" onClick={() => addAgent({ kind: "shell", program: null }, "shell")} title="Terminal shell">{icons.shell}</button>
          <button className="ib ib-accent" onClick={() => addAgent({ kind: "claude", extra_args: [] }, "claude")} title="Agente claude">{icons.claude}</button>
          <button className="ib" onClick={() => addNote()} title="Bloco de contexto">{icons.note}</button>
          <button className="ib" onClick={() => addShape("box")} title="Forma (diagrama)">{icons.shape}</button>
          <button className="ib" onClick={() => addPortal()} title="Portal (navegador)">{icons.portal}</button>
          <span className="island-sep" />
          <button className="ib" onClick={() => { void openEditor(activeCwd).catch((e) => alertMsg("Erro ao abrir editor", String(e))); }} title="Abrir no editor">{icons.code}</button>
          <button className="ib" onClick={doSave} title="Salvar workspace">{icons.save}</button>
        </div>
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(inst) => { rfRef.current = inst; }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMoveEnd={dirty}
            onPaneContextMenu={paneContext}
            onNodeContextMenu={nodeContext}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background gap={26} size={1.4} color="#302a25" />
            <Controls />
          </ReactFlow>
        </div>
      </main>
      {roleTarget && <RolePicker repoPath={cwd} onApply={applyRoleToTarget} onClose={() => setRoleTarget(null)} />}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      <DialogHost />
    </div>
  );
}
