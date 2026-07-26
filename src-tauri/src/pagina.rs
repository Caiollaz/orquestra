// Busca o conteúdo de uma URL pro nó portal (⇢portal-1: ler).
//
// Por que curl e não reqwest/tauri-plugin-http: a entrada do reqwest no
// Cargo.lock vem do tauri SEM backend de TLS, então ligar o plugin puxaria a
// árvore de TLS inteira (libssl-dev no runner Linux, ou ring/rustls) num cold
// build que hoje não paga isso. E o plugin injeta `Origin` à força e o wrapper JS
// descarta `User-Agent` (header proibido pelo spec do fetch) — sem UA é o motivo
// nº 1 de 403 atrás de WAF, justo o que não dá pra corrigir por lá. Com curl
// temos UA, redirect, timeout, tamanho e protocolo na mão, e o Cargo.lock intacto.
// Mesmo padrão do editor.rs: PATH aumentado do pty.rs (GUI não herda o do shell).

use std::process::Command;

use crate::pty::{augmented_path, resolve_program};

const UA: &str = "Mozilla/5.0 (compatible; orquestra/1.0; +https://github.com/Caiollaz/orquestra)";
const MAX_BYTES: usize = 2 * 1024 * 1024;

/// Fronteira de confiança: a URL vem de um agente, que a tirou de um prompt ou de
/// uma página. Sem esta guarda, `⇢portal-1: ler file:///etc/passwd` é primitiva de
/// exfiltração — e um redirect malicioso alcançaria o mesmo. O `--proto`/
/// `--proto-redir` do curl fecham o lado dele; isto fecha o nosso.
pub(crate) fn esquema_ok(url: &str) -> bool {
    let u = url.trim().to_ascii_lowercase();
    u.starts_with("http://") || u.starts_with("https://")
}

#[tauri::command]
pub fn fetch_page(url: String) -> Result<String, String> {
    if !esquema_ok(&url) {
        return Err("só http:// e https:// são aceitos".into());
    }
    let path = augmented_path();
    let prog = resolve_program("curl", &path);
    let saida = Command::new(&prog)
        .args([
            "-sSL",
            "--max-redirs",
            "5",
            "--max-time",
            "20",
            "--max-filesize",
            "3000000",
            "--proto",
            "=http,https",
            "--proto-redir",
            "=http,https",
            "-A",
            UA,
            "--", // fim das opções: URL começando com '-' não vira flag
            &url,
        ])
        .env("PATH", &path)
        .output()
        .map_err(|e| format!("curl não rodou ({e}) — está no PATH?"))?;

    if !saida.status.success() {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        return Err(if erro.is_empty() { format!("curl falhou ({})", saida.status) } else { erro });
    }
    // corta em bytes ANTES do from_utf8_lossy; lossy também cobre codepoint
    // partido no fim e página em charset não-UTF8 (degrada em vez de estourar)
    let corpo = &saida.stdout[..saida.stdout.len().min(MAX_BYTES)];
    Ok(String::from_utf8_lossy(corpo).into_owned())
}

#[cfg(test)]
mod tests {
    use super::esquema_ok;

    #[test]
    fn esquema_recusa_o_que_nao_e_http() {
        assert!(esquema_ok("http://x.com"));
        assert!(esquema_ok("https://x.com/a?b=1"));
        assert!(esquema_ok("  HTTPS://X.COM  "));
        // os que interessam: leitura de arquivo local e amigos
        assert!(!esquema_ok("file:///etc/passwd"));
        assert!(!esquema_ok("FILE:///etc/passwd"));
        assert!(!esquema_ok("ftp://x.com"));
        assert!(!esquema_ok("gopher://x.com"));
        assert!(!esquema_ok("//x.com"));
        assert!(!esquema_ok("x.com"));
        assert!(!esquema_ok(""));
        // não dá pra escapar pondo http mais pra frente
        assert!(!esquema_ok("file:///etc/passwd#http://x.com"));
    }
}
