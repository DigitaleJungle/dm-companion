//! App-wide settings (not per campaign), saved as `settings.json` in the app data folder.

use crate::storage::{to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Animations {
    /// Follow the operating system's reduce-motion setting.
    #[default]
    System,
    On,
    Off,
}

// Missing fields fall back to their defaults, so older files keep loading when settings are added.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: Theme,
    pub animations: Animations,
    /// GitHub `owner/repo` whose latest release is compared with the imported rules data. Set by the user.
    pub rules_update_repo: Option<String>,
    /// Sources unticked in the Library Catalog's book list (hidden there only).
    pub catalog_hidden_sources: Vec<String>,
}

fn validate(settings: &AppSettings) -> Result<(), StorageError> {
    if let Some(repo) = &settings.rules_update_repo {
        let valid = repo.split_once('/').is_some_and(|(owner, name)| {
            let ok = |p: &str| p.chars().any(|c| c.is_ascii_alphanumeric()) && p.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
            ok(owner) && ok(name)
        });
        if !valid {
            return Err(StorageError::Invalid(format!("\"{repo}\" isn't a GitHub repository. Use the form owner/repo.")));
        }
    }
    Ok(())
}

/// Applies the fields present in `patch` on top of the saved settings, so callers only send what they change.
pub fn update(path: &Path, patch: Value) -> Result<AppSettings, StorageError> {
    let Value::Object(patch) = patch else {
        return Err(StorageError::Invalid("Settings must be an object.".into()));
    };
    let mut merged = serde_json::to_value(load(path)?).map_err(|e| StorageError::Io(e.to_string()))?;
    if let Value::Object(map) = &mut merged {
        map.extend(patch);
    }
    let settings: AppSettings = serde_json::from_value(merged).map_err(|e| StorageError::Invalid(e.to_string()))?;
    validate(&settings)?;
    save(path, &settings)?;
    Ok(settings)
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

/// Saves only the fields given; the rest stay as they are.
#[tauri::command]
pub async fn set_settings(app: AppHandle, settings: Value) -> Result<AppSettings, StorageError> {
    update(&settings_path(&app)?, settings)
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
        save(&path, &AppSettings { theme: Theme::Dark, ..Default::default() }).unwrap();
        assert_eq!(load(&path).unwrap().theme, Theme::Dark);
        assert!(fs::read_to_string(&path).unwrap().contains("\"dark\""));
    }

    #[test]
    fn update_only_changes_the_given_fields() {
        let path = temp_file("patch");
        update(&path, serde_json::json!({ "rulesUpdateRepo": "someone/some-repo" })).unwrap();
        let after = update(&path, serde_json::json!({ "theme": "light" })).unwrap();
        assert_eq!(after, AppSettings { theme: Theme::Light, rules_update_repo: Some("someone/some-repo".into()), ..Default::default() });
        assert_eq!(load(&path).unwrap(), after);
        assert!(update(&path, serde_json::json!({ "rulesUpdateRepo": null })).unwrap().rules_update_repo.is_none());
    }

    #[test]
    fn update_rejects_bad_values_without_saving() {
        let path = temp_file("patch-bad");
        assert!(matches!(update(&path, serde_json::json!({ "theme": "purple" })), Err(StorageError::Invalid(_))));
        assert!(matches!(update(&path, serde_json::json!({ "rulesUpdateRepo": "not a repo" })), Err(StorageError::Invalid(_))));
        assert!(matches!(update(&path, serde_json::json!({ "rulesUpdateRepo": "../x/y" })), Err(StorageError::Invalid(_))));
        assert!(matches!(update(&path, serde_json::json!({ "rulesUpdateRepo": "a/.." })), Err(StorageError::Invalid(_))));
        assert!(!path.exists());
    }

    #[test]
    fn animations_default_to_system_and_save() {
        let path = temp_file("animations");
        assert_eq!(load(&path).unwrap().animations, Animations::System);
        update(&path, serde_json::json!({ "animations": "on" })).unwrap();
        assert_eq!(load(&path).unwrap().animations, Animations::On);
        // Settings files from before this option still load.
        fs::write(&path, r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(load(&path).unwrap(), AppSettings { theme: Theme::Dark, ..Default::default() });
        assert!(matches!(update(&path, serde_json::json!({ "animations": "sometimes" })), Err(StorageError::Invalid(_))));
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
