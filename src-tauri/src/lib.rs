//! Dear to Love: local-first AI story engine (Rust core).
//!
//! The Rust layer owns canonical state. React is a projection of it.

pub mod commands;
pub mod domain;
pub mod errors;
pub mod services;
pub mod state;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config = app.config();
            let version = config.version.clone().unwrap_or_else(|| "0.0.0".into());
            let product_name = config
                .product_name
                .clone()
                .unwrap_or_else(|| "Dear to Love".into());
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|dir| {
                    std::fs::create_dir_all(&dir)
                        .map(|_| dir)
                        .map_err(|e| e.to_string())
                });
            app.manage(AppState {
                product_name,
                version,
                data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::app::run_diagnostics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dear to Love");
}
