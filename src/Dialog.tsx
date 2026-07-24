import { useEffect, useRef, useState } from "react";

// Diálogos custom (substituem window.prompt/confirm/alert nativos, que ignoram o tema).
// API imperativa promise-based: askText / askConfirm / alertMsg.

export type Field = { label: string; default?: string; placeholder?: string; type?: "text" | "number" };

type Req =
  | { kind: "text"; title: string; fields: Field[]; resolve: (v: string[] | null) => void }
  | { kind: "confirm"; title: string; message: string; danger: boolean; okLabel: string; cancel: boolean; resolve: (v: boolean) => void };

let push: ((r: Req) => void) | null = null;

export const askText = (title: string, fields: Field[]) =>
  new Promise<string[] | null>((resolve) => push?.({ kind: "text", title, fields, resolve }));
export const askConfirm = (title: string, message: string, danger = false) =>
  new Promise<boolean>((resolve) => push?.({ kind: "confirm", title, message, danger, okLabel: "confirmar", cancel: true, resolve }));
export const alertMsg = (title: string, message: string) =>
  new Promise<boolean>((resolve) => push?.({ kind: "confirm", title, message, danger: false, okLabel: "ok", cancel: false, resolve }));

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [vals, setVals] = useState<string[]>([]);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { push = setReq; return () => { push = null; }; }, []);
  useEffect(() => {
    if (req?.kind === "text") setVals(req.fields.map((f) => f.default ?? ""));
  }, [req]);
  useEffect(() => { firstRef.current?.focus(); firstRef.current?.select(); }, [req]);

  if (!req) return null;

  const close = (result: string[] | null | boolean) => {
    (req.resolve as (v: string[] | null | boolean) => void)(result);
    setReq(null);
  };

  if (req.kind === "confirm") {
    return (
      <div className="modal-backdrop" onMouseDown={() => close(false)}>
        <div className="modal dialog" onMouseDown={(e) => e.stopPropagation()}>
          <div className="dialog-title">{req.title}</div>
          <div className="dialog-msg">{req.message}</div>
          <div className="dialog-actions">
            {req.cancel && <button onClick={() => close(false)}>cancelar</button>}
            <button className={req.danger ? "btn-danger" : "btn-claude"} autoFocus onClick={() => close(true)}>{req.okLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => close(null)}>
      <form
        className="modal dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); close(vals); }}
      >
        <div className="dialog-title">{req.title}</div>
        {req.fields.map((f, i) => (
          <label className="dialog-field" key={i}>
            <span>{f.label}</span>
            <input
              ref={i === 0 ? firstRef : undefined}
              type={f.type === "number" ? "number" : "text"}
              placeholder={f.placeholder}
              value={vals[i] ?? ""}
              onChange={(e) => setVals((vs) => vs.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </label>
        ))}
        <div className="dialog-actions">
          <button type="button" onClick={() => close(null)}>cancelar</button>
          <button type="submit" className="btn-claude">ok</button>
        </div>
      </form>
    </div>
  );
}
