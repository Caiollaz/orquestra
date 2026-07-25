# orquestra

Orquestrador de agentes desktop: um canvas infinito onde cada nó é um **terminal
PTY interativo** rodando `claude` ou um shell — e os agentes conversam entre si.

## Features

- **Canvas multi-agente** — terminais arrastáveis, zoom/pan, cada nó com a cor do
  seu naipe. Click direito cria nós onde o cursor está.
- **Agentes que conversam** — conecte nós com arestas; um claude delega comandos
  pro shell conectado (`⇢shell-1: comando`), fala com outros claudes e escreve em
  notas (`⇢nota: texto`). O cabo acende quando dado flui.
- **Workspaces** — cada projeto é uma pasta; sidebar pra trocar num clique.
  Layout completo (nós, arestas, notas, agendamentos, viewport) salvo
  automaticamente em `~/.orquestra/` e restaurado ao voltar.
- **Papéis** — instruções reutilizáveis em `<repo>/.orquestra/roles/*.md`
  (frontmatter + corpo com `{{var}}`), aplicáveis a qualquer agente.
- **Floors** — `git worktree` por feature: agentes trabalham em branches isoladas
  sem tocar na raiz.
- **Portais** — navegador embutido no canvas; o claude conectado navega via
  `⇢portal-1: url`. Sites que bloqueiam embed abrem em janela nativa.
- **Prompts agendados** — rode um prompt num agente a cada N segundos
  (testes em loop, status de deploy…). Persistem com o workspace.
- **Diagramas** — formas + setas pra desenhar arquitetura ao lado dos agentes.
- **Abrir no editor** — um clique pro VS Code/Cursor/Zed/Sublime.

## Instalar

Baixe na [página de releases](https://github.com/Caiollaz/orquestra/releases/latest):
Linux (`.deb`/`.rpm`/`.AppImage`), Windows (`.exe`/`.msi`) e macOS (`.dmg`).

> **Antes de rodar:** o Orquestra executa o CLI `claude` (não o app de desktop).
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

Arquitetura, modelo de dados e decisões: [PLAN.md](PLAN.md) e [CLAUDE.md](CLAUDE.md).
Mapa de features/estado: [FEATURES.md](FEATURES.md).

Releases: tag `v*` → GitHub Actions builda Linux/Windows/macOS e anexa os
instaladores à release.
