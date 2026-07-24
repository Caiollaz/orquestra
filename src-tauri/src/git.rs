// Floors = cópias isoladas do workspace via `git worktree` (equivalente cross-platform
// ao COW/APFS do Maestri). Porta a lógica de git.ts do agentdesk. Shell no binário `git`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::roles::slugify;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Floor {
    pub slug: String,
    pub branch: String,
    pub path: String,
}

pub fn branch_name(slug: &str) -> String {
    format!("orquestra/{slug}")
}
pub fn worktree_path(repo: &str, slug: &str) -> PathBuf {
    Path::new(repo).join(".orquestra").join("worktrees").join(slug)
}

fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .current_dir(repo)
        .args(args)
        .output()
        .map_err(|e| format!("git não encontrado: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn create_floor(repo_path: String, slug: String) -> Result<Floor, String> {
    let slug = slugify(&slug);
    if slug.is_empty() {
        return Err("slug vazio".into());
    }
    let branch = branch_name(&slug);
    let path = worktree_path(&repo_path, &slug);
    let path_str = path.to_string_lossy().to_string();

    if path.exists() {
        return Err(format!("floor \"{slug}\" já existe"));
    }
    // cria worktree numa branch nova a partir do HEAD; se a branch já existir, reusa (-B)
    git(&repo_path, &["worktree", "add", "-B", &branch, &path_str, "HEAD"])?;
    Ok(Floor { slug, branch, path: path_str })
}

#[tauri::command]
pub fn remove_floor(repo_path: String, slug: String) -> Result<(), String> {
    let path = worktree_path(&repo_path, &slug);
    git(&repo_path, &["worktree", "remove", "--force", &path.to_string_lossy()])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builders() {
        assert_eq!(branch_name("minha-feature"), "orquestra/minha-feature");
        let p = worktree_path("/repo", "abc");
        assert!(p.ends_with("worktrees/abc"));
        assert!(p.to_string_lossy().contains(".orquestra"));
    }

    #[test]
    fn create_e_remove_floor() {
        // só roda se `git` existir; monta um repo tmp de verdade
        let tmp = std::env::temp_dir().join(format!("orq-git-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let repo = tmp.to_string_lossy().to_string();
        if git(&repo, &["init", "-q"]).is_err() {
            std::fs::remove_dir_all(&tmp).ok();
            return; // sem git no ambiente → pula
        }
        git(&repo, &["config", "user.email", "t@t"]).unwrap();
        git(&repo, &["config", "user.name", "t"]).unwrap();
        std::fs::write(tmp.join("f.txt"), "x").unwrap();
        git(&repo, &["add", "-A"]).unwrap();
        git(&repo, &["commit", "-qm", "init"]).unwrap();

        let f = create_floor(repo.clone(), "Feature Um".into()).unwrap();
        assert_eq!(f.slug, "feature-um");
        assert_eq!(f.branch, "orquestra/feature-um");
        assert!(Path::new(&f.path).join("f.txt").exists(), "worktree deve ter o arquivo");

        remove_floor(repo.clone(), "feature-um".into()).unwrap();
        assert!(!Path::new(&f.path).exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}
