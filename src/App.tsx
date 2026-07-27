import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ReactFlow,
  Background,
  MarkerType,
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
import { MermaidNode, type MermaidNodeData } from "./MermaidNode";
import { MermaidEditor } from "./MermaidEditor";
import { PortalNode, type PortalNodeData } from "./PortalNode";
import { RolePicker } from "./RolePicker";
import { ContextPicker } from "./ContextPicker";
import { Batuta, type BatutaItem } from "./Batuta";
import { Island, islandNotify } from "./Island";
import { Controles } from "./Controles";
import {
  PiFolder, PiTerminalWindow, PiNote, PiTreeStructure, PiGlobeHemisphereWest,
  PiCode, PiFloppyDisk, PiStack, PiTrash, PiPencilSimple, PiClockCountdown,
  PiTarget, PiPaperPlaneTilt, PiFileText, PiMusicNotes, PiRobot, PiTerminal,
  PiFolderOpen, PiFolderPlus, PiCaretDown, PiSun, PiMoonStars,
} from "react-icons/pi";
import { SiClaude, SiGooglegemini, SiGoogle } from "react-icons/si";
import { RiOpenaiFill } from "react-icons/ri";
import { ContextMenu, type MenuState, type MenuItem } from "./ContextMenu";
import { DialogHost, askText, askConfirm, alertMsg } from "./Dialog";
import { Welcome, jaViuBoasVindas } from "./Welcome";
import {
  forwardOutput, applyRole, createFloor, removeFloor, openEditor, fetchPage,
  listWorkspaces, loadWorkspace, saveWorkspace, deleteWorkspace,
  listContexts, applyContexts,
  type AgentCmd, type Role, type Floor, type WorkspaceMeta, type WsAgent, type Workspace, type CanvasState, type Context,
} from "./lib/tauri";
import { terminals, noteText, folderName } from "./shared";
import { ROTA, rotaKey, blocoDaRota, rotaDaLinha } from "./protocolo";
import { enquadraNota, enquadraNotas, modoValido, MODO_PADRAO, type ModoNota } from "./nota";
import { comandoPortal, normalizaUrl, extraiTexto } from "./pagina";
import { trunca, kb } from "./texto";
import { aplicaTema, temaSalvo, type Tema } from "./tema";
import "./App.css";

const nodeTypes: NodeTypes = { agent: AgentNode, note: NoteNode, mermaid: MermaidNode, portal: PortalNode };

// Linha lida do buffer do xterm, com o índice absoluto junto: o índice é a
// identidade da linha entre duas leituras (ver readRouteLines).
type Linha = { idx: number; text: string };
let seq = 0;

// por quanto tempo uma rota que NÓS enviamos é tratada como eco (redraw do TUI)
const ECO_MS = 120_000;

// naipes: cada agente novo pega a próxima cor — é a única cor do app, serve
// pra distinguir nó de relance sobre a base neutra
const SECTIONS = ["#007aff", "#3fb950", "#ffa500", "#db6e8c"];

// diagrama nasce com um exemplo curto: em branco não ensina a sintaxe
const MMD_EXEMPLO = "flowchart LR\n  A[cliente] --> B[api] --> C[(banco)]";

// LLM = recebe protocolo/contextos/notas por prosa (claude ou agente CLI
// genérico); shell recebe comando cru
const isLLM = (cmd: AgentCmd) => cmd.kind === "claude" || cmd.kind === "agent";

// Os CLIs de agente. O claude entra aqui como UM entre vários: o produto é um
// canvas de agentes, não um front pro claude. Só ele tem variante própria no
// IPC (AgentCmd::Claude); o resto é AgentCmd::Agent { program }, resolvido pelo
// PATH do usuário. Este array é a única fonte da lista — island, menu de
// contexto e batuta todos leem daqui.
const CLIS: { label: string; hint: string; icon: ReactNode; mk: () => AgentCmd }[] = [
  { label: "claude", hint: "Claude Code", icon: <SiClaude />, mk: () => ({ kind: "claude", extra_args: [] }) },
  { label: "codex", hint: "OpenAI Codex CLI", icon: <RiOpenaiFill />, mk: () => ({ kind: "agent", program: "codex", extra_args: [] }) },
  { label: "gemini", hint: "Gemini CLI", icon: <SiGooglegemini />, mk: () => ({ kind: "agent", program: "gemini", extra_args: [] }) },
  { label: "opencode", hint: "OpenCode", icon: <PiTerminal />, mk: () => ({ kind: "agent", program: "opencode", extra_args: [] }) },
  { label: "antigravity", hint: "Antigravity CLI", icon: <SiGoogle />, mk: () => ({ kind: "agent", program: "agy", extra_args: [] }) },
];

