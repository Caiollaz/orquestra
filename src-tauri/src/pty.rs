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
struct Agent {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PtyState {
    agents: Mutex<HashMap<String, Agent>>,
}

impl PtyState {
    /// Mata todos os agentes (chamado no fechamento do app pra não deixar órfão).
    pub fn kill_all(&self) {
        if let Ok(mut map) = self.agents.lock() {
            for (_, mut a) in map.drain() {
                a.alive.store(false, Ordering::SeqCst);
                let _ = a.child.kill();
            }
        }
    }
}

/// O que rodar no PTY: claude interativo ou um shell.
#[derive(Deserialize, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AgentCmd {
    Claude { extra_args: Vec<String> },
    Shell { program: Option<String> },
}

/// PATH do shell de login costuma ter dirs que o app GUI não herda.
/// Aumenta o PATH atual com os locais comuns pra achar `claude` e afins.
pub(crate) fn augmented_path() -> String {
    let mut parts: Vec<std::path::PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();

    #[cfg(not(windows))]
    {
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
            parts.push(std::path::PathBuf::from(local).join("Microsoft\\WindowsApps"));
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
#[cfg(windows)]
fn executable_exts() -> Vec<String> {
    let mut v = vec![String::new()]; // nome já pode trazer a extensão
    let raw = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    for e in raw.split(';').filter(|s| !s.is_empty()) {
        v.push(e.to_string());
    }
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
        AgentCmd::Claude { extra_args } => command_for(resolve_program("claude", &path), extra_args),
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

    state.agents.lock().unwrap().insert(
        agent_id,
        Agent { writer, master: pair.master, child, alive },
    );
    Ok(())
}

#[tauri::command]
pub fn write_stdin(state: State<PtyState>, agent_id: String, data: String) -> Result<(), String> {
    let mut map = state.agents.lock().unwrap();
    let a = map.get_mut(&agent_id).ok_or("agente não encontrado")?;
    a.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    a.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(state: State<PtyState>, agent_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.agents.lock().unwrap();
    let a = map.get(&agent_id).ok_or("agente não encontrado")?;
    a.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_agent(state: State<PtyState>, agent_id: String) -> Result<(), String> {
    if let Some(mut a) = state.agents.lock().unwrap().remove(&agent_id) {
        a.alive.store(false, Ordering::SeqCst);
        a.child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Escreve texto no stdin do agente como bracketed-paste (bloco único, uma submissão).
/// Usado pelo forward_output (comunicação entre agentes) e pelo apply_role (semear papel).
pub fn forward_output_to(state: &PtyState, to_agent: &str, text: &str) -> Result<(), String> {
    let mut map = state.agents.lock().unwrap();
    let a = map.get_mut(to_agent).ok_or("agente destino não encontrado")?;
    let framed = format!("\x1b[200~{}\x1b[201~\r", text);
    a.writer.write_all(framed.as_bytes()).map_err(|e| e.to_string())?;
    a.writer.flush().map_err(|e| e.to_string())
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
}
