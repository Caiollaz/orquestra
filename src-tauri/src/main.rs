// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK compõe camadas na GPU e NÃO re-rasteriza no `transform: scale()`
    // do zoom do canvas — todo o conteúdo vira bitmap pixelado ao ampliar.
    // Sem compositing ele pinta na resolução real em qualquer zoom.
    // ponytail: custo é animação composta na CPU; se pesar, alternar por env.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
    orquestra_lib::run()
}
