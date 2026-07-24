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
    // app GUI não herda o PATH do shell de login (contrato 4): resolve o binário
    // pelo PATH aumentado e passa esse PATH pro filho.
    let path = crate::pty::augmented_path();
    let out = Command::new(crate::pty::resolve_program("git", &path))
        .current_dir(repo)
        .args(args)
        .env("PATH", &path)
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

/// Trabalho que morre se o floor for removido. `--ignored=matching` é essencial:
/// `git status` normal **não** lista arquivos ignorados (`.env`, config local,
/// cache de build), mas o `git worktree remove` apaga a pasta inteira — sem isso
/// a guarda da regra 8 passava batido e destruía trabalho de verdade.
/// `-uall` lista arquivo por arquivo em vez de só o diretório.
pub fn pending_changes(worktree: &Path) -> Result<Vec<String>, String> {
    let dir = worktree.to_string_lossy().to_string();
    let out = git(&dir, &["status", "--porcelain", "-uall", "--ignored=matching"])?;
    Ok(out.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

/// Remove o floor. Sem `force`, recusa se houver trabalho não commitado —
/// regra 8: floor não pode destruir trabalho sem --force explícito.
#[tauri::command]
pub fn remove_floor(repo_path: String, slug: String, force: Option<bool>) -> Result<(), String> {
    let path = worktree_path(&repo_path, &slug);
    let forced = force.unwrap_or(false);
    if !forced {
        // não conseguir verificar não é sinal verde: se a pasta existe e o git
        // falhou, recusa (falha fechada — a operação é destrutiva).
        let pending = match pending_changes(&path) {
            Ok(p) => p,
            Err(e) if path.exists() => return Err(format!("não deu pra verificar o floor \"{slug}\": {e}")),
            Err(_) => Vec::new(), // worktree já não existe → deixa o git limpar o registro
        };
        if !pending.is_empty() {
            let amostra: Vec<&str> = pending.iter().take(5).map(String::as_str).collect();
            return Err(format!(
                "floor \"{slug}\" tem {} alteração(ões) não commitada(s): {}{}. Commite, ou remova com força pra descartar.",
                pending.len(),
                amostra.join(", "),
                if pending.len() > 5 { ", …" } else { "" }
            ));
        }
    }
    let path_str = path.to_string_lossy().to_string();
    let mut args = vec!["worktree", "remove"];
    if forced {
        args.push("--force");
    }
    args.push(&path_str);
    git(&repo_path, &args)?;
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
        std::fs::write(tmp.join(".gitignore"), ".env\n").unwrap();
        git(&repo, &["add", "-A"]).unwrap();
        git(&repo, &["commit", "-qm", "init"]).unwrap();

        let f = create_floor(repo.clone(), "Feature Um".into()).unwrap();
        assert_eq!(f.slug, "feature-um");
        assert_eq!(f.branch, "orquestra/feature-um");
        assert!(Path::new(&f.path).join("f.txt").exists(), "worktree deve ter o arquivo");

        // regra 8: com trabalho não commitado, remover sem force é recusado
        std::fs::write(Path::new(&f.path).join("rascunho.txt"), "trabalho").unwrap();
        assert!(!pending_changes(Path::new(&f.path)).unwrap().is_empty());
        let err = remove_floor(repo.clone(), "feature-um".into(), None).unwrap_err();
        assert!(err.contains("rascunho.txt"), "erro deve listar o pendente: {err}");
        assert!(Path::new(&f.path).exists(), "floor sujo não pode ser removido sem force");

        // arquivo IGNORADO também é trabalho: `git status` puro esconde, mas o
        // `worktree remove` apaga a pasta inteira. Sem `--ignored` a guarda da
        // regra 8 passava batido e destruía o .env do usuário.
        std::fs::remove_file(Path::new(&f.path).join("rascunho.txt")).unwrap();
        std::fs::write(Path::new(&f.path).join(".env"), "SEGREDO=1").unwrap();
        let puro = git(&f.path, &["status", "--porcelain"]).unwrap();
        assert!(puro.is_empty(), "status puro deveria esconder o ignorado: {puro:?}");
        let err = remove_floor(repo.clone(), "feature-um".into(), None).unwrap_err();
        assert!(err.contains(".env"), "ignorado tem que contar como pendente: {err}");
        assert!(Path::new(&f.path).join(".env").exists());

        // limpo (ou com force explícito) remove de verdade
        std::fs::remove_file(Path::new(&f.path).join(".env")).unwrap();
        remove_floor(repo.clone(), "feature-um".into(), None).unwrap();
        assert!(!Path::new(&f.path).exists());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn remove_floor_com_force_descarta() {
        let tmp = std::env::temp_dir().join(format!("orq-git-f-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let repo = tmp.to_string_lossy().to_string();
        if git(&repo, &["init", "-q"]).is_err() {
            std::fs::remove_dir_all(&tmp).ok();
            return;
        }
        git(&repo, &["config", "user.email", "t@t"]).unwrap();
        git(&repo, &["config", "user.name", "t"]).unwrap();
        std::fs::write(tmp.join("f.txt"), "x").unwrap();
        git(&repo, &["add", "-A"]).unwrap();
        git(&repo, &["commit", "-qm", "init"]).unwrap();

        let f = create_floor(repo.clone(), "descartavel".into()).unwrap();
        std::fs::write(Path::new(&f.path).join("rascunho.txt"), "trabalho").unwrap();
        remove_floor(repo.clone(), "descartavel".into(), Some(true)).unwrap();
        assert!(!Path::new(&f.path).exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}
