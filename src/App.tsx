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
import { ContextPicker } from "./ContextPicker";
import { Batuta, type BatutaItem } from "./Batuta";
import { Sidebar, folderName } from "./Sidebar";
import { Island, islandNotify } from "./Island";
import { Icone } from "./Icone";
import { ContextMenu, type MenuState, type MenuItem } from "./ContextMenu";
import { DialogHost, askText, askConfirm, alertMsg } from "./Dialog";
import { Welcome, jaViuBoasVindas } from "./Welcome";
import {
  forwardOutput, applyRole, createFloor, removeFloor, openEditor,
  listWorkspaces, loadWorkspace, saveWorkspace, deleteWorkspace,
  listContexts, applyContexts,
  type AgentCmd, type Role, type Floor, type WorkspaceMeta, type WsAgent, type Workspace, type CanvasState, type Context,
} from "./lib/tauri";
import { terminals, noteText } from "./shared";
import "./App.css";

const nodeTypes: NodeTypes = { agent: AgentNode, note: NoteNode, shape: ShapeNode, portal: PortalNode };
let seq = 0;

// linha de rota do protocolo: "⇢destino: mensagem", tolerando bullets do TUI
const ROTA = /^[\s⏺●•>*-]*⇢\s*([^\s:]+)\s*:\s*(.+)$/u;
const rotaKey = (dest: string, msg: string) => `${dest.toLowerCase()} :: ${msg.trim()}`;
// por quanto tempo uma rota que NÓS enviamos é tratada como eco (redraw do TUI)
const ECO_MS = 120_000;

// naipes: cada agente novo pega a próxima cor — é a única cor do app, serve
// pra distinguir nó de relance sobre a base neutra
const SECTIONS = ["#58a6ff", "#3fb950", "#e3b341", "#db6e8c"];