// ícones Phosphor (react-icons/pi) — herdam cor via currentColor; o tamanho
// vem do CSS (`.ib svg`, `.ctx-ico svg`). Marcas ficam com o logo real
// (react-icons/si): agente não é um robô genérico, é aquele agente.
const icons = {
  folder: <PiFolder />,
  shell: <PiTerminalWindow />,
  claude: <SiClaude />,
  note: <PiNote />,
  diagrama: <PiTreeStructure />,
  portal: <PiGlobeHemisphereWest />,
  code: <PiCode />,
  save: <PiFloppyDisk />,
  layers: <PiStack />,
  trash: <PiTrash />,
  edit: <PiPencilSimple />,
  clock: <PiClockCountdown />,
  role: <PiTarget />,
  send: <PiPaperPlaneTilt />,
  context: <PiFileText />,
  batuta: <PiMusicNotes />,
  robo: <PiRobot />,
  folderOpen: <PiFolderOpen />,
  folderPlus: <PiFolderPlus />,
  caret: <PiCaretDown />,
  sol: <PiSun />,
  lua: <PiMoonStars />,
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
  // Rotas já despachadas, por agente, na chave "índice absoluto::conteúdo".
  // Existe porque o roteamento re-varre a tela visível a cada idle — ver
  // `readRouteLines`. Só rota entra aqui, então o conjunto fica pequeno.
  // ponytail: sem poda; se um dia crescer, apagar chave com índice < baseY.
  const rowsRoteadasRef = useRef(new Map<string, Set<string>>());
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
  // Delegação pra shell: quem pediu, e o quê. O comando roda no PTY do shell e a
  // saída dele NÃO tem linha ⇢ nenhuma, então sem isto o agente delegava
  // `⇢shell-1: pnpm test` e nunca ficava sabendo o resultado — e o prompt de
  // protocolo manda delegar exatamente assim. O laço fecha no próximo idle do
  // shell: PTY não "termina", mas ficar quieto depois de imprimir é o sinal.
  const esperaShell = useRef(new Map<string, { pedinte: string; comando: string }>());
  const schedRef = useRef(new Map<string, number>());
  const schedPendRef = useRef(new Set<string>()); // agendamento armado, esperando o agente ficar ocioso
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

  // touchpad/roda: vertical = zoom ancorado no cursor; horizontal = pan lateral.
  // (React Flow só oferece "roda = zoom" OU "roda = pan" — aqui é os dois.)
  const onCanvasWheel = useCallback((e: React.WheelEvent) => {
    const inst = rfRef.current;
    if (!inst) return;
    // dentro de terminal/nota (.nowheel) a roda é scrollback/scroll do próprio nó
    if ((e.target as HTMLElement).closest(".nowheel")) return;
    const vp = inst.getViewport();
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      const zoom = Math.min(2, Math.max(0.2, vp.zoom * Math.pow(2, -e.deltaY * 0.0018)));
      // ancora o ponto sob o cursor: p = (tela - t)/z ; t' = tela - p·z'
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const px = (sx - vp.x) / vp.zoom;
      const py = (sy - vp.y) / vp.zoom;
      void inst.setViewport({ x: sx - px * zoom, y: sy - py * zoom, zoom });
    } else {
      void inst.setViewport({ ...vp, x: vp.x - e.deltaX });
    }
    dirty();
  }, [dirty]);

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
  const [tema, setTema] = useState<Tema>(temaSalvo);
  // canvas travado: navega (pan/zoom) mas não move, liga nem seleciona nó
  const [travado, setTravado] = useState(false);

  const [roleTarget, setRoleTarget] = useState<string | null>(null);
  const [mmdTarget, setMmdTarget] = useState<string | null>(null); // diagrama aberto no editor
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
  // O que um nó de destino É, na voz que o agente lê. Fonte única: o aviso de
  // conexão E a lista de vizinhos no prompt de protocolo saem daqui — antes só o
  // onConnect sabia disso, então agente restaurado (que só recebe o prompt) não
  // ficava sabendo de nada.
  const descreveDestino = useCallback((tgt: Node): string => {
    const rot = (tgt.data as { label?: string }).label ?? tgt.id;
    if (tgt.type === "note") return "uma nota — escreva nela com ⇢nota: texto";
    if (tgt.type === "portal") return `um navegador — ⇢${rot}: URL navega até a URL, e ⇢${rot}: ler devolve o texto da página pra você (⇢${rot}: ler URL faz os dois)`;
    if (tgt.type === "mermaid") return `um diagrama mermaid — ⇢${rot}: seguido do código mermaid (pode ocupar várias linhas, até uma linha em branco) redesenha o diagrama`;
    if (tgt.type !== "agent") return "um nó sem interação";
    const cmd = (tgt.data as AgentNodeData).cmd;
    return cmd.kind === "shell"
      ? `um terminal shell — ⇢${rot}: comando executa o comando LÁ, não rode você mesmo, e a saída volta pra você como "(de ${rot}) …"`
      : `um agente — fale com ele via ⇢${rot}: mensagem`;
  }, []);

  const onConnect = useCallback((c: Connection) => {
    setEdges((es) => addEdge(c, es));
    dirty();
    const src = nodesRef.current.find((n) => n.id === c.source);
    const tgt = nodesRef.current.find((n) => n.id === c.target);
    if (!src || !tgt) return;
    // nota→agente: o texto entra sozinho ao conectar (o ⇢ da nota é só reenviar)
    if (src.type === "note" && tgt.type === "agent") {
      // agente que ainda não passou pelo estágio de notas vai receber a nota na
      // semeadura: mandar aqui também entregava a MESMA nota duas vezes
      if (!noteSeededRef.current.has(tgt.id)) return;
      const texto = enquadraNota((src.data as NoteNodeData).modo, noteText.get(src.id) ?? "");
      if (texto) {
        flashEdge(src.id, tgt.id);
        rememberSent(tgt.id, texto);
        void forwardOutput(tgt.id, texto).catch(() => {});
      }
      return;
    }
    const sd = src.data as AgentNodeData;
    if (src.type !== "agent" || !isLLM(sd.cmd)) return;
    const kind = descreveDestino(tgt);
    const label = tgt.type === "note" ? "nota" : (tgt.data as { label?: string }).label ?? tgt.id;
    const aviso = `(sistema) você foi conectado ao nó "${label}": ${kind}. Responda apenas OK.`;
    rememberSent(c.source!, aviso);
    void forwardOutput(c.source!, aviso).catch(() => {});
    // A aresta é dirigida, então quem recebe também precisa saber que existe: sem
    // isso, uma ligação desenhada "ao contrário" (codex→claude quando se queria
    // claude→codex) morre calada e ninguém entende por que o claude não delega.
    if (tgt.type === "agent" && isLLM((tgt.data as AgentNodeData).cmd)) {
      const volta = `(sistema) o nó "${sd.label}" pode te endereçar; o que ele mandar chega como "(de ${sd.label}) …" e você responde com ⇢${sd.label}: texto. Responda apenas OK.`;
      rememberSent(c.target!, volta);
      void forwardOutput(c.target!, volta).catch(() => {});
    }
    // flashEdge fora das deps de propósito: é declarado abaixo daqui, e citá-lo
    // no array (avaliado na hora) cai no TDZ. O corpo só roda depois.
  }, [dirty, rememberSent, descreveDestino]);

  // Endereço que existe no canvas: destino reservado ou rótulo de algum nó.
  // É o que autoriza uma seta ASCII a virar rota (ver protocolo.ts). Olha TODOS
  // os nós, não só os conectados, de propósito: aresta desenhada ao contrário
  // ainda cai no aviso "⇢X não existe aqui" em vez de sumir.
  const enderecoExiste = useCallback((dest: string) => {
    const d = dest.toLowerCase();
    if (d === "nota" || d === "todos") return true;
    return nodesRef.current.some((n) => (n.data as { label?: string }).label?.toLowerCase() === d);
  }, []);

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
    rowsRoteadasRef.current.delete(id);
    esperaShell.current.delete(id);
    const t = schedRef.current.get(id);
    if (t) { clearInterval(t); schedRef.current.delete(id); }
    schedSpecRef.current.delete(id);
    schedPendRef.current.delete(id);
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
    rowsRoteadasRef.current.delete(id); // buffer novo: os índices antigos não valem mais
    esperaShell.current.delete(id); // processo novo: a saída antiga não vem mais
    setNodes((ns) => ns.map((n) => (n.id === id && (n.data as AgentNodeData).exited ? { ...n, data: { ...n.data, exited: false } } : n)));
  }, []);

  // Junta [de..ate] do buffer colando as continuações de wrap na linha anterior.
  // `idx` é o índice absoluto da PRIMEIRA linha física do trecho: é ele que
  // identifica a linha entre duas leituras, porque o TUI reescreve por índice.
  const lerFaixa = useCallback((id: string, de: number, ate: number): Linha[] => {
    const buf = terminals.get(id)?.buffer.active;
    if (!buf) return [];
    const out: Linha[] = [];
    for (let i = Math.max(0, de); i <= ate; i++) {
      const line = buf.getLine(i);
      if (!line) continue;
      if (line.isWrapped && out.length) out[out.length - 1].text += line.translateToString(true);
      else out.push({ idx: i, text: line.translateToString(true) });
    }
    return out;
  }, []);

  // Do watermark até o cursor, AVANÇANDO o watermark. Entrega append-only
  // (saída de shell delegado) depende disso pra não reentregar o que já foi.
  const readNewLines = useCallback((id: string): Linha[] => {
    const buf = terminals.get(id)?.buffer.active;
    if (!buf) return [];
    const end = buf.baseY + buf.cursorY;
    const linhas = lerFaixa(id, lastLineRef.current.get(id) ?? 0, end);
    lastLineRef.current.set(id, end + 1);
    return linhas;
  }, [lerFaixa]);

  // Leitura para ROTEAMENTO. O watermark sozinho perde rota, e esse foi o bug
  // mais caro da série: o TUI do agente mantém uma região viva embaixo (caixa de
  // input, spinner, status) e a REESCREVE a cada frame. O idle de 1s dispara com
  // o cursor dentro dessa região, o watermark passa por cima daquelas linhas, e
  // a resposta seguinte é impressa EM CIMA delas — abaixo do watermark, nunca
  // lida. Caso real: `⇢nota: oi` visível no terminal, nota vazia, e nem o aviso
  // de destino inexistente saía, porque a linha jamais chegou ao parser.
  //
  // Então re-varremos a tela visível inteira todo idle. Quem evita rotear duas
  // vezes é a dedupe por "índice::conteúdo" (`rowsRoteadasRef`), que é exata e
  // não precisa de janela de tempo: linha reescrita tem conteúdo novo, e rota
  // que o agente repete de verdade cai noutro índice.
  const readRouteLines = useCallback((id: string): Linha[] => {
    const buf = terminals.get(id)?.buffer.active;
    if (!buf) return [];
    const novas = readNewLines(id); // mantém o watermark em dia pro caminho do shell
    const vistas = new Set(novas.map((l) => l.idx));
    const tela = lerFaixa(id, buf.baseY, buf.baseY + buf.cursorY).filter((l) => !vistas.has(l.idx));
    return [...tela, ...novas].sort((a, b) => a.idx - b.idx);
  }, [readNewLines, lerFaixa]);

  // Vizinhos ATUAIS do agente, pra entrar no prompt de protocolo. Sem isso, um
  // workspace recarregado tem agentes que sabem falar ⇢NOME: e não sabem nenhum
  // nome — o grafo existe e eles estão amnésicos.
  const vizinhosDe = (id: string) => {
    const alvos = edgesRef.current
      .filter((e) => e.source === id)
      .map((e) => nodesRef.current.find((n) => n.id === e.target))
      .filter((n): n is Node => !!n);
    if (!alvos.length) return "Você ainda não está conectado a nenhum nó — sem conexão, não há a quem endereçar.";
    return `Você está conectado a ${alvos.length} nó(s) e pode endereçar cada um: `
      + alvos.map((t) => `"${(t.data as { label?: string }).label ?? t.id}" é ${descreveDestino(t)}`).join("; ") + ".";
  };

  const seedPrompt = (label: string, vizinhos: string) =>
    `Você é o nó "${label}" num canvas do orquestra, junto com outros agentes. Mensagens de outros chegam como "(de nome) texto". Para falar com um nó conectado a você, escreva uma linha própria no formato ⇢NOME: texto — NOME é o título do nó de destino, ou a palavra todos para todos os conectados. Se o nó conectado for um terminal shell, ⇢NOME: comando digita e executa o comando NAQUELE terminal — quando o usuário pedir para rodar algo "no terminal", delegue assim, não execute você mesmo. Se o nó conectado for outro agente e o usuário pedir que ELE faça algo ("faça o codex implementar tal coisa"), delegue com ⇢NOME: em vez de fazer você mesmo: descreva a tarefa inteira na mensagem, porque ele não vê esta conversa. ATENÇÃO: delegar é ESCREVER a linha ⇢NOME: texto na sua saída, sozinha na linha, começando com o caractere ⇢ (copie ele daqui). Dizer "deleguei", anotar num arquivo ou descrever a tarefa em prosa NÃO entrega nada — só a linha entrega. A resposta dele volta pra você como "(de NOME) texto" — espere por ela antes de concluir, e use o mesmo caminho para tirar dúvidas com ele. Para escrever numa nota conectada (o "bloco de contexto" do canvas), escreva ⇢nota: texto — e quando o usuário pedir para "anotar", "registrar" ou "escrever" algo na nota, é ESSA linha que entrega: a nota é um nó do canvas, não um arquivo, e ela só muda se a linha ⇢nota: aparecer na sua saída. ${vizinhos} Você será avisado com "(sistema) ..." quando novas conexões forem criadas. Alinhamento: mantenha o quadro .orquestra/board.md na raiz do projeto — esse é um ARQUIVO, coisa diferente da nota: registre nele suas ações, decisões e status, e consulte-o antes de cada tarefa nova. Responda apenas OK.`;

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

  // Portal-leitor. Teto conservador abaixo do MAX_PASTE (16KB no Rust), com
  // espaço pro cabeçalho e pro aviso de truncagem.
  // ponytail: 12KB é chute — o teto real é o contexto do agente, não o PTY.
  const MAX_LEITURA = 12 * 1024;
  // saída de comando é menor de propósito: raramente os 12KB do meio ajudam, e
  // um `pnpm test` verboso encheria o contexto do delegante com ruído
  const MAX_SAIDA_SHELL = 4 * 1024;
  // Fila de entrega: duas leituras seguidas colariam dois bracketed-paste juntos,
  // o mesmo atropelo que a semeadura em 3 estágios evita.
  // ponytail: fila global; por agente se um dia houver dez portais lendo.
  const filaLeitura = useRef<Promise<unknown>>(Promise.resolve());
  const lerPortal = useCallback((portalId: string, pedinteId: string, url: string) => {
    const rotulo = (i: string) => (nodesRef.current.find((n) => n.id === i)?.data as { label?: string } | undefined)?.label ?? i;
    const nome = rotulo(portalId);
    const entrega = async () => {
      let texto: string;
      try {
        if (!url) throw new Error(`portal sem URL — mande \u21e2${nome}: <url> primeiro`);
        const extraido = extraiTexto(await fetchPage(url), url);
        // página que monta o DOM no cliente chega vazia; dizer isso é mais útil
        // que entregar três palavras de shell
        if (extraido.length < 40) throw new Error("a página não trouxe texto legível (provavelmente renderizada por JS)");
        const corte = trunca(extraido, MAX_LEITURA);
        texto = `(de ${nome}) leu ${url}\n${corte.texto}`
          + (corte.cortado ? `\n\n(…truncado: ${kb(MAX_LEITURA)} de ${kb(corte.bytes)} — peça \u21e2${nome}: ler <url mais específica>)` : "");
      } catch (e) {
        // erro NUNCA é silêncio: o agente pediu e está esperando
        texto = `(de ${nome}) falha ao ler ${url || "(sem url)"}: ${e instanceof Error ? e.message : String(e)}`;
      }
      islandNotify({ text: `${nome} \u21e2 ${rotulo(pedinteId)}`, tone: "ok" });
      rememberSent(pedinteId, texto);
      await forwardOutput(pedinteId, texto).catch(() => {
        islandNotify({ text: `${nome}: resposta não entregue`, tone: "bad" });
      });
    };
    filaLeitura.current = filaLeitura.current.then(entrega, entrega);
  }, [rememberSent]);

  const handleIdle = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const d = node.data as AgentNodeData;
    // `readNewLines` AVANÇA o offset de leitura, então só pode ser chamado quando
    // as linhas vão ser processadas de fato. Antes ele rodava aqui no topo e
    // qualquer estágio abaixo que desse `return` descartava a rajada inteira —
    // rota emitida junto com a semeadura sumia sem deixar rastro.
    // Shell ficou quieto depois de um comando delegado: a saída volta pra quem
    // pediu. Cauda e não cabeça — o que importa numa saída de comando é o final
    // (falha, resumo, prompt de volta).
    const espera = esperaShell.current.get(id);
    if (espera) {
      const lines = readNewLines(id);
      esperaShell.current.delete(id);
      const saida = lines.map((l) => l.text).join("\n").trim();
      const corte = trunca(saida || "(sem saída)", MAX_SAIDA_SHELL, "fim");
      const texto = `(de ${d.label}) \`${espera.comando}\`\n${corte.texto}`
        + (corte.cortado ? `\n\n(…só o final: ${kb(MAX_SAIDA_SHELL)} de ${kb(corte.bytes)})` : "");
      flashEdge(espera.pedinte, id);
      islandNotify({ text: `${d.label} ⇢ ${(nodesRef.current.find((n) => n.id === espera.pedinte)?.data as { label?: string } | undefined)?.label ?? espera.pedinte}`, tone: "ok" });
      rememberSent(espera.pedinte, texto);
      void forwardOutput(espera.pedinte, texto).catch(() => {});
      return;
    }
    if (isLLM(d.cmd)) {
      // 1º idle: protocolo ⇢NOME:. 2º idle: contextos. Em submissões separadas —
      // dois bracketed-paste juntos se atropelam no prompt do claude.
      if (!seededRef.current.has(id)) {
        seededRef.current.add(id);
        const p = seedPrompt(d.label, vizinhosDe(id));
        rememberSent(id, p); // o prompt cita ⇢NOME: — não deixa o eco rotear
        void forwardOutput(id, p).catch(() => {});
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
        const notas = edgesRef.current
          .filter((e) => e.target === id)
          .map((e) => nodesRef.current.find((n) => n.id === e.source))
          .filter((n) => n?.type === "note")
          .map((n) => ({ modo: (n!.data as NoteNodeData).modo, texto: noteText.get(n!.id) ?? "" }));
        const t = enquadraNotas(notas);
        // Só marca como semeado quando HAVIA texto: quem liga a nota vazia e
        // escreve depois pega no próximo idle. Antes o estágio queimava aqui e a
        // nota nunca chegava sozinha.
        if (t) {
          noteSeededRef.current.add(id);
          rememberSent(id, t);
          void forwardOutput(id, t).catch(() => {});
          return;
        }
      }
    }
    // agendamento armado e o agente está ocioso: agora é hora
    if (schedPendRef.current.has(id)) {
      schedPendRef.current.delete(id);
      const spec = schedSpecRef.current.get(id);
      if (spec) {
        rememberSent(id, spec.text);
        void forwardOutput(id, spec.text).catch(() => {});
        return;
      }
    }
    const targets = edgesRef.current.filter((e) => e.source === id).map((e) => e.target);
    // Sem aresta o laço roda igual, só não entrega nada: ele existe pra AVISAR.
    // Antes havia um `if (!targets.length) return` aqui e era o buraco mais
    // silencioso do app — agente sem conexão (ou com a aresta desenhada ao
    // contrário) escrevia a rota, cumpria o protocolo e não recebia nem o
    // "⇢X não existe aqui". O offset avança no readNewLines abaixo, como antes:
    // guardar o backlog faria a rota antiga disparar quando a aresta nascesse.
    const rows = readRouteLines(id);
    const lines = rows.map((r) => r.text);
    let feitas = rowsRoteadasRef.current.get(id);
    if (!feitas) rowsRoteadasRef.current.set(id, (feitas = new Set()));
    for (let i = 0; i < lines.length; i++) {
      const m = rotaDaLinha(lines[i], enderecoExiste);
      if (!m) continue;
      const [, dest] = m;
      let msg = m[2];
      // já despachada numa varredura anterior desta mesma linha física
      // (a tela é re-lida todo idle — ver readRouteLines)
      const chave = `${rows[i].idx}::${lines[i]}`;
      if (feitas.has(chave)) continue;
      feitas.add(chave);
      // eco do que nós mesmos semeamos/encaminhamos: dentro da janela, não roteia
      const eco = sentRef.current.get(id);
      const ate = eco?.get(rotaKey(dest, msg));
      if (ate !== undefined) {
        if (ate > Date.now()) continue;
        eco!.delete(rotaKey(dest, msg)); // janela venceu: limpa e deixa passar
      }
      if (dest.toLowerCase() === "nota") {
        // nota também aceita bloco multilinha: agente escrevendo relatório numa
        // nota mandava só a primeira linha e o resto virava texto solto no
        // terminal. Mesmo corte do diagrama — para em linha vazia ou próxima rota.
        const bloco = blocoDaRota(lines, i, enderecoExiste);
        msg = bloco.msg;
        i = bloco.fim;
        const notas = targets.filter((t) => nodesRef.current.find((n) => n.id === t)?.type === "note");
        // `nota` era o único destino que sumia calado: o resto do laço cai no
        // "⇢X não existe aqui", mas aqui o forEach simplesmente não achava nota
        // e seguia. Caso real: "pedi pro claude anotar um oi, ele disse que
        // anotou e nada apareceu" — o agente tinha escrito a linha certa, só não
        // havia nota conectada NAQUELA direção (a aresta é dirigida: precisa ser
        // agente → nota).
        if (!notas.length) {
          islandNotify({ text: `${d.label}: ⇢nota sem nota conectada (a aresta vai do agente PRA nota)`, tone: "bad" });
          continue;
        }
        notas.forEach((t) => {
          flashEdge(id, t);
          // texto puro, sem "(claude-1)": a nota é conteúdo que o usuário lê e
          // reaproveita, não log de quem falou — quem quiser assinar, assina no
          // próprio texto. Quem falou já aparece na island e no flash da aresta.
          window.dispatchEvent(new CustomEvent("note-write", { detail: { id: t, text: msg } }));
        });
        continue;
      }
      // sem caixa: o guarda de renomear reserva "todos" case-insensitive, então
      // ⇢TODOS: batia no nome de ninguém e sumia calado
      const wanted =
        dest.toLowerCase() === "todos"
          ? targets
          : targets.filter((t) => (nodesRef.current.find((n) => n.id === t)?.data as { label?: string } | undefined)?.label === dest);
      // Mermaid é multilinha e o ⇢ só cabe na primeira: quando o destino é um
      // diagrama, o resto do bloco vem junto (ver protocolo.ts).
      // Rota bem formada apontando pra nome que ninguém atende sumia calada — foi
      // exatamente isso que fez "o claude disse que delegou e nada chegou" virar
      // um mistério. Agora a island diz.
      if (!wanted.length) {
        islandNotify({ text: `${d.label}: ⇢${dest} não existe aqui`, tone: "bad" });
        continue;
      }
      if (wanted.some((t) => nodesRef.current.find((n) => n.id === t)?.type === "mermaid")) {
        const bloco = blocoDaRota(lines, i, enderecoExiste);
        msg = bloco.msg;
        i = bloco.fim;
      }
      wanted.forEach((t) => {
        const tn = nodesRef.current.find((n) => n.id === t);
        if (!tn) return;
        flashEdge(id, t);
        // diagrama não tem PTY: a mensagem é o código mermaid e SUBSTITUI o
        // desenho (dois diagramas concatenados não compilam)
        if (tn.type === "mermaid") {
          window.dispatchEvent(new CustomEvent("diagram-write", { detail: { id: t, src: msg } }));
          return;
        }
        // portal não tem PTY: a mensagem é uma URL (navega) ou o verbo `ler`
        if (tn.type === "portal") {
          const cmd = comandoPortal(msg);
          const nova = cmd.url ? normalizaUrl(cmd.url) : null;
          if (nova) setPortalUrl(t, nova);
          if (cmd.ler) {
            // SEGURANÇA: shell não recebe resposta. Este laço roda pra TODO nó de
            // agente (o isLLM lá em cima só protege a semeadura), e colar uma
            // página num prompt de bash é execução de comando.
            if (isLLM(d.cmd)) lerPortal(t, id, nova ?? (tn.data as PortalNodeData).url);
            else islandNotify({ text: `${d.label}: shell não lê página`, tone: "bad" });
          }
          return;
        }
        // Shell recebe o texto CRU: o prefixo "(de X)" viraria comando inválido.
        const isShell = tn.type === "agent" && (tn.data as AgentNodeData).cmd.kind === "shell";
        // shell não fala ⇢, então é o app que devolve a saída pra quem pediu
        if (isShell && isLLM(d.cmd)) esperaShell.current.set(t, { pedinte: id, comando: msg });
        rememberSent(t, msg);
        void forwardOutput(t, isShell ? msg : `(de ${d.label}) ${msg}`).catch(() => {});
      });
    }
  }, [readNewLines, readRouteLines, flashEdge, rememberSent, seedContextFiles, lerPortal, enderecoExiste]);

  const sendFrom = useCallback((sourceId: string) => {
    const targets = edgesRef.current.filter((e) => e.source === sourceId).map((e) => e.target);
    if (!targets.length) return;
    const src = nodesRef.current.find((n) => n.id === sourceId);
    const term = terminals.get(sourceId);
    const bruto = (term?.getSelection() || noteText.get(sourceId) || "").trim();
    if (!bruto) return;
    // nota vai enquadrada (o agente precisa saber se é spec ou referência);
    // seleção de terminal vai crua — é o trecho que o usuário escolheu a dedo
    const text = src?.type === "note" ? enquadraNota((src.data as NoteNodeData).modo, bruto) : bruto;
    if (!text) return;
    targets.forEach((t) => {
      // só nó com PTY recebe colagem: nota/diagrama/portal não têm, e o erro do
      // Rust ("agente não encontrado") era engolido pelo catch
      if (nodesRef.current.find((n) => n.id === t)?.type !== "agent") return;
      flashEdge(sourceId, t);
      rememberSent(t, text);
      void forwardOutput(t, text).catch(() => {});
    });
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
    const isClaude = (n?: Node) => n?.type === "agent" && isLLM((n.data as AgentNodeData).cmd);
    if (isClaude(node)) void forwardOutput(id, `(sistema) seu rótulo agora é "${label}" (era "${antes}").`).catch(() => {});
    for (const e of edgesRef.current.filter((e) => e.target === id)) {
      if (isClaude(nodesRef.current.find((n) => n.id === e.source)))
        void forwardOutput(e.source, `(sistema) o nó "${antes}" agora se chama "${label}" — use ⇢${label}: daqui pra frente.`).catch(() => {});
    }
  }, [dirty]);

  // liga o intervalo e registra o spec (o spec vai pro workspace no autosave)
  const startSchedule = useCallback((id: string, secs: number, text: string) => {
    // O relógio só ARMA; quem dispara é o idle do agente (ver handleIdle). Antes
    // era setInterval cego: colava o prompt no meio do trabalho, atropelando o
    // que o agente estava escrevendo e às vezes empilhando duas colagens.
    const t = window.setInterval(() => { schedPendRef.current.add(id); }, secs * 1000);
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
      schedPendRef.current.delete(id);
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
  const setNoteModo = (id: string, modo: ModoNota) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, modo } } : n)));
    dirty();
  };
  const noteData = (modo: ModoNota = MODO_PADRAO): NoteNodeData => ({
    modo, onKill: killNode, onSend: sendFrom, onModo: setNoteModo, onDirty: dirty,
  });
  const addNote = (pos?: XYPosition) => {
    const id = `note-${++seq}`;
    setNodes((ns) => [...ns, { id, type: "note", position: pos ?? { x: 60, y: 60 + ns.length * 40 }, width: 280, height: 180, data: noteData() }]);
    dirty();
  };
  const mermaidData = (label: string): MermaidNodeData =>
    ({ label, onKill: killNode, onSend: sendFrom, onEdit: setMmdTarget, onDirty: dirty });
  const addMermaid = (pos?: XYPosition) => {
    const id = `mermaid-${++seq}`;
    noteText.set(id, MMD_EXEMPLO);
    setNodes((ns) => [...ns, { id, type: "mermaid", position: pos ?? { x: 120 + ns.length * 24, y: 120 + ns.length * 24 }, width: 360, height: 240, data: mermaidData(nextLabel("diagrama")) }]);
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
          case "note": return { ...base, data: { text: noteText.get(n.id) ?? "", modo: (d as { modo?: string }).modo ?? MODO_PADRAO } };
          case "mermaid": return { ...base, data: { label: d.label ?? "", src: noteText.get(n.id) ?? "" } };
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
    schedPendRef.current.clear();
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
              return { ...base, data: noteData(modoValido(d.modo)) };
            case "mermaid":
              noteText.set(cn.id, String(d.src ?? ""));
              return { ...base, data: mermaidData(String(d.label ?? cn.id)) };
            // workspace salvo antes do mermaid: a caixa com rótulo vira um
            // diagrama de um nó só, pra ninguém perder o desenho antigo
            case "shape":
              noteText.set(cn.id, `flowchart LR\n  n["${String(d.label ?? "forma").replace(/"/g, "'")}"]`);
              return { ...base, type: "mermaid", width: Math.max(cn.w ?? 0, 300), height: Math.max(cn.h ?? 0, 180), data: mermaidData(`diagrama-${cn.id}`) };
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

  // ── workspaces ──────────────────────────────────────────────────
  // O gerenciamento todo vive num menu ancorado na Island (era uma sidebar
  // fixa comendo 236px do canvas): trocar, abrir pasta, renomear, remover.
  const wsMenu = (x: number, y: number) => {
    const ativo = workspaces.find((w) => w.id === wsId);
    const items: MenuItem[] = workspaces.map((w) => ({
      label: `${w.id === wsId ? "✓ " : ""}${folderName(w)}`,
      icon: w.id === wsId ? icons.folderOpen : icons.folder,
      onClick: () => { if (w.id !== wsId) void openWs(w.id); },
    }));
    if (items.length) items.push({ sep: true });
    items.push({ label: "Abrir pasta…", icon: icons.folderPlus, onClick: () => void newWorkspaceFromFolder() });
    if (ativo) {
      items.push(
        { sep: true },
        { label: "Abrir no editor", icon: icons.code, onClick: () => { void openEditor(ativo.repoPath).catch((err) => alertMsg("Erro ao abrir editor", String(err))); } },
        { label: "Renomear…", icon: icons.edit, onClick: () => void renameWs(ativo) },
        { label: "Remover", danger: true, icon: icons.trash, onClick: () => void removeWs(ativo) },
      );
    }
    setMenu({ x, y, items, daIsland: true });
  };

  const trocaTema = () => {
    const t: Tema = tema === "escuro" ? "claro" : "escuro";
    setTema(t);
    aplicaTema(t);
  };

  // ── menus de contexto (click direito) ───────────────────────────

  const paneContext = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    const pos = rfRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };
    setMenu({ x: e.clientX, y: e.clientY, items: [
      { label: "Terminal shell", icon: icons.shell, onClick: () => addAgent({ kind: "shell", program: null }, "shell", pos) },
      ...CLIS.map((c) => ({ label: `Agente ${c.label}`, icon: c.icon, onClick: () => addAgent(c.mk(), c.label, pos) })),
      { label: "Bloco de contexto", icon: icons.note, onClick: () => addNote(pos) },
      { sep: true },
      { label: "Diagrama (mermaid)", icon: icons.diagrama, onClick: () => addMermaid(pos) },
      { label: "Portal (navegador)", icon: icons.portal, onClick: () => addPortal(pos) },
    ] });
  };

  const nodeContext = (e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    const items: MenuItem[] = [];
    if (node.type === "agent") {
      // papel e contexto são PROSA: num shell cada linha do markdown viraria
      // comando (com `>` truncando arquivo). Só oferece pra agentes LLM.
      if (isLLM((node.data as AgentNodeData).cmd)) {
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
      ...CLIS.map((c) => ({ id: `n-${c.label}`, group: "criar", label: `Agente ${c.label}`, hint: c.hint, icon: c.icon, run: () => addAgent(c.mk(), c.label, centerPos()) })),
      { id: "n-note", group: "criar", label: "Bloco de contexto", icon: icons.note, run: () => addNote(centerPos()) },
      { id: "n-mermaid", group: "criar", label: "Diagrama (mermaid)", icon: icons.diagrama, run: () => addMermaid(centerPos()) },
      { id: "n-portal", group: "criar", label: "Portal (navegador)", icon: icons.portal, run: () => addPortal(centerPos()) },
      { id: "a-ctx", group: "contextos", label: "Gerenciar contextos", icon: icons.context, run: () => setCtxTarget(null) },
      { id: "a-save", group: "workspace", label: "Salvar workspace", icon: icons.save, run: () => void doSave() },
      { id: "a-folder", group: "workspace", label: "Abrir pasta…", icon: icons.folder, run: () => void newWorkspaceFromFolder() },
      { id: "a-editor", group: "workspace", label: "Abrir no editor", icon: icons.code, run: () => void openEditor(activeCwd).catch((e) => alertMsg("Erro ao abrir editor", String(e))) },
      { id: "f-new", group: "floors", label: "Novo floor…", icon: icons.layers, run: () => void addFloor() },
      // sem isto o tour só existe no primeiro uso: quem já fechou uma vez
      // (localStorage) nunca mais vê, justo quem está perdido
      { id: "a-ajuda", group: "ajuda", label: "Como usar o orquestra", hint: "boas-vindas", icon: icons.batuta, run: () => setWelcome(true) },
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
      if (n.type === "agent" && isLLM((n.data as AgentNodeData).cmd))
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
      <main className="main">
        <Island
          pinned={!!menu?.daIsland}
          pill={
            <span className="island-id island-pill" title={cwd}>
              <span className="island-brand">or<span className="brand-q">q</span></span>
              <span className="island-ws">{activeName}</span>
              {nodes.filter((n) => n.type === "agent").length > 0 && (() => {
                const vivos = nodes.filter((n) => n.type === "agent" && !(n.data as AgentNodeData).exited).length;
                return <span className="island-count" title={`${vivos} ${vivos === 1 ? "agente vivo" : "agentes vivos"}`}>{vivos}</span>;
              })()}
            </span>
          }
        >
          <span className="island-id">
            <span className="island-brand">or<span className="brand-q">q</span></span>
          </span>
          <button
            className="ib-ws"
            title={cwd ? `${cwd} — trocar workspace` : "Abrir uma pasta de projeto"}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              wsMenu(r.left, r.bottom + 8);
            }}
          >
            <span className="island-ws">{activeName}</span>
            {icons.caret}
          </button>
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
              setMenu({ x: r.left, y: r.bottom + 8, items, daIsland: true });
            }}
          >
            {icons.layers}
          </button>
          <span className="island-sep" />
          <button className="ib" onClick={() => addAgent({ kind: "shell", program: null }, "shell")} title="Terminal shell">{icons.shell}</button>
          <button
            className="ib ib-accent"
            title={`Agentes (${CLIS.map((c) => c.label).join(", ")})`}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 8, daIsland: true, items: CLIS.map((c) => ({
                label: `Agente ${c.label}`, icon: c.icon, onClick: () => addAgent(c.mk(), c.label),
              })) });
            }}
          >
            {icons.robo}
          </button>
          <button className="ib" onClick={() => addNote()} title="Bloco de contexto">{icons.note}</button>
          <button className="ib" onClick={() => addMermaid()} title="Diagrama (mermaid)">{icons.diagrama}</button>
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
          <button className="ib" onClick={trocaTema} title={tema === "escuro" ? "Tema claro" : "Tema escuro"}>
            {tema === "escuro" ? icons.sol : icons.lua}
          </button>
        </Island>
        <div className="canvas" onWheel={onCanvasWheel}>
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
            /* a aresta é DIRIGIDA (só source→target roteia) e sem ponta ninguém
               vê isso: ligação desenhada ao contrário virava mistério */
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } }}
            minZoom={0.2}
            maxZoom={2}
            /* roda/touchpad tratados no onWheel do .canvas: vertical = zoom
               ancorado no cursor, horizontal = pan lateral. Pinch continua. */
            zoomOnScroll={false}
            panOnScroll={false}
            zoomOnPinch
            /* trava = só navegar: pan e zoom seguem valendo, o que congela é
               mexer no grafo (arrastar, ligar, selecionar) */
            nodesDraggable={!travado}
            nodesConnectable={!travado}
            elementsSelectable={!travado}
          >
            <Background gap={26} size={1.4} color={tema === "claro" ? "#d9d9e0" : "#1b1b20"} />
            {/* Island pinga do topo no centro → controles ficam no canto de baixo */}
            <Controles travado={travado} onTravar={() => setTravado((t) => !t)} />
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
      {mmdTarget && (
        <MermaidEditor
          src={noteText.get(mmdTarget) ?? ""}
          onClose={() => setMmdTarget(null)}
          onSave={(src) => {
            noteText.set(mmdTarget, src);
            window.dispatchEvent(new CustomEvent("diagram-saved", { detail: { id: mmdTarget } }));
            setMmdTarget(null);
            dirty();
          }}
        />
      )}
      {batuta && <Batuta items={batutaItems()} onClose={() => setBatuta(false)} />}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {welcome && <Welcome onClose={() => setWelcome(false)} />}
      <DialogHost />
    </div>
  );
}
