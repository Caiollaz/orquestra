// PTY por agente: spawn interativo (claude/shell), thread de leitura por agente
// streamando bytes crus pro xterm via Channel, e stdin/resize/kill.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

/// Um agente vivo. `writer`/`master` ficam pra stdin e resize; `child` pra matar.
///
/// `writer` é `Arc<Mutex<_>>` de propósito: escrever num PTY cujo filho não está
/// drenando stdin **bloqueia** (buffer cheio). Se esse write acontecesse com o
/// mapa de agentes travado, um único terminal parado congelava o app inteiro —
/// ninguém mais digitava, e nem o `kill_all` do fechamento passava (órfãos,
/// contra a regra 2). Agora clonamos o Arc, soltamos o mapa e só então escrevemos.
type Writer = Arc<Mutex<Box<dyn Write + Send>>>;

struct Agent {
    writer: Writer,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PtyState {
    agents: Mutex<HashMap<String, Agent>>,
}

impl PtyState {
    /// Um `panic` dentro de qualquer command envenena o mutex; com `.unwrap()`
    /// todo command seguinte entrava em panic também e o app inteiro perdia os
    /// terminais de vez. O mapa não fica logicamente inconsistente (no pior
    /// caso um write pela metade), então recuperamos o guard e seguimos.
    fn agents(&self) -> std::sync::MutexGuard<'_, HashMap<String, Agent>> {
        self.agents.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Pega o writer do agente e **solta** o mapa antes de escrever nele.
    fn writer_of(&self, agent_id: &str) -> Result<Writer, String> {
        self.agents()
            .get(agent_id)
            .map(|a| a.writer.clone())
            .ok_or(format!("agente {agent_id} não encontrado"))
    }

    /// Mata todos os agentes (chamado no fechamento do app pra não deixar órfão).
    pub fn kill_all(&self) {
        for (_, mut a) in self.agents().drain() {
            a.alive.store(false, Ordering::SeqCst);
            let _ = a.child.kill();
        }
    }
}

/// O que rodar no PTY: claude interativo, outro agente CLI (codex/opencode/
/// antigravity/…) ou um shell. `Agent` é genérico: qualquer TUI de agente que
/// entenda instruções coladas no stdin funciona com o protocolo ⇢.
#[derive(Deserialize, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AgentCmd {
    Claude { extra_args: Vec<String> },
    Agent { program: String, extra_args: Vec<String> },
    Shell { program: Option<String> },
}

/// PATH real do shell de login+interativo do usuário, resolvido UMA vez por
/// execução (OnceLock). É o que faz nvm/asdf/mise/fnm/pyenv/sdkman/brew…
/// funcionarem pra qualquer usuário sem hardcode por gerenciador — o rc dele
/// é a fonte da verdade (mesma técnica do VS Code). Timeout de 2.5s pra um
/// rc travado nunca congelar o spawn de agente.
#[cfg(not(windows))]
fn login_shell_path() -> Option<&'static str> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<String>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
            // fish: $PATH é lista (expandiria com espaços) → junta com ':'
            let print = if shell.ends_with("fish") { "string join ':' $PATH" } else { "printf '%s' \"$PATH\"" };
            let mut child = std::process::Command::new(&shell)
                .args(["-ilc", print])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .spawn()
                .ok()?;
            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(2500);
            loop {
                match child.try_wait() {
                    Ok(Some(st)) if st.success() => break,
                    Ok(Some(_)) => return None,
                    Ok(None) if std::time::Instant::now() > deadline => {
                        let _ = child.kill();
                        return None;
                    }
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
                    Err(_) => return None,
                }
            }
            let mut out = String::new();
            child.stdout.take()?.read_to_string(&mut out).ok()?;
            let out = out.trim().to_string();
            (!out.is_empty()).then_some(out)
        })
        .as_deref()
}

/// PATH persistido do usuário/máquina, lido do registro — o equivalente Windows
/// do `login_shell_path()`. Processo GUI herda o PATH de quando a sessão subiu:
/// CLI instalado depois (o instalador do agy mexe no registro, não no processo
/// vivo) fica invisível até o próximo logout. Ler o registro mata essa classe
/// inteira, não só o agy. `reg query` em vez de crate: mesma escolha do git.
#[cfg(windows)]
fn registry_path() -> Option<&'static str> {
    use std::os::windows::process::CommandExt;
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<String>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut acc: Vec<String> = Vec::new();
            for key in [
                r"HKCU\Environment",
                r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
            ] {
                let out = std::process::Command::new("reg")
                    .args(["query", key, "/v", "Path"])
                    .creation_flags(0x0800_0000) // CREATE_NO_WINDOW: sem console piscando no boot
                    .output();
                let Ok(out) = out else { continue };
                if let Some(v) = parse_reg_path(&String::from_utf8_lossy(&out.stdout)) {
                    acc.push(expand_env_vars(&v));
                }
            }
            (!acc.is_empty()).then(|| acc.join(";"))
        })
        .as_deref()
}

