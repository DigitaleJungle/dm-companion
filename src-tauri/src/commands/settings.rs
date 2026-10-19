//! App-wide settings (not per campaign), saved as `settings.json` in the app data folder.

use crate::storage::{to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "settings.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// Follow the operating system's light/dark setting.
    #[default]
    System,
    Light,
    Dark,
}

// Missing fields fall back to their defaults, so older files keep loading when settings are added.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: Theme,
}

/// Defaults when nothing has been saved yet.
pub fn load(path: &Path) -> Result<AppSettings, StorageError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(AppSettings::default()),
        Err(e) => return Err(e.into()),
    };
    serde_json::from_str(&text).or_else(|e| {
        // Keep the bad file, so the next save never destroys something we couldn't read.
        fs::copy(path, path.with_extension("corrupt.json"))?;
        Err(StorageError::Corrupt(e.to_string()))
    })
}

pub fn save(path: &Path, settings: &AppSettings) -> Result<(), StorageError> {
    write_atomic(path, &to_json(settings)?)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, StorageError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(FILE_NAME))
        .map_err(|e| StorageError::Io(e.to_string()))
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, StorageError> {
    load(&settings_path(&app)?)
}

#[tauri::command]
pub async fn set_settings(app: AppHandle, settings: AppSettings) -> Result<(), StorageError> {
    save(&settings_path(&app)?, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dmc-settings-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join(FILE_NAME)
    }

    #[test]
    fn defaults_to_system_theme_when_nothing_saved() {
        assert_eq!(load(&temp_file("missing")).unwrap().theme, Theme::System);
    }

    #[test]
    fn saves_and_loads_the_theme() {
        let path = temp_file("roundtrip");
        save(&path, &AppSettings { theme: Theme::Dark }).unwrap();
        assert_eq!(load(&path).unwrap().theme, Theme::Dark);
        assert!(fs::read_to_string(&path).unwrap().contains("\"dark\""));
    }

    #[test]
    fn missing_fields_use_defaults() {
        let path = temp_file("partial");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{}").unwrap();
        assert_eq!(load(&path).unwrap(), AppSettings::default());
    }

    #[test]
    fn unknown_theme_counts_as_corrupt_and_the_file_is_kept() {
        let path = temp_file("corrupt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"theme":"purple"}"#).unwrap();
        assert!(matches!(load(&path), Err(StorageError::Corrupt(_))));
        assert_eq!(fs::read_to_string(path.with_extension("corrupt.json")).unwrap(), r#"{"theme":"purple"}"#);
    }
}
