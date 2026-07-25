import { useEffect, useState } from "react";
import { checkPrereqs, type Prereqs } from "./lib/tauri";

// Boas-vindas de primeiro uso: o Orquestra não embute o claude — ele roda o CLI
// que já tem que estar na máquina. Sem essa tela, o usuário só descobre isso
// quando um nó abre com "os error 2". Aqui a gente confere ao vivo e ensina.

const WIN = navigator.userAgent.includes("Windows");
const KEY = "orquestra:welcomed";

export const jaViuBoasVindas = () => localStorage.getItem(KEY) === "1";

const installClaude = WIN
  ? "irm https://claude.ai/install.ps1 | iex"
  : "curl -fsSL https://claude.ai/install.sh | bash";

function Item({ ok, name, children }: { ok: boolean | null; name: string; children: React.ReactNode }) {
  return (
    <div className="wc-item">
      <span className={`wc-dot ${ok === null ? "wc-wait" : ok ? "wc-ok" : "wc-no"}`}>
        {ok === null ? "…" : ok ? "✓" : "✕"}
      </span>
      <div className="wc-item-body">
        <b>{name}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}

export function Welcome({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<Prereqs | null>(null);

  const recheck = () => { setP(null); void checkPrereqs().then(setP); };
  useEffect(recheck, []);

  const fechar = () => { localStorage.setItem(KEY, "1"); onClose(); };

  return (
    <div className="modal-backdrop" onMouseDown={fechar}>
      <div className="modal wc" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wc-hero">
          <span className="wc-mark">or<i>q</i>uestra</span>
          <div className="dialog-title" style={{ margin: 0 }}>bem-vindo ao maestro</div>
        </div>
        <p className="dialog-msg">
          Cada nó do canvas é um terminal rodando um agente. O Orquestra <b>não
          instala</b> esses agentes — ele chama os que já estão na sua máquina.
          Confira o que ele encontrou:
        </p>

        <Item ok={p?.claude ?? null} name="claude — CLI do Claude Code (obrigatório)">
          {p?.claude
            ? "encontrado no PATH."
            : "não encontrado. O app de desktop do Claude não conta — precisa do comando de terminal."}
        </Item>
        {p && !p.claude && (
          <div className="wc-fix">
            <span>Instale e reinicie o Orquestra:</span>
            <code>{installClaude}</code>
            <span>ou via npm: <code>npm i -g @anthropic-ai/claude-code</code></span>
          </div>
        )}

        <Item ok={p?.node ?? null} name="node — Node.js 18+ (recomendado)">
          {p?.node ? "ok." : "o claude usa Node nos subprocessos. Sem ele: node: not found."}
        </Item>
        <Item ok={p?.git ?? null} name="git (opcional — só pros Floors)">
          {p?.git ? "ok." : "só precisa se for usar Floors (git worktree por feature)."}
        </Item>

        <p className="wc-note">
          Outros CLIs de agente (ex.: <code>codex</code>) rodam num nó do tipo
          shell — mesma regra: têm que estar no PATH.
        </p>

        <div className="dialog-actions">
          <button onClick={recheck}>rechecar</button>
          <button className="btn-claude" onClick={fechar}>
            {p?.claude ? "começar" : "começar mesmo assim"}
          </button>
        </div>
      </div>
    </div>
  );
}