/// Extrai o valor de `Path` da saída do `reg query`, que vem como
/// `    Path    REG_EXPAND_SZ    C:\foo;C:\bar` (o valor contém espaços, então
/// não dá pra fatiar por token — pega o resto da linha depois do tipo).
/// Sem `cfg(windows)` de propósito: assim o parser é testável no CI/dev Linux,
/// que é onde este projeto é desenvolvido.
#[cfg_attr(not(windows), allow(dead_code))]
fn parse_reg_path(out: &str) -> Option<String> {
    for line in out.lines() {
        let mut it = line.split_whitespace();
        if !it.next().is_some_and(|k| k.eq_ignore_ascii_case("Path")) {
            continue;
        }
        let Some(ty) = it.next().filter(|t| t.starts_with("REG_")) else { continue };
        let val = line.split_once(ty)?.1.trim();
        if !val.is_empty() {
            return Some(val.to_string());
        }
    }
    None
}

/// Expande `%VAR%` — `REG_EXPAND_SZ` guarda sem expandir (`%USERPROFILE%\...`).
/// Variável inexistente fica literal: melhor um dir que não resolve do que
/// comer o resto do PATH.
#[cfg_attr(not(windows), allow(dead_code))]
fn expand_env_vars(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let Some(j) = after.find('%') else {
            out.push('%');
            rest = after;
            break;
        };
        let name = &after[..j];
        match std::env::var(name) {
            Ok(v) => out.push_str(&v),
            Err(_) => {
                out.push('%');
                out.push_str(name);
                out.push('%');
            }
        }
        rest = &after[j + 1..];
    }
    out.push_str(rest);
    out
}

/// Aquece o cache do PATH em background no boot (o 1º spawn não paga os 2.5s).
pub fn prewarm_path() {
    let _ = augmented_path();
}

/// Diz quais binários que o app roda estão no PATH aumentado. Alimenta a tela de
/// boas-vindas: `claude` é obrigatório, `node` e `git` melhoram a experiência.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prereqs {
    /// binário `claude` no PATH
    claude: bool,
    node: bool,
    git: bool,
    /// `npx` disponível: dá pra rodar claude/codex/gemini sem instalar nada
    npx: bool,
}

/// Resolvido = achou o arquivo (resolve_program devolve caminho ≠ nome cru).
fn on_path(name: &str, path: &str) -> bool {
    resolve_program(name, path) != name
}

/// CLIs de agente que também são pacote npm. Sem o binário no PATH, o app roda
/// `npx -y <pacote>` — quem tem node não precisa instalar nada global (e nunca
/// fica com uma versão velha esquecida). Nome do binário → pacote.
/// `agy` (antigravity) fica de fora: não é publicado no npm.
const PACOTE_NPM: &[(&str, &str)] = &[
    ("claude", "@anthropic-ai/claude-code"),
    ("codex", "@openai/codex"),
    ("gemini", "@google/gemini-cli"),
    ("opencode", "opencode-ai"),
];

pub(crate) fn pacote_npm(nome: &str) -> Option<&'static str> {
    PACOTE_NPM.iter().find(|(n, _)| *n == nome).map(|(_, p)| *p)
}

/// Como invocar um agente: `(programa, args que vêm antes dos do usuário)`.
///
/// Ordem de preferência — binário no PATH primeiro. Ele é mais rápido (npx
/// bate no registro a cada boot) e é a versão que o usuário escolheu instalar;
/// o npx é a rede de segurança pra quem só tem node.
pub(crate) fn invocacao(nome: &str, path: &str) -> (String, Vec<String>) {
    let prog = resolve_program(nome, path);
    if prog != nome {
        return (prog, vec![]);
    }
    // sem binário: tenta o pacote npm equivalente
    match pacote_npm(nome) {
        Some(pacote) => {
            let npx = resolve_program("npx", path);
            if npx == "npx" {
                // nem npx: devolve o nome cru e deixa o spawn falhar com o
                // erro de sempre ("os error 2") — mentir aqui só adia
                (prog, vec![])
            } else {
                (npx, vec!["-y".to_string(), pacote.to_string()])
            }
        }
        None => (prog, vec![]),
    }
}

