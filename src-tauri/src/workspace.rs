// Persistência local dos workspaces em ~/.orquestra/. Porta o padrão de registry.ts.
// index.json lista os workspaces; workspaces/<id>.json guarda o estado completo (layout incluso).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::git::Floor;
use crate::pty::AgentCmd;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub role_file: Option<String>,
    pub cmd: AgentCmd,
    pub cwd: String,
    #[serde(default)]
    pub floor_slug: Option<String>,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    #[serde(default)]
    pub created_at: String,
    pub viewport: Viewport,
    #[serde(default)]
    pub agents: Vec<Agent>,
    #[serde(default)]
    pub floors: Vec<Floor>,
    /// Estado completo do canvas (nós de todo tipo + arestas), opaco pro Rust:
    /// o front serializa/restaura; o back só persiste. Evita espelhar cada
    /// tipo de nó novo em struct.
    #[serde(default)]
    pub canvas: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    pub repo_path: String,
}

/// Base configurável (testes injetam um tmp via ORQUESTRA_HOME).
fn base_dir() -> PathBuf {
    if let Ok(h) = std::env::var("ORQUESTRA_HOME") {
        return PathBuf::from(h);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".orquestra")
}
fn ws_dir() -> PathBuf {
    base_dir().join("workspaces")
}
fn index_path() -> PathBuf {
    base_dir().join("index.json")
}

fn read_index() -> Vec<WorkspaceMeta> {
    fs::read_to_string(index_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn write_index(list: &[WorkspaceMeta]) -> Result<(), String> {
    fs::create_dir_all(base_dir()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    write_atomic(&index_path(), &json)
}

/// Timestamp de criação. Segundos de epoch em texto — sem `chrono` só pra um
/// campo de metadado que ninguém formata (o front não lê `createdAt`).
fn now_iso() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

/// Escrita atômica: grava num `.tmp` irmão e renomeia (rename é atômico no
/// mesmo filesystem, e no Windows o `std::fs::rename` substitui o destino).
/// O autosave grava a cada 1.2s — um crash no meio de um `fs::write` direto
/// deixava JSON truncado e levava o canvas inteiro do usuário.
fn write_atomic(path: &Path, data: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<WorkspaceMeta>, String> {
    Ok(read_index())
}

#[tauri::command]
pub fn load_workspace(id: String) -> Result<Workspace, String> {
    let p = ws_dir().join(format!("{id}.json"));
    let s = fs::read_to_string(&p).map_err(|e| format!("workspace {id}: {e}"))?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_workspace(id: String) -> Result<(), String> {
    let p = ws_dir().join(format!("{id}.json"));
    if p.exists() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    let idx: Vec<WorkspaceMeta> = read_index().into_iter().filter(|m| m.id != id).collect();
    write_index(&idx)
}

#[tauri::command]
pub fn save_workspace(mut workspace: Workspace) -> Result<(), String> {
    if workspace.id.is_empty() || workspace.id.contains(['/', '\\', '.']) {
        return Err(format!("id de workspace inválido: {}", workspace.id));
    }
    fs::create_dir_all(ws_dir()).map_err(|e| e.to_string())?;
    if workspace.created_at.is_empty() {
        workspace.created_at = now_iso();
    }
    let p = ws_dir().join(format!("{}.json", workspace.id));
    let json = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    write_atomic(&p, &json)?;
    // upsert no índice
    let mut idx = read_index();
    let meta = WorkspaceMeta { id: workspace.id.clone(), name: workspace.name.clone(), repo_path: workspace.repo_path.clone() };
    match idx.iter_mut().find(|m| m.id == meta.id) {
        Some(m) => *m = meta,
        None => idx.push(meta),
    }
    write_index(&idx)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ORQUESTRA_HOME é global do processo e os testes rodam em paralelo:
    /// quem mexe nele precisa entrar em fila, senão um lê o tmp do outro.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn roundtrip_workspace() {
        let _fila = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = std::env::temp_dir().join(format!("orq-test-{}", uuid::Uuid::new_v4()));
        std::env::set_var("ORQUESTRA_HOME", &tmp);

        let ws = Workspace {
            id: "w1".into(),
            name: "Projeto X".into(),
            repo_path: "/repo/x".into(),
            created_at: "2026-01-01".into(),
            viewport: Viewport { x: 1.0, y: 2.0, zoom: 1.5 },
            agents: vec![],
            floors: vec![],
            canvas: serde_json::json!({
                "nodes": [{"id": "note-1", "type": "note", "x": 1.0, "y": 2.0, "data": {"text": "olá"}}],
                "edges": [{"source": "a", "target": "b"}],
            }),
        };
        save_workspace(ws.clone()).unwrap();

        let metas = list_workspaces().unwrap();
        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].name, "Projeto X");

        let got = load_workspace("w1".into()).unwrap();
        assert_eq!(got.repo_path, "/repo/x");
        assert_eq!(got.viewport.zoom, 1.5);
        // canvas roundtrip opaco (nós de qualquer tipo + arestas)
        assert_eq!(got.canvas["nodes"][0]["data"]["text"], "olá");
        assert_eq!(got.canvas["edges"][0]["target"], "b");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn save_e_atomico_e_nao_duplica_indice() {
        let _fila = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = std::env::temp_dir().join(format!("orq-test-{}", uuid::Uuid::new_v4()));
        std::env::set_var("ORQUESTRA_HOME", &tmp);

        let ws = Workspace {
            id: "w2".into(),
            name: "Y".into(),
            repo_path: "/repo/y".into(),
            created_at: String::new(),
            viewport: Viewport { x: 0.0, y: 0.0, zoom: 1.0 },
            agents: vec![],
            floors: vec![],
            canvas: serde_json::json!({}),
        };
        save_workspace(ws.clone()).unwrap();
        save_workspace(ws.clone()).unwrap();

        // upsert: dois saves = uma entrada só
        assert_eq!(list_workspaces().unwrap().len(), 1);
        // createdAt é preenchido quando vem vazio
        assert!(!load_workspace("w2".into()).unwrap().created_at.is_empty());
        // a escrita atômica não deixa .tmp pra trás
        let sobras: Vec<_> = std::fs::read_dir(ws_dir())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(sobras.is_empty(), "sobrou tmp: {sobras:?}");

        // id que escaparia do diretório é recusado
        let mut mau = ws;
        mau.id = "../fora".into();
        assert!(save_workspace(mau).is_err());

        std::fs::remove_dir_all(&tmp).ok();
    }
}
