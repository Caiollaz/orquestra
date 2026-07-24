// Persistência local dos workspaces em ~/.orquestra/. Porta o padrão de registry.ts.
// index.json lista os workspaces; workspaces/<id>.json guarda o estado completo (layout incluso).

use std::fs;
use std::path::PathBuf;

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
    fs::write(index_path(), serde_json::to_string_pretty(list).unwrap()).map_err(|e| e.to_string())
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
pub fn save_workspace(workspace: Workspace) -> Result<(), String> {
    fs::create_dir_all(ws_dir()).map_err(|e| e.to_string())?;
    let p = ws_dir().join(format!("{}.json", workspace.id));
    fs::write(&p, serde_json::to_string_pretty(&workspace).unwrap()).map_err(|e| e.to_string())?;
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

    #[test]
    fn roundtrip_workspace() {
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
        };
        save_workspace(ws.clone()).unwrap();

        let metas = list_workspaces().unwrap();
        assert_eq!(metas.len(), 1);
        assert_eq!(metas[0].name, "Projeto X");

        let got = load_workspace("w1".into()).unwrap();
        assert_eq!(got.repo_path, "/repo/x");
        assert_eq!(got.viewport.zoom, 1.5);

        std::fs::remove_dir_all(&tmp).ok();
    }
}
