import { useEffect, useMemo, useState } from "react";
import { listContexts, saveContext, deleteContext, type Context } from "./lib/tauri";
import { askConfirm } from "./Dialog";

// Modal de contextos: lista os .md de <repo>/.orquestra/contexts, permite marcar
// vários e semear de uma vez num agente (apply_contexts = uma submissão só).
//
// A estrela marca o contexto como **padrão do workspace**: todo agente claude
// novo recebe os padrões assim que sobe, sem o usuário fazer nada. É o que dá o
// fluxo contínuo — agente novo já nasce sabendo as regras de negócio.
export function ContextPicker({ repoPath, targetLabel, defaults, onApply, onDefaults, onClose }: {
  repoPath: string;
  targetLabel?: string; // rótulo do agente destino (ausente = só gerenciar)
  defaults: string[];
  onApply: (contexts: Context[]) => void;
  onDefaults: (files: string[]) => void;
  onClose: () => void;
}) {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const refresh = () => { listContexts(repoPath).then(setContexts).catch((e) => setErr(String(e))); };
  useEffect(refresh, [repoPath]);
  // sem seleção manual, marca os padrões: o caso comum é "manda os de sempre"
  useEffect(() => { setMarked(new Set(defaults)); }, [repoPath]);

  const selected = useMemo(
    () => contexts.filter((c) => marked.has(c.file)),
    [contexts, marked],
  );

  const toggle = (file: string) =>
    setMarked((s) => {
      const n = new Set(s);
      if (!n.delete(file)) n.add(file);
      return n;
    });

  const toggleDefault = (file: string) =>
    onDefaults(defaults.includes(file) ? defaults.filter((f) => f !== file) : [...defaults, file]);

  const create = async () => {
    const file = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;
    if (file === ".md") { setErr("dê um nome ao contexto"); return; }
    if (!body.trim()) { setErr("o contexto está vazio"); return; }
    // salvar é fs::write: nome repetido sobrescreveria o .md existente calado
    if (contexts.some((c) => c.file === file)) { setErr(`já existe um contexto em ${file}`); return; }
    try {
      await saveContext(repoPath, { file, name: name.trim(), description: "", body: body.trim() });
      setCreating(false); setName(""); setBody(""); setErr(""); refresh();
    } catch (e) { setErr(String(e)); }
  };

  // apagar é irreversível e o .md é conteúdo autoral versionado — confirma
  const drop = async (file: string) => {
    if (!(await askConfirm("Excluir contexto", `Apagar ${file} do disco? Não tem desfazer.`, true))) return;
    try {
      await deleteContext(repoPath, file);
      if (defaults.includes(file)) onDefaults(defaults.filter((f) => f !== file));
      refresh();
    } catch (e) { setErr(String(e)); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Contextos{targetLabel ? ` → ${targetLabel}` : ""}</b>
          <button className="agent-btn" onClick={onClose}>×</button>
        </div>
        {err && <div className="modal-err">{err}</div>}
        <div className="role-list">
          {contexts.length === 0 && !creating && (
            <div className="role-empty">
              Nenhum contexto em .orquestra/contexts ainda. Um contexto é um .md com as regras
              que todo agente precisa saber (negócio, arquitetura, contratos).
            </div>
          )}
          {contexts.map((c) => {
            const isDefault = defaults.includes(c.file);
            return (
              <label className={`role-row ctx-pick${marked.has(c.file) ? " is-marked" : ""}`} key={c.file}>
                <input
                  type="checkbox"
                  className="ctx-check"
                  checked={marked.has(c.file)}
                  onChange={() => toggle(c.file)}
                />
                <div className="role-info">
                  <b>{c.name}</b>
                  <span title={c.description}>{c.description || c.file}</span>
                </div>
                <span className="role-actions">
                  <button
                    className={`agent-btn${isDefault ? " is-on" : ""}`}
                    title={isDefault ? "Padrão do workspace (clique pra tirar)" : "Marcar como padrão de agentes novos"}
                    onClick={(e) => { e.preventDefault(); toggleDefault(c.file); }}
                  >
                    {isDefault ? "★" : "☆"}
                  </button>
                  <button
                    className="agent-btn"
                    title="Excluir contexto"
                    onClick={(e) => { e.preventDefault(); void drop(c.file); }}
                  >
                    ×
                  </button>
                </span>
              </label>
            );
          })}
        </div>

        {creating ? (
          <div className="role-form">
            <input placeholder="nome (ex: Regras de negócio)" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea
              placeholder="as regras, contratos, arquitetura… (aceita {{var}})"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
            />
            <div className="role-form-actions">
              <button onClick={() => setCreating(false)}>cancelar</button>
              <button className="btn-claude" onClick={create}>salvar</button>
            </div>
          </div>
        ) : (
          <div className="ctx-foot">
            <button className="role-new" onClick={() => setCreating(true)}>+ novo contexto</button>
            {targetLabel && (
              <button
                className="btn-claude"
                disabled={!selected.length}
                onClick={() => { onApply(selected); onClose(); }}
              >
                semear {selected.length || ""} em {targetLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
