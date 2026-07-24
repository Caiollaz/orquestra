// Abre um caminho num editor externo (VS Code/Zed/Cursor/Sublime).
// GUI não herda o PATH do shell de login → reusa o PATH aumentado do pty.rs
// pra achar e resolver o binário (mesma pegadinha do `claude`).

use std::process::Command;

use crate::pty::{augmented_path, resolve_program};

// ponytail: no Windows editores instalados como shim .cmd (code.cmd) não sobem
// direto pelo CreateProcess — precisariam de `cmd /c`. Unix-first por ora.
#[tauri::command]
pub fn open_editor(path: String, editor: Option<String>) -> Result<(), String> {
    let candidates: Vec<String> = match editor {
        Some(e) if !e.trim().is_empty() => vec![e],
        _ => ["code", "cursor", "zed", "subl"].iter().map(|s| s.to_string()).collect(),
    };
    let path_env = augmented_path();
    let mut last = String::from("sem candidatos");
    for c in &candidates {
        let prog = resolve_program(c, &path_env);
        match Command::new(&prog).arg(&path).env("PATH", &path_env).spawn() {
            Ok(_) => return Ok(()),
            Err(e) => last = format!("{c}: {e}"),
        }
    }
    Err(format!("nenhum editor encontrado ({last})"))
}
