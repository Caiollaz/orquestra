# Contexto: Armadilhas (bugs que já custaram caro)

Cada item é um bug real que foi corrigido. Estão aqui pra não voltarem.

## Segurança / destruição de trabalho
- **Markdown virando comando.** "Semear contexto"/"Atribuir papel" apareciam em
  nó **shell**: o markdown ia como comando no cwd do repo (com `>` truncando
  arquivo). Só ofereça papel/contexto pra `isLLM(cmd)`.
- **Injeção pelo terminador do paste.** Um `\x1b[201~` no payload fecha o
  bracketed-paste e o resto vira tecla digitada no destino. `bracketed_safe`
  filtra — mantenha em qualquer caminho novo pro `forward_output_to`.
- **Contexto que dispara comando.** Bloco documentando o protocolo `⇢` é ecoado
  pelo TUI e casava a regex de rota. Ver `rememberSent` no contexto do
  protocolo.
- **`git status --porcelain` não lista ignorados**, mas o `worktree remove`
  apaga a pasta: o `.env` do floor era destruído sem aviso. Hoje usa
  `--ignored=matching -uall` e **falha fechada** se não conseguir verificar.

## Travar o app inteiro
- **Escrever no PTY segurando o mutex global.** Terminal com filho que não drena
  stdin (`sleep 300`) + payload grande travava tudo, inclusive o `kill_all` do
  fechamento → processos órfãos. O `writer` é `Arc<Mutex<_>>`: clona, solta o
  mapa, **depois** escreve. Mais o teto de `MAX_PASTE`.
- **`Mutex.lock().unwrap()` em command.** Um panic envenenava o mutex e derrubava
  **todos** os terminais. Use o helper que mapeia poison pra erro.
- **Escrita não atômica no autosave.** Grava a cada 1.2s; crash no meio de um
  `fs::write` truncava o JSON e levava o canvas inteiro. Escrita = tmp + rename.

## Silenciosos
- **`[] ?? x` é `[]`**, não `x` — nó restaurado nunca pegava os padrões do
  workspace.
- **Buscar por nome de arquivo num catálogo velho.** `seedContexts` reprocurava
  o contexto recém-criado e não achava, sem erro. Passe os objetos prontos.
- **Remontagem do nó** respawna o processo, mas `seededRef` continuava marcado →
  o agente novo não recebia protocolo nem contexto. `onSpawn` limpa o transiente.
- **Segundo diálogo com o primeiro aberto**: o `DialogHost` tem um slot só, a
  promessa do primeiro morria calada e o rename podia cair no **workspace
  errado** (ids de nó repetem entre workspaces). Atalho desligado com modal
  aberto + guarda de `wsId` em volta de todo `await askText`.
- **Rótulo `todos`/`nota`** era aceito e deixava o nó inalcançável.

## Ambiente
- **Windows**: os CLIs são shims `.cmd`/`.ps1`, o `CreateProcess` não roda —
  daí o wrap em `cmd.exe /c`. E a resolução testa as extensões do `PATHEXT`
  **antes** do nome cru: o npm instala `claude` (script bash) e `claude.cmd`
  lado a lado, e o sem extensão dá `os error 193`.
- **PATH herdado no Windows é um retrato do logon.** Instalador que mexe no
  registro (o do `agy` faz isso) não altera o processo vivo nem os filhos dele:
  o CLI existe, funciona no terminal do usuário, e o app dá `os error 2`.
  `registry_path()` lê `HKCU\Environment` e o `Environment` do
  `Session Manager` via `reg query` — é o equivalente Windows do
  `login_shell_path()`. Ao spawnar `reg`/`git`/qualquer coisa no Windows use
  `creation_flags(0x08000000)` (`CREATE_NO_WINDOW`), senão pisca console.
- **Antigravity** roda pelo binário `agy`, não `antigravity`, e o instalador
  joga em `%LOCALAPPDATA%\agy\bin` (Windows) ou `~/.local/bin` (Unix).
- **Zoom borrado no Linux**: o WebKitGTK compunha camadas na GPU sem
  re-rasterizar no `transform: scale()`. Resolvido com
  `WEBKIT_DISABLE_COMPOSITING_MODE` + renderer DOM no xterm. Não volte pro
  addon-canvas.
- **`git add -A`**: mais de um agente edita este repo ao mesmo tempo. Some por
  arquivo; o commit `7abbe2c` levou junto edição de outro agente.