#[tauri::command]
pub fn check_prereqs() -> Prereqs {
    let path = augmented_path();
    Prereqs {
        claude: on_path("claude", &path),
        node: on_path("node", &path),
        git: on_path("git", &path),
        npx: on_path("npx", &path),
    }
}

/// PATH do shell de login costuma ter dirs que o app GUI não herda.
/// Base: PATH herdado + PATH do shell de login do usuário (rc dele) +
/// fallbacks comuns (caso a resolução do shell falhe/estoure o timeout).
pub(crate) fn augmented_path() -> String {
    let mut parts: Vec<std::path::PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();

    #[cfg(not(windows))]
    {
        if let Some(sp) = login_shell_path() {
            parts.extend(std::env::split_paths(sp));
        }
        if let Some(home) = std::env::var_os("HOME") {
            let home = std::path::PathBuf::from(home);
            for suf in [".local/bin", ".cargo/bin", ".bun/bin", ".deno/bin", ".volta/bin", ".local/share/pnpm", "bin"] {
                parts.push(home.join(suf));
            }
            // node via nvm: o rc do shell (que faz nvm funcionar) não roda em app
            // GUI nem em /bin/sh dos subprocessos → injeta o bin da versão mais
            // nova direto ("node: not found" nos filhos do claude sem isso)
            if let Some(bin) = newest_nvm_bin(&home) {
                parts.push(bin);
            }
        }
        for d in ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"] {
            parts.push(std::path::PathBuf::from(d));
        }
    }
    #[cfg(windows)]
    {
        // PATH persistido no registro: pega o que foi instalado depois do logon
        if let Some(rp) = registry_path() {
            parts.extend(std::env::split_paths(rp));
        }
        // claude no Windows: instalador nativo (~\.local\bin\claude.exe) ou npm global (%APPDATA%\npm\claude.cmd)
        if let Some(up) = std::env::var_os("USERPROFILE") {
            let up = std::path::PathBuf::from(up);
            parts.push(up.join(".local\\bin"));
            parts.push(up.join(".bun\\bin"));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            parts.push(std::path::PathBuf::from(appdata).join("npm"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let local = std::path::PathBuf::from(local);
            parts.push(local.join("Microsoft\\WindowsApps"));
            // agy (Antigravity): o instalador joga em %LOCALAPPDATA%\agy\bin
            parts.push(local.join("agy\\bin"));
        }
    }

    let mut seen = std::collections::HashSet::new();
    parts.retain(|p| seen.insert(p.clone()));
    std::env::join_paths(parts).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Bin da versão de node mais nova instalada pelo nvm (~/.nvm/versions/node/vX.Y.Z/bin).
/// Ordena semanticamente (v9 < v20 — lexicográfico erraria).
#[cfg(not(windows))]
fn newest_nvm_bin(home: &std::path::Path) -> Option<std::path::PathBuf> {
    let dir = home.join(".nvm").join("versions").join("node");
    let key = |name: &str| -> (u64, u64, u64) {
        let mut it = name.trim_start_matches('v').splitn(3, '.');
        let mut n = || it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        (n(), n(), n())
    };
    std::fs::read_dir(&dir)
        .ok()?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .max_by_key(|name| key(name))
        .map(|name| dir.join(name).join("bin"))
}

/// Extensões executáveis a testar ao resolver um nome sem extensão.
/// No Windows vem do PATHEXT (`claude` → `claude.exe`/`claude.cmd`); em Unix só o nome cru.
/// PATHEXT vem PRIMEIRO: o npm cria três shims lado a lado (`claude` sh, `claude.cmd`,
/// `claude.ps1`); o sem extensão é script bash e o CreateProcess quebra com
/// "%1 não é aplicativo Win32 válido" (os error 193). Preferir `.cmd`/`.exe`.
#[cfg(windows)]
fn executable_exts() -> Vec<String> {
    let raw = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let mut v: Vec<String> = raw.split(';').filter(|s| !s.is_empty()).map(str::to_string).collect();
    v.push(String::new()); // por último: nome já pode trazer a extensão (claude.exe)
    v
}
#[cfg(not(windows))]
fn executable_exts() -> Vec<String> {
    vec![String::new()]
}

/// Resolve `name` pra caminho absoluto varrendo o PATH. Devolve `name` se não achar.
pub(crate) fn resolve_program(name: &str, path: &str) -> String {
    // caminho já explícito (separador ou absoluto): usa direto
    if name.contains('/') || name.contains('\\') || std::path::Path::new(name).is_absolute() {
        return name.to_string();
    }
    let exts = executable_exts();
    for dir in std::env::split_paths(path) {
        for ext in &exts {
            let cand = dir.join(format!("{name}{ext}"));
            if cand.is_file() {
                return cand.to_string_lossy().into_owned();
            }
        }
    }
    name.to_string()
}

/// Shell padrão do SO quando o usuário não escolhe um.
#[cfg(windows)]
fn default_shell() -> String {
    std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into())
}
#[cfg(not(windows))]
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
}

