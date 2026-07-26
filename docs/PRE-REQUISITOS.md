# Pré-requisitos

Orquestra **não embute** o Claude nem nenhum agente. Cada nó abre um terminal e
executa um CLI da sua máquina — por padrão o `claude` (Claude Code); também há
nós prontos pra `codex`, `gemini`, `opencode` e `antigravity`
([abaixo](#outros-agentes-codex-gemini-opencode-antigravity)).

**Você não precisa instalar nada global.** Se o binário não estiver no `PATH`, o
Orquestra roda o pacote npm equivalente com `npx` — basta ter Node instalado
([detalhes](#atalho-sem-instalar-nada-npx)). Sem binário **e** sem `npx`, o nó
abre com erro:

```
[falha ao iniciar: CreateProcessW `"claude"` in cwd `...` failed:
O sistema não pode encontrar o arquivo especificado. (os error 2)]
```

Isso quer dizer só uma coisa: **nem o comando `claude` nem o `npx` foram
encontrados**. Resolve instalando o Node (pro atalho via npx) ou o CLI (abaixo).

## Atalho: sem instalar nada (npx)

Tendo **Node 18+** na máquina, o Orquestra se vira sozinho. Quando o binário do
agente não está no `PATH`, ele chama:

| Agente | O que o Orquestra roda |
| --- | --- |
| Claude Code | `npx -y @anthropic-ai/claude-code` |
| Codex | `npx -y @openai/codex` |
| Gemini | `npx -y @google/gemini-cli` |
| OpenCode | `npx -y opencode-ai` |

Dois detalhes honestos: a **primeira** execução de cada agente baixa o pacote
(dezenas de MB, pode levar um minuto com o nó parado), e o login/autenticação de
cada CLI continua sendo com você. O binário instalado **sempre ganha** do npx —
é mais rápido e é a versão que você escolheu.

O `agy` (Antigravity) não tem pacote npm: esse precisa estar instalado mesmo.

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
- o `Path` gravado no registro (usuário **e** máquina) — não só o que o app
  herdou ao abrir
- `%USERPROFILE%\.local\bin` (instalador nativo)
- `%APPDATA%\npm` (npm global)
- `%LOCALAPPDATA%\agy\bin` (Antigravity)
- `%USERPROFILE%\.bun\bin`, `%LOCALAPPDATA%\Microsoft\WindowsApps`

Em cada pasta ele testa as extensões do `PATHEXT` (`.cmd`, `.exe`…) **antes** do
nome sem extensão: o npm instala os dois lado a lado e o sem extensão é script
bash, que o Windows não executa (`os error 193`).

**macOS / Linux**
- `~/.local/bin`, `~/.cargo/bin`, `~/.bun/bin`, `~/.deno/bin`, `~/.volta/bin`, `~/bin`
- `~/.local/share/pnpm`, node mais novo do `nvm`
- `/usr/local/bin`, `/opt/homebrew/bin`, `/usr/bin`, `/bin`

Se seu `claude` estiver em outro lugar, adicione a pasta ao `PATH` do sistema e
reinicie o Orquestra.

## Node.js

O Claude Code roda subprocessos com Node, e é o Node que traz o `npx` do atalho
acima. Instale o **Node 18+** (<https://nodejs.org> ou via `nvm`). O Orquestra
injeta a versão mais nova do `nvm` no `PATH` dos filhos — sem isso o claude
quebra com `node: not found`.

## Git (opcional, para Floors)

O recurso **Floors** usa `git worktree`. Precisa do Git no `PATH` e o projeto
tem que ser um repositório git. Sem Git, o resto do app funciona normal.

## Outros agentes (Codex, Gemini, OpenCode, Antigravity)

Todos têm nó próprio (botão do robô na island, click direito ou Batuta) e
recebem o mesmo tratamento do claude: protocolo `⇢NOME:`, papéis e contextos.

| Agente | Binário | Sem o binário |
| --- | --- | --- |
| Codex | `codex` | `npx -y @openai/codex` |
| Gemini | `gemini` | `npx -y @google/gemini-cli` |
| OpenCode | `opencode` | `npx -y opencode-ai` |
| Antigravity | `agy` | — precisa instalar |

Se `codex --version` funciona no seu terminal, funciona no Orquestra. Qualquer
outro CLI de agente roda num nó do tipo **shell** — só não recebe o protocolo.

> **Acabou de instalar e o nó ainda dá `os error 2`?** No Windows, um programa
> aberto antes da instalação continua com o `PATH` antigo. O Orquestra lê o
> `Path` direto do registro pra contornar isso, mas se ainda falhar: feche o
> Orquestra por completo e abra de novo (não basta fechar a janela). Confirme
> antes com `where agy` num terminal **novo** — se ali não achar, o problema é
> a instalação do CLI, não o Orquestra.
