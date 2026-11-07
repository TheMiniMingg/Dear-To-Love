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

/// Seconds after start before the first automatic-backup check.
const AUTO_BACKUP_DELAY_SECS: u64 = 60;

/// Opens the story database inside the app-data directory.
fn open_database(data_dir: &Result<PathBuf, String>) -> Result<Database, AppError> {
    let dir = data_dir.as_ref().map_err(|reason| {
        AppError::new(
            ErrorCode::Io,
            format!("app data folder unavailable: {reason}"),
        )
    })?;
    // A restore confirmed before the last restart finishes here, before
    // the database opens.
    if let Some(r) = services::backups::apply_pending_restore(dir) {
        match &r.message {
            None => eprintln!("restored the backup {}", r.source),
            Some(m) => eprintln!("restore of {} failed: {m}", r.source),
        }
    }
    let path = dir.join(db::DB_FILE_NAME);
    let backups = dir.join(services::backups::BACKUPS_DIR);
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
    match tauri::async_runtime::block_on(services::generation::recover_on_startup(&database)) {
        Ok((0, 0)) => {}
        Ok((runs, calls)) => eprintln!(
            "marked {runs} unfinished replies as interrupted and {calls} API calls as unknown"
        ),
        Err(e) => eprintln!("could not recover unfinished replies: {}", e.message),
    }
    match tauri::async_runtime::block_on(services::archive::recover_imports(&database, dir)) {
        Ok(r) if r == Default::default() => {}
        Ok(r) => eprintln!(
            "finished {} interrupted imports and rolled back {}",
            r.finished, r.rolled_back
        ),
        Err(e) => eprintln!("could not recover unfinished imports: {}", e.message),
    }
    Ok(database)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Only the release workflow's installer smoke test passes these (T49).
    let smoke = services::smoke::parse_args(std::env::args());
    let smoking = smoke.is_some();
    tauri::Builder::default()
        .manage(commands::app::Smoke(std::sync::Mutex::new(smoke)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("dtlimg", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn(async move {
                let state = app.state::<AppState>();
                responder.respond(commands::assets::serve(&state, &path).await);
            });
        })
        .setup(move |app| {
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
                runs: Default::default(),
                memory: Default::default(),
            });
            if smoking {
                // Report without the interface if it never loads.
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(
                        services::smoke::FRONTEND_TIMEOUT_SECS,
                    ))
                    .await;
                    commands::app::finish_smoke(handle, false).await;
                });
                return Ok(());
            }
            // Automatic backups: shortly after start, then hourly checks
            // (one backup a day at most, only after changes).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(AUTO_BACKUP_DELAY_SECS)).await;
                loop {
                    let state = handle.state::<AppState>();
                    if let (Ok(db), Ok(dir)) = (state.db(), state.data_dir.as_ref()) {
                        match services::backups::auto_backup_if_due(db, dir, chrono::Utc::now())
                            .await
                        {
                            Ok(Some(b)) => eprintln!("automatic backup {}", b.id),
                            Ok(None) => {}
                            Err(e) => eprintln!("automatic backup failed: {}", e.message),
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::app::run_diagnostics,
            commands::stories::get_template_catalog,
            commands::stories::quick_start,
            commands::stories::compose_story_draft,
            commands::stories::check_story_draft,
            commands::stories::create_story,
            commands::stories::get_wizard_draft,
            commands::stories::save_wizard_draft,
            commands::stories::clear_wizard_draft,
            commands::stories::list_stories,
            commands::stories::delete_story,
            commands::reader::get_route_view,
            commands::reader::submit_action,
            commands::reader::generate_reply,
            commands::reader::retry_reply,
            commands::reader::cancel_reply,
            commands::reader::edit_action,
            commands::reader::preview_context,
            commands::reader::draft_chapter_recap,
            commands::reader::end_chapter,
            commands::reader::regenerate_reply,
            commands::reader::edit_story_details,
            commands::reader::fork_route,
            commands::reader::restart_chapter,
            commands::reader::rename_route,
            commands::reader::set_route_hidden,
            commands::ai::list_connections,
            commands::ai::save_connection,
            commands::ai::delete_connection,
            commands::ai::get_storyteller,
            commands::ai::set_storyteller,
            commands::ai::set_story_storyteller,
            commands::ai::get_picture_maker,
            commands::ai::set_picture_maker,
            commands::ai::test_connection,
            commands::ai::send_test_message,
            commands::usage::get_usage_summary,
            commands::usage::list_api_requests,
            commands::usage::list_rates,
            commands::usage::set_rates,
            commands::usage::get_budget_status,
            commands::usage::set_budget_policy,
            commands::usage::dismiss_budget_warning,
            commands::saves::list_saves,
            commands::saves::create_save,
            commands::saves::quick_save,
            commands::saves::view_save,
            commands::saves::resume_save,
            commands::saves::delete_save,
            commands::assets::list_images,
            commands::assets::import_images,
            commands::assets::update_image,
            commands::assets::set_image_scope,
            commands::assets::image_usages,
            commands::assets::delete_image,
            commands::assets::set_story_picture,
            commands::assets::preview_portrait,
            commands::assets::make_portrait,
            commands::archive::export_storypack,
            commands::archive::import_storypack,
            commands::archive::export_route_text,
            commands::backups::list_backups,
            commands::backups::export_backup,
            commands::backups::prepare_restore,
            commands::backups::cancel_restore,
            commands::backups::confirm_restore,
            commands::backups::restart_app,
            commands::backups::take_restore_result,
            commands::search::search_route,
            commands::search::list_bookmarks,
            commands::search::add_bookmark,
            commands::search::rename_bookmark,
            commands::search::delete_bookmark,
            commands::app::diagnostics_report,
            commands::app::save_diagnostics_report,
            commands::app::open_support_page,
            commands::app::open_repository_page,
            commands::app::frontend_ready,
            commands::updates::get_update_status,
            commands::updates::check_for_updates,
            commands::updates::set_update_checks,
            commands::updates::acknowledge_update,
            commands::updates::open_release_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dear to Love");
}