/// Monta o CommandBuilder. No Windows, shims `.cmd`/`.bat` (ex: npm) não são
/// executáveis pro CreateProcess — precisam de `cmd.exe /c`.
fn command_for(program: String, args: &[String]) -> CommandBuilder {
    #[cfg(windows)]
    {
        let lower = program.to_ascii_lowercase();
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            let mut b = CommandBuilder::new("cmd.exe");
            b.arg("/c");
            b.arg(&program);
            for a in args {
                b.arg(a);
            }
            return b;
        }
    }
    let mut b = CommandBuilder::new(program);
    for a in args {
        b.arg(a);
    }
    b
}

fn build_command(cmd: &AgentCmd, cwd: &str) -> CommandBuilder {
    let path = augmented_path();
    let mut b = match cmd {
        AgentCmd::Claude { extra_args } => {
            let (prog, mut args) = invocacao("claude", &path);
            args.extend(extra_args.iter().cloned());
            command_for(prog, &args)
        }
        AgentCmd::Agent { program, extra_args } => {
            let (prog, mut args) = invocacao(program, &path);
            args.extend(extra_args.iter().cloned());
            command_for(prog, &args)
        }
        AgentCmd::Shell { program } => {
            let sh = program.clone().unwrap_or_else(default_shell);
            command_for(resolve_program(&sh, &path), &[])
        }
    };
    b.cwd(cwd);
    b.env("TERM", "xterm-256color");
    b.env("PATH", path); // filho (claude e seus subprocessos) enxerga o PATH completo
    b
}

#[tauri::command]
pub fn spawn_agent(
    app: AppHandle,
    state: State<PtyState>,
    agent_id: String,
    cmd: AgentCmd,
    cwd: String,
    cols: u16,
    rows: u16,
    on_bytes: Channel<Vec<u8>>,
) -> Result<(), String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let child = pair
        .slave
        .spawn_command(build_command(&cmd, &cwd))
        .map_err(|e| e.to_string())?;
    // slave fecha aqui; o master fica pra ler/escrever/resize
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let alive = Arc::new(AtomicBool::new(true));

    {
        let alive = alive.clone();
        let id = agent_id.clone();
        // leitura do PTY é bloqueante → thread OS dedicada por agente
        std::thread::spawn(move || {
            let mut buf = [0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,            // EOF = processo saiu
                    Ok(n) => {
                        if on_bytes.send(buf[..n].to_vec()).is_err() {
                            break; // frontend foi embora
                        }
                    }
                    Err(_) => break,
                }
            }
            alive.store(false, Ordering::SeqCst);
            let _ = app.emit("agent-exited", &id);
        });
    }

    // id repetido (remount do XtermView, reload da janela) sobrescrevia a
    // entrada e deixava o processo antigo órfão — mata o anterior antes.
    if let Some(mut old) = state.agents().insert(
        agent_id,
        Agent { writer: Arc::new(Mutex::new(writer)), master: pair.master, child, alive },
    ) {
        old.alive.store(false, Ordering::SeqCst);
        let _ = old.child.kill();
    }
    Ok(())
}

