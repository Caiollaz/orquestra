import type { WorkspaceMeta } from "./lib/tauri";

// nome de exibição: o nome salvo, ou o basename da pasta (sem path completo)
export const folderName = (ws: { name?: string; repoPath: string }) =>
  ws.name?.trim() || ws.repoPath.replace(/[\/\\]+$/, "").split(/[\/\\]/).pop() || ws.repoPath;

// inicial pro "ícone" quadrado do workspace
const initial = (s: string) => (s.trim()[0] || "?").toUpperCase();

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
        <button className="sb-toggle" title={collapsed ? "Expandir" : "Recolher"} onClick={onToggle}>
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <div className="sb-list">
        {workspaces.map((ws) => {
          const name = folderName(ws);
          return (
            <button
              key={ws.id}
              className={`sb-item${ws.id === activeId ? " is-active" : ""}`}
              title={ws.repoPath}
              onClick={() => onOpen(ws.id)}
              onContextMenu={(e) => onContext(e, ws)}
            >
              <span className="sb-badge">{initial(name)}</span>
              {!collapsed && <span className="sb-name">{name}</span>}
            </button>
          );
        })}
      </div>
      <button className="sb-add" title="Abrir pasta de projeto" onClick={onAddFolder}>
        <span className="sb-badge">+</span>
        {!collapsed && <span className="sb-name">abrir pasta</span>}
      </button>
    </aside>
  );
}
