import { useEffect, useState } from "react";
import { listRoles, saveRole, deleteRole, type Role } from "./lib/tauri";
import { ROLE_PRESETS } from "./role-presets";

// Modal de papéis: lista os .md de <repo>/.orquestra/roles, aplica um a um agente,
// e tem um form curto pra criar papel novo. Aplicar → apply_role semeia o corpo
// (bracketed-paste) no stdin do agente.
export function RolePicker({ repoPath, onApply, onClose }: {
  repoPath: string;
  onApply: (role: Role) => void;
  onClose: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [body, setBody] = useState("");

  const refresh = () => { listRoles(repoPath).then(setRoles).catch((e) => setErr(String(e))); };
  useEffect(refresh, [repoPath]);

  const create = async () => {
    const file = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
    if (file === ".md") { setErr("dê um nome ao papel"); return; }
    try {
      await saveRole(repoPath, { file, name: name.trim(), agent: "claude", description: desc.trim(), body: body.trim() });
      setCreating(false); setName(""); setDesc(""); setBody(""); refresh();
    } catch (e) { setErr(String(e)); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Papéis</b><button className="agent-btn" onClick={onClose}>×</button></div>
        {err && <div className="modal-err">{err}</div>}
        <div className="role-list">
          {roles.map((r) => (
            <div className="role-row" key={r.file}>
              <div className="role-info">
                <b>{r.name}</b>
                <span>{r.description}</span>
              </div>
              <span className="role-actions">
                <button className="btn-claude" onClick={() => { onApply(r); onClose(); }}>aplicar</button>
                <button className="agent-btn" title="Excluir" onClick={() => deleteRole(repoPath, r.file).then(refresh).catch((e) => setErr(String(e)))}>×</button>
              </span>
            </div>
          ))}
          {/* presets prontos: um clique salva no repo e aplica */}
          {ROLE_PRESETS.filter((p) => !roles.some((r) => r.file === p.file)).length > 0 && (
            <div className="role-presets-title">sugeridos</div>
          )}
          {ROLE_PRESETS.filter((p) => !roles.some((r) => r.file === p.file)).map((p) => (
            <div className="role-row is-preset" key={p.file}>
              <div className="role-info">
                <b>{p.name}</b>
                <span>{p.description}</span>
              </div>
              <span className="role-actions">
                <button
                  className="btn-claude"
                  onClick={async () => {
                    try { await saveRole(repoPath, p); } catch (e) { setErr(String(e)); return; }
                    onApply(p); onClose();
                  }}
                >
                  usar
                </button>
              </span>
            </div>
          ))}
        </div>
        {creating ? (
          <div className="role-form">
            <input placeholder="nome (ex: Bug Whisperer)" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="descrição curta" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <textarea placeholder="instruções do papel (aceita {{var}})" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
            <div className="role-form-actions">
              <button onClick={() => setCreating(false)}>cancelar</button>
              <button className="btn-claude" onClick={create}>salvar</button>
            </div>
          </div>
        ) : (
          <button className="role-new" onClick={() => setCreating(true)}>+ novo papel</button>
        )}
      </div>
    </div>
  );
}
