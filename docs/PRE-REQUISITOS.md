# Pré-requisitos

Orquestra **não embute** o Claude nem nenhum agente. Cada nó abre um terminal e
executa um programa que **já precisa estar instalado na sua máquina** — por
padrão, o CLI `claude` (Claude Code). Se o programa não estiver no `PATH`, o nó
abre com erro:

```
[falha ao iniciar: CreateProcessW `"claude"` in cwd `...` failed:
O sistema não pode encontrar o arquivo especificado. (os error 2)]
```

Isso quer dizer só uma coisa: **o comando `claude` não foi encontrado**. Resolve
instalando o CLI (abaixo).

## ⚠️ App do Claude ≠ CLI `claude`

O aplicativo de desktop do Claude (a janela de chat) **não** instala o comando
`claude` no terminal. São coisas diferentes:

| O que você tem | Dá pra usar no Orquestra? |
| --- | --- |
| **Claude Code (CLI)** — comando `claude` no terminal | ✅ Sim, é isto que o Orquestra roda |
| App de desktop do Claude (janela de chat) | ❌ Não expõe o comando `claude` |
| Extensão de IDE (VS Code/Cursor) | ⚠️ Só se ela também instalou o CLI |

Teste rápido — abra um terminal e rode:

```sh
claude --version
```

Se imprimir uma versão, o Orquestra vai achar. Se der "comando não
encontrado" / "not recognized", instale o CLI abaixo.

## Instalar o Claude Code (CLI)

Escolha **um** dos métodos.

### Instalador nativo (recomendado)

```sh
# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash

# Windows (PowerShell)
irm https://claude.ai/install.ps1 | iex
```

Instala em `~/.local/bin/claude` (Unix) ou `%USERPROFILE%\.local\bin\claude.exe`
(Windows) — pastas que o Orquestra procura sozinho.

### Via npm (precisa de Node 18+)

```sh
npm install -g @anthropic-ai/claude-code
```

Vai pra `%APPDATA%\npm` (Windows) ou o prefixo global do npm (Unix) — também no
caminho que o Orquestra varre.

Detalhes e login: <https://docs.claude.com/en/docs/claude-code>.

## Onde o Orquestra procura o binário

O app não depende do `PATH` da GUI (que costuma vir capado). Ele monta um `PATH`
aumentado e procura nestas pastas, além do `PATH` do seu shell de login:

**Windows**
- `%USERPROFILE%\.local\bin` (instalador nativo)
- `%APPDATA%\npm` (npm global)
- `%USERPROFILE%\.bun\bin`, `%LOCALAPPDATA%\Microsoft\WindowsApps`

**macOS / Linux**
- `~/.local/bin`, `~/.cargo/bin`, `~/.bun/bin`, `~/.deno/bin`, `~/.volta/bin`, `~/bin`
- `~/.local/share/pnpm`, node mais novo do `nvm`
- `/usr/local/bin`, `/opt/homebrew/bin`, `/usr/bin`, `/bin`

Se seu `claude` estiver em outro lugar, adicione a pasta ao `PATH` do sistema e
reinicie o Orquestra.

## Node.js

O Claude Code roda subprocessos com Node. Instale o **Node 18+**
(<https://nodejs.org> ou via `nvm`). O Orquestra injeta a versão mais nova do
`nvm` no `PATH` dos filhos — sem isso o claude quebra com `node: not found`.

## Git (opcional, para Floors)

O recurso **Floors** usa `git worktree`. Precisa do Git no `PATH` e o projeto
tem que ser um repositório git. Sem Git, o resto do app funciona normal.

## Outros agentes (Codex, etc.)

Um nó pode rodar qualquer comando via tipo **shell** — inclusive outro CLI de
agente (ex.: `codex`). A regra é a mesma: **o binário tem que estar no `PATH`**
antes de abrir o nó. Se `codex --version` funciona no seu terminal, funciona no
Orquestra.
