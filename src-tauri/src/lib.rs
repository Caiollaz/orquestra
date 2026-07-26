mod contexts;
mod editor;
mod git;
mod pagina;
mod pty;
mod roles;
mod workspace;

use pty::PtyState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_| {
            // resolve o PATH do shell de login em background: 1º spawn não espera
            std::thread::spawn(pty::prewarm_path);
            Ok(())
        })
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty::spawn_agent,
            pty::write_stdin,
            pty::resize_pty,
            pty::kill_agent,
            pty::forward_output,
            pty::check_prereqs,
            roles::list_roles,
            roles::save_role,
            roles::delete_role,
            roles::apply_role,
            contexts::list_contexts,
            contexts::save_context,
            contexts::delete_context,
            contexts::apply_contexts,
            workspace::list_workspaces,
            workspace::load_workspace,
            workspace::save_workspace,
            workspace::delete_workspace,
            git::create_floor,
            git::remove_floor,
            editor::open_editor,
            pagina::fetch_page,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // fecha o app → mata todos os PTYs (sem órfãos)
            if let RunEvent::ExitRequested { .. } = event {
                app.state::<PtyState>().kill_all();
            }
        });
}
