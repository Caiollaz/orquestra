# orquestra

Orquestrador de agentes desktop: um canvas infinito onde cada nó é um **terminal
PTY interativo** rodando um CLI de agente (`claude`, `codex`, `opencode`,
`antigravity`) ou um shell — e os agentes conversam entre si.

## Features

- **Canvas multi-agente** — terminais arrastáveis, zoom/pan, cada nó com a cor do
  seu naipe. Click direito cria nós onde o cursor está.
- **Vários CLIs de agente** — claude, codex, opencode e antigravity são cidadãos
  de primeira classe: todos recebem protocolo, papéis e contextos igual. Qualquer
  outro CLI roda num nó shell.
- **Agentes que conversam** — conecte nós com arestas; um agente delega comandos
  pro shell conectado (`⇢shell-1: comando`), fala com outros agentes e escreve em
  notas (`⇢nota: texto`). O cabo acende quando dado flui.
- **Workspaces** — cada projeto é uma pasta; sidebar pra trocar num clique.
  Layout completo (nós, arestas, notas, agendamentos, viewport) salvo
  automaticamente em `~/.orquestra/` e restaurado ao voltar.
- **Papéis** — *quem o agente é*: instruções reutilizáveis em
  `<repo>/.orquestra/roles/*.md` (frontmatter + corpo com `{{var}}`), um por
  agente. 8 presets prontos (Maestro, Revisor, Caçador de Bugs…) a um clique.
- **Contextos** — *o que o agente precisa saber*: blocos de regra de negócio,
  arquitetura e contratos em `<repo>/.orquestra/contexts/*.md`, empilháveis. Os
  "padrões do workspace" semeiam todo agente novo — ele já nasce sabendo as
  regras, sem copiar/colar.
- **Floors** — `git worktree` por feature: agentes trabalham em branches isoladas
  sem tocar na raiz.
- **Portais** — navegador embutido no canvas; o agente conectado navega via
  `⇢portal-1: url`. Sites que bloqueiam embed abrem em janela nativa.
- **Notas** — bloco de texto no canvas. Agente escreve com `⇢nota: texto`; nota
  conectada a um agente injeta o próprio texto nele.
- **Batuta** — paleta de comandos (`Ctrl+K`): criar nó, trocar de workspace,
  aplicar contexto e focar nó sem sair do teclado.
- **Prompts agendados** — rode um prompt num agente a cada N segundos
  (testes em loop, status de deploy…). Persistem com o workspace.
- **Diagramas** — formas + setas pra desenhar arquitetura ao lado dos agentes.
- **Abrir no editor** — um clique pro VS Code/Cursor/Zed/Sublime.

## Instalar

Baixe na [página de releases](https://github.com/Caiollaz/orquestra/releases/latest):
Linux (`.deb`/`.rpm`/`.AppImage`), Windows (`.exe`/`.msi`) e macOS (`.dmg`).

> **Antes de rodar:** o Orquestra não embute nenhum agente — ele executa o CLI
> que já está na sua máquina (o `claude` do Claude Code, não o app de desktop).
> Se um nó abre com `os error 2` / "arquivo não encontrado", falta instalar o
> CLI — veja [Pré-requisitos](docs/PRE-REQUISITOS.md).

## Desenvolvimento

Requisitos: Rust estável, Node 22+, pnpm.

```sh
pnpm install
pnpm tauri dev        # roda o app
pnpm build            # type-check + bundle do frontend
cd src-tauri && cargo test   # testes Rust
```

Estado e o que vem a seguir: [ROADMAP.md](ROADMAP.md). Arquitetura, protocolo,
contratos e receitas vivem em [`.orquestra/contexts/`](.orquestra/contexts) — são
os mesmos arquivos que o app semeia nos agentes do canvas.
[CLAUDE.md](CLAUDE.md) é o índice pra quem programa com IA aqui.

Releases: tag `v*` → GitHub Actions builda Linux/Windows/macOS e anexa os
instaladores à release.
