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

/// PATH do shell de login costuma ter dirs que o app GUI não herda (~/.local/bin etc).
/// Aumenta o PATH atual com os locais comuns pra achar `claude` e afins.
fn augmented_path() -> String {
    let mut parts: Vec<std::path::PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        let home = std::path::PathBuf::from(home);
        for suf in [".local/bin", ".cargo/bin", ".bun/bin", ".deno/bin", "bin"] {
            parts.push(home.join(suf));
        }
    }
    for d in ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"] {
        parts.push(std::path::PathBuf::from(d));
    }
    let mut seen = std::collections::HashSet::new();
    parts.retain(|p| seen.insert(p.clone()));
    std::env::join_paths(parts).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Resolve `name` pra caminho absoluto varrendo `path` (:separado). Devolve `name` se não achar.
fn resolve_program(name: &str, path: &str) -> String {
    if name.contains('/') {
        return name.to_string();
    }
    for dir in std::env::split_paths(path) {
        let cand = dir.join(name);
        if cand.is_file() {
            return cand.to_string_lossy().into_owned();
        }
    }
    name.to_string()
}

fn build_command(cmd: &AgentCmd, cwd: &str) -> CommandBuilder {
    let path = augmented_path();
    let mut b = match cmd {
        AgentCmd::Claude { extra_args } => {
            let mut b = CommandBuilder::new(resolve_program("claude", &path));
            for a in extra_args {
                b.arg(a);
            }
            b
        }
        AgentCmd::Shell { program } => {
            let sh = program.clone().unwrap_or_else(|| {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
            });
            CommandBuilder::new(resolve_program(&sh, &path))
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
}
