//! Tauri commands for the rules reference: importing user-provided data, managing sources, reading.

use crate::rules::images::{self, ImagesInfo};
use crate::rules::import::{import_archive, Progress};
use crate::rules::library::{self, Book, CatalogRow, Entity, LibraryInfo, LIBRARY_LOCK};
use crate::storage::{to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const REMOVED_FILE: &str = "removed-sources.json";

// One import (data or images) at a time.
static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedSource {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesStatus {
    /// `None` until rules data has been imported.
    pub library: Option<LibraryInfo>,
    /// Sources the user removed; future imports skip them until allowed again.
    pub removed: Vec<RemovedSource>,
    pub images: Option<ImagesInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    task: &'static str,
    #[serde(flatten)]
    progress: Progress,
}

fn rules_dir(app: &AppHandle) -> Result<PathBuf, StorageError> {
    app.path().app_data_dir().map(|d| d.join("rules")).map_err(|e| StorageError::Io(e.to_string()))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn load_removed(dir: &Path) -> Result<Vec<RemovedSource>, StorageError> {
    match fs::read_to_string(dir.join(REMOVED_FILE)) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| StorageError::Corrupt(format!("{REMOVED_FILE}: {e}"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.into()),
    }
}

fn save_removed(dir: &Path, removed: &[RemovedSource]) -> Result<(), StorageError> {
    write_atomic(&dir.join(REMOVED_FILE), &to_json(&removed)?)
}

fn status_of(dir: &Path) -> Result<RulesStatus, StorageError> {
    let library = {
        let _guard = LIBRARY_LOCK.read().unwrap_or_else(|p| p.into_inner());
        library::open(dir)?.map(|conn| library::info(&conn)).transpose()?
    };
    Ok(RulesStatus { library, removed: load_removed(dir)?, images: images::info(dir) })
}

/// Runs a long import on a worker thread, one at a time, reporting progress as `rules-import-progress` events.
async fn run_busy<T: Send + 'static>(
    app: AppHandle,
    task: &'static str,
    work: impl FnOnce(&mut dyn FnMut(Progress)) -> Result<T, StorageError> + Send + 'static,
) -> Result<T, StorageError> {
    if BUSY.swap(true, Ordering::SeqCst) {
        return Err(StorageError::Invalid("An import is already running.".into()));
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        work(&mut |progress| {
            // A missed progress event only affects the progress bar.
            let _ = app.emit("rules-import-progress", ProgressEvent { task, progress });
        })
    })
    .await
    .map_err(|e| StorageError::Io(e.to_string()));
    BUSY.store(false, Ordering::SeqCst);
    result?
}

fn with_library<T>(app: &AppHandle, read: impl FnOnce(&rusqlite::Connection) -> Result<T, StorageError>) -> Result<T, StorageError> {
    let dir = rules_dir(app)?;
    let _guard = LIBRARY_LOCK.read().unwrap_or_else(|p| p.into_inner());
    let conn = library::open(&dir)?.ok_or_else(|| StorageError::NotFound("No rules data has been imported yet.".into()))?;
    read(&conn)
}

#[tauri::command]
pub async fn rules_status(app: AppHandle) -> Result<RulesStatus, StorageError> {
    status_of(&rules_dir(&app)?)
}

#[tauri::command]
pub async fn rules_import(app: AppHandle, path: String) -> Result<RulesStatus, StorageError> {
    let dir = rules_dir(&app)?;
    let removed: Vec<String> = load_removed(&dir)?.into_iter().map(|r| r.id).collect();
    let work_dir = dir.clone();
    run_busy(app, "data", move |progress| import_archive(Path::new(&path), &work_dir, &removed, now_ms(), progress)).await?;
    status_of(&dir)
}

#[tauri::command]
pub async fn rules_import_images(app: AppHandle, path: String) -> Result<RulesStatus, StorageError> {
    let dir = rules_dir(&app)?;
    fs::create_dir_all(&dir)?;
    let work_dir = dir.clone();
    run_busy(app, "images", move |progress| images::import_images(Path::new(&path), &work_dir, now_ms(), progress)).await?;
    status_of(&dir)
}

#[tauri::command]
pub async fn rules_remove_images(app: AppHandle) -> Result<RulesStatus, StorageError> {
    let dir = rules_dir(&app)?;
    images::remove_images(&dir)?;
    status_of(&dir)
}

/// Removes sources' content from the library and remembers them, so later imports skip them too.
#[tauri::command]
pub async fn rules_remove_sources(app: AppHandle, ids: Vec<String>) -> Result<RulesStatus, StorageError> {
    let dir = rules_dir(&app)?;
    let mut removed = load_removed(&dir)?;
    {
        let _guard = LIBRARY_LOCK.write().unwrap_or_else(|p| p.into_inner());
        let conn = library::open_write(&dir)?;
        let sources = library::info(&conn)?.sources;
        for id in &ids {
            library::remove_source(&conn, id)?;
            if !removed.iter().any(|r| r.id.eq_ignore_ascii_case(id)) {
                let name = sources.iter().find(|s| s.id.eq_ignore_ascii_case(id)).map(|s| s.name.clone()).unwrap_or_else(|| id.clone());
                removed.push(RemovedSource { id: id.clone(), name });
            }
        }
    }
    save_removed(&dir, &removed)?;
    status_of(&dir)
}

/// Forgets a removed source; it comes back with the next import.
#[tauri::command]
pub async fn rules_allow_source(app: AppHandle, id: String) -> Result<RulesStatus, StorageError> {
    let dir = rules_dir(&app)?;
    let mut removed = load_removed(&dir)?;
    removed.retain(|r| !r.id.eq_ignore_ascii_case(&id));
    save_removed(&dir, &removed)?;
    status_of(&dir)
}

#[tauri::command]
pub async fn rules_book(app: AppHandle, id: String) -> Result<Option<Book>, StorageError> {
    with_library(&app, |conn| library::book(conn, &id))
}

#[tauri::command]
pub async fn rules_chapter(app: AppHandle, book: String, index: i64) -> Result<Option<Value>, StorageError> {
    with_library(&app, |conn| library::chapter(conn, &book, index))
}

#[tauri::command]
pub async fn rules_entity(app: AppHandle, id: i64) -> Result<Option<Entity>, StorageError> {
    with_library(&app, |conn| library::entity(conn, id))
}

#[tauri::command]
pub async fn rules_find(app: AppHandle, kind: String, name: String, source: Option<String>) -> Result<Option<Entity>, StorageError> {
    with_library(&app, |conn| library::find(conn, &kind, &name, source.as_deref()))
}

/// All entries of a kind (all kinds when `kind` is None) with the given fields, for the Catalog table.
#[tauri::command]
pub async fn rules_catalog(app: AppHandle, kind: Option<String>, keys: Vec<String>) -> Result<Vec<CatalogRow>, StorageError> {
    with_library(&app, |conn| library::catalog(conn, kind.as_deref(), &keys))
}

/// Entities of a kind whose extra key starts with `prefix`: a class's features ("Fighter|XPHB|") or a subclass's.
#[tauri::command]
pub async fn rules_by_extra(app: AppHandle, kind: String, prefix: String) -> Result<Vec<Entity>, StorageError> {
    with_library(&app, |conn| library::by_extra(conn, &kind, &prefix))
}

/// The spells on a class's list with the given fields; None when the library was imported before spell lists existed.
#[tauri::command]
pub async fn rules_class_spells(app: AppHandle, class: String, class_source: String, keys: Vec<String>) -> Result<Option<Vec<CatalogRow>>, StorageError> {
    with_library(&app, |conn| library::class_spells(conn, &class, &class_source, &keys))
}
