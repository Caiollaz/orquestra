// Papéis = markdown com frontmatter (name/agent/description) + corpo com {{var}}.
// Porta agentmgr.ts/prompt.ts do agentdesk. Ficam em <repo>/.orquestra/roles/*.md.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::pty::{forward_output_to, PtyState};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub file: String,
    pub name: String,
    pub agent: String,
    pub description: String,
    pub body: String,
}

fn roles_dir(repo: &str) -> PathBuf {
    Path::new(repo).join(".orquestra").join("roles")
}

/// Slug ASCII: minúsculas, [a-z0-9] preservado, resto vira hífen, sem hífens nas pontas.
pub fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_hyphen = false;
    for c in s.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            prev_hyphen = false;
        } else if !prev_hyphen && !out.is_empty() {
            out.push('-');
            prev_hyphen = true;
        }
    }
    out.trim_end_matches('-').to_string()
}

/// Substitui {{ident}} por vars[ident] (ausente → vazio). Espelha render() do prompt.ts.
pub fn render_template(body: &str, vars: &HashMap<String, String>) -> String {
    let bytes = body.as_bytes();
    let mut out = String::with_capacity(body.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some(rel) = body[i + 2..].find("}}") {
                let key = &body[i + 2..i + 2 + rel];
                if key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') && !key.is_empty() {
                    out.push_str(vars.get(key).map(String::as_str).unwrap_or(""));
                    i = i + 2 + rel + 2;
                    continue;
                }
            }
        }
        out.push(body[i..].chars().next().unwrap());
        i += body[i..].chars().next().unwrap().len_utf8();
    }
    out
}

/// Parse de frontmatter YAML simples (só chaves name/agent/description) + corpo.
pub fn parse_role(file: &str, raw: &str) -> Role {
    let base = file.trim_end_matches(".md").to_string();
    let mut name = base.clone();
    let mut agent = base.clone();
    let mut description = String::new();
    let mut body = raw.trim_start();

    if let Some(rest) = body.strip_prefix("---") {
        // acha o fim do bloco frontmatter (próxima linha "---")
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            body = rest[end + 4..].trim_start_matches('\n');
            for line in fm.lines() {
                let line = line.trim();
                if let Some((k, v)) = line.split_once(':') {
                    let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
                    match k.trim() {
                        "name" => name = v,
                        "agent" => agent = v,
                        "description" => description = v,
                        _ => {}
                    }
                }
            }
        }
    }
    Role { file: file.to_string(), name, agent, description, body: body.trim().to_string() }
}

fn file_ok(file: &str) -> Result<(), String> {
    let ok = !file.is_empty()
        && file.ends_with(".md")
        && file[..file.len() - 3].chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok { Ok(()) } else { Err(format!("nome de papel inválido: {file}")) }
}

#[tauri::command]
pub fn list_roles(repo_path: String) -> Result<Vec<Role>, String> {
    let dir = roles_dir(&repo_path);
    let mut out = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(out), // dir ainda não existe = sem papéis
    };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.ends_with(".md") {
            if let Ok(raw) = fs::read_to_string(e.path()) {
                out.push(parse_role(&name, &raw));
            }
        }
    }
    out.sort_by(|a, b| a.file.cmp(&b.file));
    Ok(out)
}

#[tauri::command]
pub fn save_role(repo_path: String, role: Role) -> Result<(), String> {
    file_ok(&role.file)?;
    let dir = roles_dir(&repo_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let md = format!(
        "---\nname: {}\nagent: {}\ndescription: {}\n---\n{}\n",
        role.name.trim(),
        role.agent.trim(),
        role.description.trim(),
        role.body.trim(),
    );
    fs::write(dir.join(&role.file), md).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_role(repo_path: String, file: String) -> Result<(), String> {
    file_ok(&file)?;
    let p = roles_dir(&repo_path).join(&file);
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Renderiza o corpo do papel com as vars e semeia no stdin do agente (bracketed-paste).
#[tauri::command]
pub fn apply_role(
    state: State<PtyState>,
    agent_id: String,
    role: Role,
    vars: HashMap<String, String>,
) -> Result<(), String> {
    let text = render_template(&role.body, &vars);
    forward_output_to(&state, &agent_id, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_basico() {
        assert_eq!(slugify("Exportar Relatório CSV!"), "exportar-relat-rio-csv");
        assert_eq!(slugify("  a  b  "), "a-b");
        assert_eq!(slugify("PO"), "po");
    }

    #[test]
    fn render_vars() {
        let mut v = HashMap::new();
        v.insert("title".to_string(), "Login".to_string());
        assert_eq!(render_template("Feature {{title}} pronta", &v), "Feature Login pronta");
        // var ausente → vazio; token malformado fica intacto
        assert_eq!(render_template("x {{missing}} y", &v), "x  y");
        assert_eq!(render_template("a {{ b }} c", &v), "a {{ b }} c");
    }

    #[test]
    fn parse_frontmatter() {
        let raw = "---\nname: Product Owner\nagent: po\ndescription: \"vira requisito\"\n---\nVocê é o PO de {{title}}.";
        let r = parse_role("po.md", raw);
        assert_eq!(r.name, "Product Owner");
        assert_eq!(r.agent, "po");
        assert_eq!(r.description, "vira requisito");
        assert_eq!(r.body, "Você é o PO de {{title}}.");
    }

    #[test]
    fn parse_sem_frontmatter() {
        let r = parse_role("livre.md", "só corpo, sem fm");
        assert_eq!(r.name, "livre");
        assert_eq!(r.agent, "livre");
        assert_eq!(r.body, "só corpo, sem fm");
    }
}
