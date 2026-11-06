//! Dear to Love: local-first AI story engine (Rust core).
//!
//! The Rust layer owns canonical state. React is a projection of it.

pub mod commands;
pub mod db;
pub mod domain;
pub mod errors;
pub mod services;
pub mod state;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;

use db::Database;
use errors::{AppError, ErrorCode};
use services::secrets::{KeyringStore, KEYRING_SERVICE};
use state::AppState;

/// Opens the story database inside the app-data directory.
fn open_database(data_dir: &Result<PathBuf, String>) -> Result<Database, AppError> {
    let dir = data_dir.as_ref().map_err(|reason| {
        AppError::new(
            ErrorCode::Io,
            format!("app data folder unavailable: {reason}"),
        )
    })?;
    let path = dir.join(db::DB_FILE_NAME);
    let backups = dir.join("backups");
    let (database, report) = tauri::async_runtime::block_on(Database::open(&path, &backups))?;
    if let Some(backup) = report.pre_migration_backup {
        eprintln!(
            "database upgraded (migrations {:?}); pre-upgrade backup at {}",
            report.applied_migrations,
            backup.display()
        );
    }
    let problems = tauri::async_runtime::block_on(db::contract::verify(&database))?;
    if !problems.is_empty() {
        return Err(AppError::new(
            ErrorCode::Database,
            format!(
                "the story database failed consistency checks: {}",
                problems.join("; ")
            ),
        ));
    }
    Ok(database)
}

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
            // A database that fails to open does not stop the app: the UI
            // shows the error and Diagnostics offers remediation.
            let db = open_database(&data_dir);
            if let Err(e) = &db {
                eprintln!("story database unavailable: {}", e.message);
            }
            app.manage(AppState {
                product_name,
                version,
                data_dir,
                db,
                secrets: Arc::new(KeyringStore::new(KEYRING_SERVICE)),
                session_id: db::new_id(),
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
