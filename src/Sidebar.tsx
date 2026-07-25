import type { WorkspaceMeta } from "./lib/tauri";
import { Icone } from "./Icone";

// seta-com-parede (⇤/⇥): a lib não tem — desenho próprio, vira pela prop
const SetaParede = ({ dir }: { dir: "esq" | "dir" }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    style={dir === "dir" ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M5 4v16" />
    <path d="M19 12H9M13 8l-4 4 4 4" />
  </svg>
);

// nome de exibição: o nome salvo, ou o basename da pasta (sem path completo)
export const folderName = (ws: { name?: string; repoPath: string }) =>
  ws.name?.trim() || ws.repoPath.replace(/[\/\\]+$/, "").split(/[\/\\]/).pop() || ws.repoPath;

export function Sidebar({ workspaces, activeId, collapsed, onOpen, onAddFolder, onContext, onToggle }: {
  workspaces: WorkspaceMeta[];
  activeId: string;
  collapsed: boolean;
  onOpen: (id: string) => void;
  onAddFolder: () => void;
  onContext: (e: React.MouseEvent, ws: WorkspaceMeta) => void;
  onToggle: () => void;
}) {
  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sb-head">
        {!collapsed && <span className="sb-title">workspaces</span>}
        <button className="sb-toggle" title={collapsed ? "Expandir (workspaces)" : "Recolher"} onClick={onToggle}>
          <SetaParede dir={collapsed ? "dir" : "esq"} />
        </button>
      </div>
      <div className="sb-list">
        {workspaces.map((ws) => {
          const name = folderName(ws);
          const active = ws.id === activeId;
          return (
            <button
              key={ws.id}
              className={`sb-item${active ? " is-active" : ""}`}
              title={ws.repoPath}
              onClick={() => onOpen(ws.id)}
              onContextMenu={(e) => onContext(e, ws)}
            >
              <span className="sb-badge">
                <Icone nome={active ? "pasta-aberta" : "pasta"} tamanho={16} />
              </span>
              {!collapsed && <span className="sb-name">{name}</span>}
            </button>
          );
        })}
      </div>
      <button className="sb-add" title="Abrir pasta de projeto" onClick={onAddFolder}>
        <span className="sb-badge"><Icone nome="pasta-mais" tamanho={16} /></span>
        {!collapsed && <span className="sb-name">abrir pasta</span>}
      </button>
    </aside>
  );
}
