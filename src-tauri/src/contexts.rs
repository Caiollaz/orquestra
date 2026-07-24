// Contextos = blocos de conhecimento reaproveitáveis (regras de negócio,
// arquitetura, contratos) que o usuário empilha em qualquer agente.
//
// Diferença do papel (roles.rs): papel é **quem o agente é** — um por agente,
// define comportamento. Contexto é **o que ele precisa saber** — vários por
// agente, empilháveis, iguais pra todo mundo do canvas.
//
// Ficam em <repo>/.orquestra/contexts/*.md. Mesmo markdown dos papéis
// (frontmatter opcional + corpo com {{var}}), mas o nome/descrição caem pro
// primeiro `# título` quando não há frontmatter — é como o usuário escreve.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::pty::{forward_output_to, PtyState};
use crate::roles::{file_ok, split_frontmatter};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub file: String,
    pub name: String,
    pub description: String,
    pub body: String,
}

fn contexts_dir(repo: &str) -> PathBuf {
    Path::new(repo).join(".orquestra").join("contexts")
}

/// Nome/descrição de um contexto: frontmatter quando existe, senão o primeiro
/// `# título` (sem o prefixo "Contexto:") e a primeira linha de texto.
pub fn parse_context(file: &str, raw: &str) -> Context {
    let (fm, body) = split_frontmatter(raw);
    let mut name = fm.get("name").cloned().unwrap_or_default();
    let mut description = fm.get("description").cloned().unwrap_or_default();

    for line in body.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        if let Some(h) = l.strip_prefix("# ") {
            if name.is_empty() {
                name = h.trim().trim_start_matches("Contexto:").trim().to_string();
            }
            continue;
        }
        if l.starts_with('#') {
            continue;
        }
        if description.is_empty() {
            description = l.chars().take(120).collect();
        }
        break;
    }
    if name.is_empty() {
        name = file.trim_end_matches(".md").to_string();
    }
    Context { file: file.to_string(), name, description, body: body.trim().to_string() }
}

#[tauri::command]
pub fn list_contexts(repo_path: String) -> Result<Vec<Context>, String> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(contexts_dir(&repo_path)) else {
        return Ok(out); // dir ainda não existe = sem contextos
    };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.ends_with(".md") {
            if let Ok(raw) = fs::read_to_string(e.path()) {
                out.push(parse_context(&name, &raw));
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn save_context(repo_path: String, context: Context) -> Result<(), String> {
    file_ok(&context.file)?;
    let dir = contexts_dir(&repo_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let md = format!(
        "---\nname: {}\ndescription: {}\n---\n{}\n",
        context.name.trim(),
        context.description.trim(),
        context.body.trim(),
    );
    fs::write(dir.join(&context.file), md).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_context(repo_path: String, file: String) -> Result<(), String> {
    file_ok(&file)?;
    let p = contexts_dir(&repo_path).join(&file);
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Junta os contextos num bloco único. Uma submissão só: dois bracketed-paste
/// seguidos se atropelam no prompt do claude (o segundo chega enquanto o
/// primeiro ainda está sendo processado).
///
/// O corpo vai **verbatim**, sem `render_template`: contexto é documentação, e
/// documentação de projeto cita `{{var}}`, Handlebars, Jinja e afins. Renderizar
/// apagava esses trechos (var ausente → vazio). Template é coisa de papel.
pub fn compose_contexts(contexts: &[Context]) -> String {
    let n = contexts.len();
    let mut out = format!(
        "(contexto) {n} bloco{} de contexto do projeto. Absorva as regras e responda apenas OK.\n",
        if n == 1 { "" } else { "s" }
    );
    for c in contexts {
        out.push_str(&format!("\n=== {} ===\n{}\n", c.name, c.body));
    }
    out
}

/// Semeia os contextos no stdin do agente (bracketed-paste, uma submissão).
#[tauri::command]
pub fn apply_contexts(state: State<PtyState>, agent_id: String, contexts: Vec<Context>) -> Result<(), String> {
    if contexts.is_empty() {
        return Ok(());
    }
    forward_output_to(&state, &agent_id, &compose_contexts(&contexts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_pelo_titulo() {
        // como o usuário escreve na mão: sem frontmatter, título markdown
        let raw = "# Contexto: Regras de negócio\n\nProduto: orquestrador de agentes.\n\n## Regras\n1. PTY sempre.";
        let c = parse_context("regras-de-negocio.md", raw);
        assert_eq!(c.name, "Regras de negócio");
        assert_eq!(c.description, "Produto: orquestrador de agentes.");
        assert!(c.body.starts_with("# Contexto:"), "corpo mantém o título");
    }

    #[test]
    fn parse_frontmatter_ganha_do_titulo() {
        let raw = "---\nname: Contratos\ndescription: o que quebra calado\n---\n# Outro título\ncorpo";
        let c = parse_context("contratos.md", raw);
        assert_eq!(c.name, "Contratos");
        assert_eq!(c.description, "o que quebra calado");
    }

    #[test]
    fn parse_sem_titulo_cai_no_arquivo() {
        let c = parse_context("solto.md", "só um parágrafo");
        assert_eq!(c.name, "solto");
        assert_eq!(c.description, "só um parágrafo");
    }

    #[test]
    fn compose_um_bloco_por_contexto_verbatim() {
        let ctx = |name: &str, body: &str| Context {
            file: format!("{name}.md"),
            name: name.into(),
            description: String::new(),
            body: body.into(),
        };
        let text = compose_contexts(&[ctx("A", "corpo com {{var}} citado"), ctx("B", "outra")]);
        assert!(text.starts_with("(contexto) 2 blocos"));
        // documentação cita {{var}} — tem que chegar inteiro no agente
        assert!(text.contains("=== A ===\ncorpo com {{var}} citado"), "template não pode ser renderizado: {text}");
        assert!(text.contains("=== B ===\noutra"));
        // singular quando é um só
        assert!(compose_contexts(&[ctx("A", "x")]).starts_with("(contexto) 1 bloco de"));
    }

    #[test]
    fn salva_lista_e_remove() {
        let tmp = std::env::temp_dir().join(format!("orq-ctx-{}", uuid::Uuid::new_v4()));
        let repo = tmp.to_string_lossy().to_string();
        let c = Context {
            file: "regras.md".into(),
            name: "Regras".into(),
            description: "as regras".into(),
            body: "não quebre".into(),
        };
        save_context(repo.clone(), c).unwrap();

        let list = list_contexts(repo.clone()).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Regras");
        assert_eq!(list[0].body, "não quebre");

        delete_context(repo.clone(), "regras.md".into()).unwrap();
        assert!(list_contexts(repo).unwrap().is_empty());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn recusa_nome_com_travessia() {
        let c = Context {
            file: "../../evil.md".into(),
            name: "x".into(),
            description: String::new(),
            body: "x".into(),
        };
        assert!(save_context("/tmp".into(), c).is_err());
        assert!(delete_context("/tmp".into(), "../../evil.md".into()).is_err());
    }
}