/// Escreve bytes no stdin do agente sem manter o mapa travado (ver `Writer`).
fn write_to(state: &PtyState, agent_id: &str, bytes: &[u8]) -> Result<(), String> {
    let writer = state.writer_of(agent_id)?;
    let mut w = writer.lock().unwrap_or_else(|e| e.into_inner());
    w.write_all(bytes).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_stdin(state: State<PtyState>, agent_id: String, data: String) -> Result<(), String> {
    write_to(&state, &agent_id, data.as_bytes())
}

#[tauri::command]
pub fn resize_pty(state: State<PtyState>, agent_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.agents();
    let a = map.get(&agent_id).ok_or(format!("agente {agent_id} não encontrado"))?;
    a.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_agent(state: State<PtyState>, agent_id: String) -> Result<(), String> {
    if let Some(mut a) = state.agents().remove(&agent_id) {
        a.alive.store(false, Ordering::SeqCst);
        a.child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tira caracteres de controle do texto colado. Um `\x1b[201~` no meio do
/// conteúdo encerraria o bracketed-paste antes do fim e o resto entraria como
/// digitação crua no terminal do destino — injeção de comando a partir de
/// output de outro agente, de um arquivo de contexto ou de uma nota. `\n` e
/// `\t` ficam (formatam o bloco); o `\r` que submete é adicionado no framing.
pub(crate) fn bracketed_safe(text: &str) -> String {
    text.chars().filter(|c| !c.is_control() || *c == '\n' || *c == '\t').collect()
}

/// Teto do bloco colado. O buffer do PTY é pequeno (uns 8-16 KB) e o write
/// bloqueia quando o filho não drena stdin; acima disso, erro claro em vez de
/// terminal pendurado. Um contexto grande deve ser lido do disco pelo agente.
pub(crate) const MAX_PASTE: usize = 16 * 1024;

/// Escreve texto no stdin do agente como bracketed-paste (bloco único, uma submissão).
/// Usado pelo forward_output (comunicação entre agentes) e pelo apply_role (semear papel).
pub fn forward_output_to(state: &PtyState, to_agent: &str, text: &str) -> Result<(), String> {
    let safe = bracketed_safe(text);
    if safe.len() > MAX_PASTE {
        return Err(format!(
            "texto grande demais pra colar ({} KB, limite {} KB): o PTY do destino bloqueia quando o filho não drena stdin",
            safe.len() / 1024,
            MAX_PASTE / 1024
        ));
    }
    let framed = format!("\x1b[200~{safe}\x1b[201~\r");
    write_to(state, to_agent, framed.as_bytes())
}

/// Encaminha texto pro stdin de outro agente (comunicação entre agentes).
#[tauri::command]
pub fn forward_output(state: State<PtyState>, to_agent: String, text: String) -> Result<(), String> {
    forward_output_to(&state, &to_agent, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    // contrato com o front (lib/tauri.ts): exatamente esses JSONs precisam desserializar
    #[test]
    fn agent_cmd_contrato_front() {
        let shell: AgentCmd = serde_json::from_str(r#"{"kind":"shell","program":null}"#).unwrap();
        assert!(matches!(shell, AgentCmd::Shell { program: None }));
        let claude: AgentCmd = serde_json::from_str(r#"{"kind":"claude","extra_args":[]}"#).unwrap();
        assert!(matches!(claude, AgentCmd::Claude { .. }));
        let agent: AgentCmd =
            serde_json::from_str(r#"{"kind":"agent","program":"codex","extra_args":[]}"#).unwrap();
        assert!(matches!(agent, AgentCmd::Agent { .. }));
    }

    #[test]
    fn bracketed_safe_tira_terminador() {
        // texto malicioso vindo de outro agente/contexto: o terminador do paste
        // não pode sobreviver, senão "rm -rf /" entra como digitação crua
        let evil = "ok\x1b[201~rm -rf /\r";
        let safe = bracketed_safe(evil);
        assert!(!safe.contains('\x1b'), "sobrou ESC: {safe:?}");
        assert!(!safe.contains('\r'), "sobrou CR: {safe:?}");
        assert_eq!(safe, "ok[201~rm -rf /");
        // formatação legítima do bloco continua passando
        assert_eq!(bracketed_safe("a\nb\tc"), "a\nb\tc");
    }

    #[test]
    fn paste_grande_recusado_antes_de_bloquear() {
        // o write no PTY bloqueia quando o filho não drena stdin; melhor erro
        // claro do que terminal pendurado (e antes o mapa ficava travado)
        let st = PtyState::default();
        let err = forward_output_to(&st, "alvo", &"x".repeat(MAX_PASTE + 1)).unwrap_err();
        assert!(err.contains("grande demais"), "{err}");
        // texto normal passa do teto e só falha por não achar o agente
        let err = forward_output_to(&st, "alvo", "oi").unwrap_err();
        assert!(err.contains("não encontrado"), "{err}");
    }

    #[test]
    fn path_resolve() {
        // ~/.local/bin entra no PATH aumentado (onde o claude do usuário costuma estar)
        if std::env::var_os("HOME").is_some() {
            assert!(augmented_path().contains(".local/bin"));
        }
        // resolve um binário conhecido pra caminho absoluto existente
        let sh = resolve_program("sh", &augmented_path());
        assert!(sh.starts_with('/') && std::path::Path::new(&sh).is_file(), "resolveu: {sh}");
        // nome inexistente cai de volta pro próprio nome (erro aparece no spawn/terminal)
        assert_eq!(resolve_program("binario-que-nao-existe-xyz", &augmented_path()), "binario-que-nao-existe-xyz");
    }

    #[test]
    fn npx_quando_nao_ha_binario() {
        // PATH de mentira com um "npx" dentro: o binário do agente não existe
        // lá, então a invocação tem de cair pro pacote npm.
        let tmp = std::env::temp_dir().join(format!("orq-npx-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        for nome in ["npx", "npx.cmd"] {
            std::fs::write(tmp.join(nome), b"").unwrap();
        }
        let path = tmp.to_string_lossy().into_owned();

        let (prog, args) = invocacao("claude", &path);
        assert!(prog.contains("npx"), "programa: {prog}");
        assert_eq!(args, vec!["-y".to_string(), "@anthropic-ai/claude-code".to_string()]);

        // agy não é pacote npm: sem npx pra salvar, volta o nome cru e o spawn
        // falha com o erro de sempre
        assert_eq!(invocacao("agy", &path), ("agy".to_string(), vec![]));

        // sem npx no PATH também não inventa nada
        assert_eq!(invocacao("claude", ""), ("claude".to_string(), vec![]));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn binario_no_path_ganha_do_npx() {
        // com o binário instalado, npx nem entra na conta: é mais rápido e é a
        // versão que o usuário escolheu
        let path = augmented_path();
        let (prog, args) = invocacao("sh", &path);
        assert!(std::path::Path::new(&prog).is_file(), "resolveu: {prog}");
        assert!(args.is_empty());
        assert_eq!(pacote_npm("gemini"), Some("@google/gemini-cli"));
        assert_eq!(pacote_npm("agy"), None);
    }

    #[test]
    fn nvm_no_path() {
        // se o usuário tem nvm, o node dele precisa resolver pelo PATH aumentado
        // (subprocessos do claude rodam /bin/sh sem o rc do shell)
        let home = match std::env::var("HOME") { Ok(h) => h, Err(_) => return };
        let nvm = std::path::Path::new(&home).join(".nvm/versions/node");
        if !nvm.exists() { return; } // sem nvm no ambiente → pula
        let path = augmented_path();
        assert!(path.contains(".nvm/versions/node"), "PATH sem nvm: {path}");
        let node = resolve_program("node", &path);
        assert!(std::path::Path::new(&node).is_file(), "node não resolveu: {node}");
    }

    /// Saída real do `reg query`: o valor tem espaço (Program Files) e vem
    /// depois do tipo. Parse por token cortaria o caminho no meio.
    #[test]
    fn reg_path_parse() {
        let out = "\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %LOCALAPPDATA%\\agy\\bin;C:\\Program Files\\Git\\cmd\r\n";
        assert_eq!(
            parse_reg_path(out).unwrap(),
            "%LOCALAPPDATA%\\agy\\bin;C:\\Program Files\\Git\\cmd"
        );
        // outras chaves na mesma saída não podem ser confundidas com o Path
        assert!(parse_reg_path("    TEMP    REG_SZ    C:\\Temp\r\n").is_none());
        assert!(parse_reg_path("ERROR: acesso negado").is_none());
    }

    #[test]
    fn expande_var_do_registro() {
        std::env::set_var("ORQ_TESTE_VAR", "C:\\alvo");
        assert_eq!(expand_env_vars("%ORQ_TESTE_VAR%\\agy\\bin"), "C:\\alvo\\agy\\bin");
        // variável que não existe fica literal — some com o dir, não com o PATH inteiro
        assert_eq!(expand_env_vars("%NAO_EXISTE_XYZ%\\bin;C:\\ok"), "%NAO_EXISTE_XYZ%\\bin;C:\\ok");
        // '%' solto não pode comer o resto da string
        assert_eq!(expand_env_vars("C:\\50%\\bin"), "C:\\50%\\bin");
        assert_eq!(expand_env_vars("C:\\sem-var"), "C:\\sem-var");
    }
}