// ícones da @edusites/icons (herda cor via currentColor; tamanho vem do CSS).
// claude fica com o desenho próprio: é a fagulha da marca, não um ícone genérico.
const icons = {
  folder: <Icone nome="pasta" />,
  shell: <Icone nome="terminal-cli" />,
  claude: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.8 6.6L19 4.9l-3.6 5.7L22 12l-6.6 1.4L19 19.1l-5.2-3.7L12 22l-1.8-6.6L5 19.1l3.6-5.7L2 12l6.6-1.4L5 4.9l5.2 3.7Z" /></svg>,
  note: <Icone nome="notas" />,
  shape: <Icone nome="grafico-arvore" />,
  portal: <Icone nome="globo" />,
  code: <Icone nome="codigo" />,
  save: <Icone nome="salvar" />,
  layers: <Icone nome="quadrados" />,
  trash: <Icone nome="lixeira" />,
  edit: <Icone nome="editar" />,
  clock: <Icone nome="relogio" />,
  role: <Icone nome="alvo" />,
  send: <Icone nome="enviar" />,
  context: <Icone nome="documento-linhas" />,
  batuta: <Icone nome="nota-musical" />,
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
  // Eco anti-cascata (regra 5): tudo que MANDAMOS pra um agente reaparece no
  // terminal dele (o TUI ecoa o paste). Um bloco de contexto que documenta o
  // protocolo — linha começando com ⇢ — viraria rota de verdade nesse eco.
  // Guardamos as rotas enviadas por agente e engolimos a primeira repetição.
  // Janela de tempo, não "engole a primeira": o TUI redesenha a tela e a mesma
  // linha reaparece no buffer várias vezes. Depois da janela, a rota volta a
  // valer — o agente pode legitimamente repetir um comando mais tarde.
  const sentRef = useRef(new Map<string, Map<string, number>>());
  const rememberSent = useCallback((id: string, text: string) => {
    const ate = Date.now() + ECO_MS;
    const m0 = sentRef.current.get(id) ?? new Map<string, number>();
    for (const line of text.split("\n")) {
      const m = line.match(ROTA);
      if (m) m0.set(rotaKey(m[1], m[2]), ate);
    }
    if (m0.size) sentRef.current.set(id, m0);
  }, []);
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
  // ids de nó se repetem entre workspaces (seq zera a cada sessão), então toda
  // ação que espera um diálogo confere que o canvas não trocou no meio.
  const wsIdRef = useRef("");
  wsIdRef.current = wsId;
  const [wsName, setWsName] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const [roleTarget, setRoleTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [batuta, setBatuta] = useState(false);
  const [welcome, setWelcome] = useState(!jaViuBoasVindas());

  // ── contextos ────────────────────────────────────────────────────
  // catálogo do repo + os "padrões do workspace" (semeados em todo agente
  // claude novo). ctxSeededRef é transiente: depois de recarregar, o PTY é
  // novo e o processo não lembra nada → semeia de novo.
  const [contexts, setContexts] = useState<Context[]>([]);
  const [defaultContexts, setDefaultContexts] = useState<string[]>([]);
  const [ctxTarget, setCtxTarget] = useState<string | null | undefined>(undefined); // undefined = fechado, null = só gerenciar
  const contextsRef = useRef<Context[]>([]);
  contextsRef.current = contexts;
  const defaultsRef = useRef<string[]>([]);
  defaultsRef.current = defaultContexts;
  const ctxSeededRef = useRef(new Set<string>());
  // agentes que já receberam o texto das notas conectadas (3º estágio do seed)
  const noteSeededRef = useRef(new Set<string>());

  const refreshWs = useCallback(() => { listWorkspaces().then(setWorkspaces).catch(() => {}); }, []);
  useEffect(() => { refreshWs(); }, [refreshWs]);

  // catálogo de contextos vem do repo aberto (.orquestra/contexts/*.md)
  const refreshContexts = useCallback(() => {
    listContexts(cwd).then(setContexts).catch(() => setContexts([]));
  }, [cwd]);
  useEffect(() => { refreshContexts(); }, [refreshContexts]);

  useEffect(() => {
    const un = listen<string>("agent-exited", (e) => {
      const label = (nodesRef.current.find((n) => n.id === e.payload)?.data as { label?: string } | undefined)?.label;
      if (label) islandNotify({ text: `${label} saiu`, tone: "bad" });
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
    // nota→agente: o texto entra sozinho ao conectar (o ⇢ da nota é só reenviar)
    if (src.type === "note" && tgt.type === "agent") {
      const texto = (noteText.get(src.id) ?? "").trim();
      if (texto) {
        flashEdge(src.id, tgt.id);
        rememberSent(tgt.id, texto);
        void forwardOutput(tgt.id, texto).catch(() => {});
      }
      return;
    }
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
    // atividade na island: quem falou com quem
    const lbl = (id: string) => (nodesRef.current.find((n) => n.id === id)?.data as { label?: string } | undefined)?.label ?? id;
    islandNotify({ text: `${lbl(source)} ⇢ ${lbl(target)}`, tone: "flow" });
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
    ctxSeededRef.current.delete(id);
    noteSeededRef.current.delete(id);
    sentRef.current.delete(id);
    const t = schedRef.current.get(id);
    if (t) { clearInterval(t); schedRef.current.delete(id); }
    schedSpecRef.current.delete(id);
    dirty();
  }, [dirty]);

  // processo NOVO pro mesmo id (o nó remontou): o claude que sobe não lembra
  // nada, então esquecemos protocolo/contexto já semeados e o offset de leitura
  // do buffer — senão o agente ficava sem instrução nenhuma e o `readNewLines`
  // lia de um índice que não existe mais.
  const agentRespawned = useCallback((id: string) => {
    seededRef.current.delete(id);
    ctxSeededRef.current.delete(id);
    noteSeededRef.current.delete(id);
    sentRef.current.delete(id);
    lastLineRef.current.delete(id);
    setNodes((ns) => ns.map((n) => (n.id === id && (n.data as AgentNodeData).exited ? { ...n, data: { ...n.data, exited: false } } : n)));
  }, []);

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

  // semeia num agente os contextos escolhidos (uma submissão só, via Rust) e
  // registra no nó o que foi semeado — persiste e vira selo no header.
  // recebe os objetos prontos (o picker já os tem): resolver por nome de arquivo
  // no catálogo do App falhava calado quando o contexto tinha acabado de ser
  // criado e o catálogo ainda não havia recarregado.
  const seedContexts = useCallback(async (id: string, picked: Context[]) => {
    if (!picked.length) return false;
    // contexto costuma documentar o próprio protocolo ⇢ — não deixa o eco rotear
    rememberSent(id, picked.map((c) => c.body).join("\n"));
    try {
      await applyContexts(id, picked);
    } catch (e) {
      void alertMsg("Erro ao semear contexto", String(e));
      return false;
    }
    ctxSeededRef.current.add(id);
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, contexts: picked.map((c) => c.file) } } : n)));
    dirty();
    return true;
  }, [dirty, rememberSent]);

  // caminho automático (idle): resolve os arquivos no catálogo carregado. Se o
  // catálogo ainda não chegou, devolve falso SEM marcar como semeado — senão o
  // agente ficava sem contexto pelo resto da sessão.
  const seedContextFiles = useCallback((id: string, files: string[]) => {
    const picked = contextsRef.current.filter((c) => files.includes(c.file));
    if (!picked.length) return false;
    void seedContexts(id, picked);
    return true;
  }, [seedContexts]);

  const handleIdle = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const d = node.data as AgentNodeData;
    const lines = readNewLines(id);
    if (d.cmd.kind === "claude") {
      // 1º idle: protocolo ⇢NOME:. 2º idle: contextos. Em submissões separadas —
      // dois bracketed-paste juntos se atropelam no prompt do claude.
      if (!seededRef.current.has(id)) {
        seededRef.current.add(id);
        void forwardOutput(id, seedPrompt(d.label)).catch(() => {});
        return;
      }
      if (!ctxSeededRef.current.has(id)) {
        // Nó restaurado repete os contextos dele; sem contextos próprios (nó novo
        // ou salvo antes de existir padrão) pega os padrões do workspace.
        // `?.length` e não `??`: lista vazia é ausência, e `[] ?? x` devolve [].
        const alvo = d.contexts?.length ? d.contexts : defaultsRef.current;
        if (seedContextFiles(id, alvo)) return;
        // catálogo ainda carregando: tenta de novo no próximo idle
      }
      // 3º idle: texto das notas já conectadas a este agente (nota→agente é
      // automático — o botão ⇢ da nota vira só "reenviar após editar")
      if (!noteSeededRef.current.has(id)) {
        noteSeededRef.current.add(id);
        const textos = edgesRef.current
          .filter((e) => e.target === id)
          .map((e) => nodesRef.current.find((n) => n.id === e.source))
          .filter((n) => n?.type === "note")
          .map((n) => (noteText.get(n!.id) ?? "").trim())
          .filter(Boolean);
        if (textos.length) {
          const t = `(contexto das notas conectadas)\n${textos.join("\n\n")}`;
          rememberSent(id, t);
          void forwardOutput(id, t).catch(() => {});
          return;
        }
      }
    }
    const targets = edgesRef.current.filter((e) => e.source === id).map((e) => e.target);
    if (!targets.length) return;
    for (const line of lines) {
      const m = line.match(ROTA);
      if (!m) continue;
      const [, dest, msg] = m;
      // eco do que nós mesmos semeamos/encaminhamos: dentro da janela, não roteia
      const eco = sentRef.current.get(id);
      const ate = eco?.get(rotaKey(dest, msg));
      if (ate !== undefined) {
        if (ate > Date.now()) continue;
        eco!.delete(rotaKey(dest, msg)); // janela venceu: limpa e deixa passar
      }
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
        rememberSent(t, msg);
        void forwardOutput(t, isShell ? msg : `(de ${d.label}) ${msg}`).catch(() => {});
      });
    }
  }, [readNewLines, flashEdge, rememberSent, seedContextFiles]);

  const sendFrom = useCallback((sourceId: string) => {
    const targets = edgesRef.current.filter((e) => e.source === sourceId).map((e) => e.target);
    if (!targets.length) return;
    const term = terminals.get(sourceId);
    const text = (term?.getSelection() || noteText.get(sourceId) || "").trim();
    if (!text) return;
    targets.forEach((t) => { flashEdge(sourceId, t); rememberSent(t, text); void forwardOutput(t, text).catch(() => {}); });
  }, [flashEdge, rememberSent]);

  const openRole = useCallback((id: string) => setRoleTarget(id), []);
  const applyRoleToTarget = (role: Role) => {
    const id = roleTarget;
    if (!id) return;
    rememberSent(id, role.body);
    void applyRole(id, role).catch(() => {});
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, roleName: role.name } } : n)));
    dirty();
  };

  // rótulo é endereço de rota (⇢NOME:): único no canvas, sem espaço nem ":".
  // Ao mudar, avisa o próprio nó e todos que apontam pra ele — senão eles
  // continuam mandando pro nome antigo e a mensagem morre.
  const renameNode = useCallback(async (id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const antes = String((node.data as { label?: string }).label ?? "");
    const wsAntes = wsIdRef.current;
    const r = await askText("Renomear nó", [{ label: "rótulo (endereço nas mensagens ⇢)", default: antes }]);
    if (wsIdRef.current !== wsAntes) return; // trocou de canvas enquanto o diálogo estava aberto
    const label = r?.[0]?.trim();
    if (!label || label === antes) return;
    if (/[\s:]/.test(label)) {
      void alertMsg("Rótulo inválido", "O rótulo é endereço de rota: sem espaços e sem \":\".");
      return;
    }
    // "todos" e "nota" são destinos reservados do protocolo: um nó com esses
    // nomes fica inalcançável individualmente (broadcast / nota ganham antes).
    if (label.toLowerCase() === "todos" || label.toLowerCase() === "nota") {
      void alertMsg("Rótulo reservado", `"${label}" é destino reservado do protocolo ⇢ — escolha outro.`);
      return;
    }
    if (nodesRef.current.some((n) => n.id !== id && (n.data as { label?: string }).label === label)) {
      void alertMsg("Rótulo repetido", `Já existe um nó "${label}" neste canvas.`);
      return;
    }
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    dirty();
    const isClaude = (n?: Node) => n?.type === "agent" && (n.data as AgentNodeData).cmd.kind === "claude";
    if (isClaude(node)) void forwardOutput(id, `(sistema) seu rótulo agora é "${label}" (era "${antes}").`).catch(() => {});
    for (const e of edgesRef.current.filter((e) => e.target === id)) {
      if (isClaude(nodesRef.current.find((n) => n.id === e.source)))
        void forwardOutput(e.source, `(sistema) o nó "${antes}" agora se chama "${label}" — use ⇢${label}: daqui pra frente.`).catch(() => {});
    }
  }, [dirty]);

  // liga o intervalo e registra o spec (o spec vai pro workspace no autosave)
  const startSchedule = useCallback((id: string, secs: number, text: string) => {
    const t = window.setInterval(() => {
      rememberSent(id, text);
      void forwardOutput(id, text).catch(() => {});
    }, secs * 1000);
    schedRef.current.set(id, t);
    schedSpecRef.current.set(id, { secs, text });
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, scheduled: true } } : n)));
  }, [rememberSent]);

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
    const wsAntes = wsIdRef.current;
    const r = await askText("Agendar prompt", [
      { label: "intervalo (segundos)", default: "300", type: "number" },
      { label: "prompt a enviar", placeholder: "ex: rode os testes e me diga o status" },
    ]);
    if (!r || wsIdRef.current !== wsAntes) return; // canvas trocou no meio
    const secs = Number(r[0]);
    const text = r[1]?.trim();
    if (!secs || secs <= 0 || !text) return;
    startSchedule(id, secs, text);
    dirty();
  }, [startSchedule, dirty]);

  const agentData = (label: string, cmd: AgentCmd, section: string, extra: Partial<AgentNodeData> = {}): AgentNodeData => ({
    label, cmd, cwd: activeCwd, section,
    onKill: killNode, onSend: sendFrom, onIdle: handleIdle, onSpawn: agentRespawned,
    onRole: openRole, onSchedule: scheduleAgent,
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
      dirty(); // sem isso o worktree existe no disco mas não no workspace: no
      // reload o create_floor recusa com "já existe" e a UI não oferece saída
    } catch (e) { void alertMsg("Erro ao criar floor", String(e)); }
  };
  // remove sem force: o Rust recusa se houver trabalho não commitado (regra 8).
  // Só depois de o usuário confirmar o descarte é que repetimos com force.
  const dropFloor = async (slug: string) => {
    try {
      await removeFloor(cwd, slug);
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("não commitada")) { void alertMsg("Erro ao remover floor", msg); return; }
      if (!(await askConfirm("Descartar trabalho do floor?", `${msg}`, true))) return;
      try { await removeFloor(cwd, slug, true); }
      catch (e2) { void alertMsg("Erro ao remover floor", String(e2)); return; }
    }
    setFloors((fs) => fs.filter((f) => f.slug !== slug));
    if (activeFloor === slug) setActiveFloor("");
    dirty(); // senão o floor removido volta no reload apontando pra pasta que não existe
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
            return { ...base, data: {
              label: a.label, cmd: a.cmd, cwd: a.cwd, roleName: a.roleName ?? null,
              contexts: a.contexts ?? [],
              schedule: schedSpecRef.current.get(n.id) ?? null,
            } };
          }
          case "note": return { ...base, data: { text: noteText.get(n.id) ?? "" } };
          case "shape": return { ...base, data: { label: d.label ?? "", variant: d.variant ?? "box" } };
          case "portal": return { ...base, data: { label: d.label ?? "", url: d.url ?? "" } };
          default: return { ...base, data: {} };
        }
      }),
      edges: edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      defaultContexts: defaultsRef.current,
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
    if (wsId) { await persistCurrent(); refreshWs(); islandNotify({ text: "workspace salvo", tone: "ok" }); return; }
    const r = await askText("Salvar workspace", [{ label: "nome", placeholder: "meu-projeto" }]);
    const name = r?.[0]?.trim();
    if (!name) return;
    const id = `ws-${Date.now()}`;
    try { await saveWorkspace(buildWorkspace(id, name)); setWsId(id); setWsName(name); refreshWs(); islandNotify({ text: "workspace salvo", tone: "ok" }); }
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
    ctxSeededRef.current.clear();
    sentRef.current.clear();
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
      setDefaultContexts(canvas?.defaultContexts ?? []);
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
                contexts: (d.contexts as string[] | undefined) ?? undefined,
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
      setDefaultContexts([]); // catálogo de contextos é por repo
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
      // papel e contexto são PROSA: num shell cada linha do markdown viraria
      // comando (com `>` truncando arquivo). Só oferece pra claude.
      if ((node.data as AgentNodeData).cmd.kind === "claude") {
        items.push(
          { label: "Atribuir papel", icon: icons.role, onClick: () => openRole(node.id) },
          { label: "Semear contextos", icon: icons.context, onClick: () => setCtxTarget(node.id) },
        );
      }
      items.push(
        { label: "Agendar prompt", icon: icons.clock, onClick: () => scheduleAgent(node.id) },
        { label: "Enviar seleção", icon: icons.send, onClick: () => sendFrom(node.id) },
        { sep: true },
      );
    }
    if (node.type === "agent" || node.type === "portal") {
      items.push({ label: "Renomear", icon: icons.edit, onClick: () => void renameNode(node.id) });
    }
    items.push({ label: "Remover", danger: true, icon: icons.trash, onClick: () => killNode(node.id) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ── batuta (paleta de comandos) ─────────────────────────────────
  const centerPos = (): XYPosition =>
    rfRef.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 0, y: 0 };

  const batutaItems = (): BatutaItem[] => {
    const it: BatutaItem[] = [
      { id: "n-shell", group: "criar", label: "Terminal shell", icon: icons.shell, run: () => addAgent({ kind: "shell", program: null }, "shell", centerPos()) },
      { id: "n-claude", group: "criar", label: "Agente claude", icon: icons.claude, run: () => addAgent({ kind: "claude", extra_args: [] }, "claude", centerPos()) },
      { id: "n-note", group: "criar", label: "Bloco de contexto", icon: icons.note, run: () => addNote(centerPos()) },
      { id: "n-shape", group: "criar", label: "Forma (diagrama)", icon: icons.shape, run: () => addShape("box", centerPos()) },
      { id: "n-portal", group: "criar", label: "Portal (navegador)", icon: icons.portal, run: () => addPortal(centerPos()) },
      { id: "a-ctx", group: "contextos", label: "Gerenciar contextos", icon: icons.context, run: () => setCtxTarget(null) },
      { id: "a-save", group: "workspace", label: "Salvar workspace", icon: icons.save, run: () => void doSave() },
      { id: "a-folder", group: "workspace", label: "Abrir pasta…", icon: icons.folder, run: () => void newWorkspaceFromFolder() },
      { id: "a-editor", group: "workspace", label: "Abrir no editor", icon: icons.code, run: () => void openEditor(activeCwd).catch((e) => alertMsg("Erro ao abrir editor", String(e))) },
      { id: "f-new", group: "floors", label: "Novo floor…", icon: icons.layers, run: () => void addFloor() },
    ];
    for (const w of workspaces) {
      if (w.id === wsId) continue;
      it.push({ id: `w-${w.id}`, group: "workspace", label: `Abrir ${folderName(w)}`, hint: w.repoPath, icon: icons.folder, run: () => void openWs(w.id) });
    }
    if (activeFloor) it.push({ id: "raiz", group: "floors", label: "Ir pra raiz", icon: icons.folder, run: () => setActiveFloor("") });
    for (const f of floors) {
      if (f.slug === activeFloor) continue;
      it.push({ id: `floor:${f.slug}`, group: "floors", label: `Floor ${f.slug}`, hint: f.branch, icon: icons.layers, run: () => setActiveFloor(f.slug) });
    }
    // agentes: focar no nó e semear contexto direto nele
    for (const n of nodes) {
      const label = String((n.data as { label?: string }).label ?? n.id);
      it.push({ id: `go-${n.id}`, group: "nós", label: `Ir para ${label}`, hint: n.type, icon: icons.send,
        run: () => rfRef.current?.fitView({ nodes: [{ id: n.id }], duration: 350, maxZoom: 1.1 }) });
      if (n.type === "agent" && (n.data as AgentNodeData).cmd.kind === "claude")
        it.push({ id: `ctx-${n.id}`, group: "contextos", label: `Semear contextos em ${label}`, icon: icons.context, run: () => setCtxTarget(n.id) });
    }
    return it;
  };

  // Atalhos. Ctrl+Shift+K abre a batuta em qualquer lugar (capturado antes do
  // xterm, o terminal não vê); Ctrl+K só fora do terminal, pra não roubar o
  // kill-line do shell. Mesma razão pro Ctrl+S (dentro do terminal é XOFF).
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;
  useEffect(() => {
    const inTerm = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest(".agent-term");
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Modal aberto = atalho desligado. O DialogHost tem um slot só: abrir um
      // segundo diálogo por cima substituía o pedido e a promessa do primeiro
      // nunca resolvia (rename/agendamento sumiam sem erro, e podiam voltar
      // aplicados no workspace errado depois de uma troca).
      const modalAberto = !!document.querySelector(".modal-backdrop:not(.batuta-backdrop)");
      if (modalAberto) return;
      const k = e.key.toLowerCase();
      if (k === "k" && (e.shiftKey || !inTerm(e.target))) {
        e.preventDefault();
        e.stopPropagation();
        setBatuta((b) => !b);
      } else if (k === "s" && !e.shiftKey && !inTerm(e.target)) {
        e.preventDefault();
        void doSaveRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

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
        <Island
          pill={
            <span className="island-id island-pill" title={cwd}>
              <span className="island-brand">or<span className="brand-q">q</span></span>
              <span className="island-ws">{activeName}</span>
              {nodes.filter((n) => n.type === "agent").length > 0 && (
                <span className="island-count">{nodes.filter((n) => n.type === "agent" && !(n.data as AgentNodeData).exited).length}</span>
              )}
            </span>
          }
        >
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
          <button
            className={`ib${defaultContexts.length ? " ib-accent" : ""}`}
            onClick={() => setCtxTarget(null)}
            title={defaultContexts.length ? `Contextos (${defaultContexts.length} padrão em agentes novos)` : "Contextos do projeto"}
          >
            {icons.context}
          </button>
          <button className="ib" onClick={() => setBatuta(true)} title="Batuta — paleta de comandos (Ctrl+K)">{icons.batuta}</button>
          <button className="ib" onClick={() => { void openEditor(activeCwd).catch((e) => alertMsg("Erro ao abrir editor", String(e))); }} title="Abrir no editor">{icons.code}</button>
          <button className="ib" onClick={doSave} title="Salvar workspace (Ctrl+S)">{icons.save}</button>
        </Island>
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
      {ctxTarget !== undefined && (
        <ContextPicker
          repoPath={cwd}
          targetLabel={ctxTarget ? String((nodes.find((n) => n.id === ctxTarget)?.data as { label?: string })?.label ?? "") : undefined}
          defaults={defaultContexts}
          onApply={(picked) => { if (ctxTarget) void seedContexts(ctxTarget, picked); }}
          onDefaults={(files) => { setDefaultContexts(files); dirty(); }}
          onClose={() => { setCtxTarget(undefined); refreshContexts(); }}
        />
      )}
      {batuta && <Batuta items={batutaItems()} onClose={() => setBatuta(false)} />}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {welcome && <Welcome onClose={() => setWelcome(false)} />}
      <DialogHost />
    </div>
  );
}
