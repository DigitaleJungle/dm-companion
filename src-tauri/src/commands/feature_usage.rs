//! How features, traits and feats are used, filled in by hand once in their preview card and kept app-wide (every
//! character and campaign uses it; a re-import of the rules leaves it alone). Keys are "kind:name|source", lowercase.

use crate::storage::{to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "feature-usage.json";
const MAX_TEXT: usize = 200;
const MAX_NUMBER: u32 = 999;

/// How many uses: one of these is set.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Count {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fixed: Option<u32>,
    /// An ability modifier (at least 1): "str" … "cha".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ability: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proficiency: Option<bool>,
    /// N × the class level (a pool, like Lay On Hands).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_level: Option<u32>,
    /// A class table column, by its name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table: Option<String>,
}

/// One feature's usage. Every field is optional: what's left out comes from the rules data or its text.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Usage {
    /// "none", "uses", "pool" or "spell" (casts a spell without a slot).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<Count>,
    /// The spell a free cast is for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spell: Option<String>,
    /// What a short rest gives back: "all", "one" or "none".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short: Option<String>,
    /// Whether a long rest gives everything back.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub long: Option<bool>,
    /// "action", "bonus", "reaction" or "none".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage: Option<String>,
    /// The saving throw it calls for: "str" … "cha".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub save: Option<String>,
    /// Another feature (by name) whose uses this one spends, like Turn Undead from Channel Divinity.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draws_from: Option<String>,
}

pub type UsageMap = BTreeMap<String, Usage>;

const ABILITIES: [&str; 6] = ["str", "dex", "con", "int", "wis", "cha"];

fn one_of(field: &str, value: &Option<String>, allowed: &[&str]) -> Result<(), String> {
    match value {
        Some(v) if !allowed.contains(&v.as_str()) => Err(format!("{field} \"{v}\" is not one of {}", allowed.join(", "))),
        _ => Ok(()),
    }
}

fn text(field: &str, value: &Option<String>) -> Result<(), String> {
    match value {
        Some(v) if v.trim().is_empty() || v.chars().count() > MAX_TEXT => Err(format!("{field} must be 1 to {MAX_TEXT} characters")),
        _ => Ok(()),
    }
}

fn number(field: &str, value: Option<u32>) -> Result<(), String> {
    match value {
        Some(n) if n > MAX_NUMBER => Err(format!("{field} must be at most {MAX_NUMBER}")),
        _ => Ok(()),
    }
}

fn validate(key: &str, usage: &Usage) -> Result<(), String> {
    if key.trim().is_empty() || key.chars().count() > 2 * MAX_TEXT {
        return Err("the feature key is empty or too long".into());
    }
    one_of("usage", &usage.usage, &["none", "uses", "pool", "spell"])?;
    one_of("short", &usage.short, &["all", "one", "none"])?;
    one_of("time", &usage.time, &["action", "bonus", "reaction", "none"])?;
    one_of("save", &usage.save, &ABILITIES)?;
    for (field, value) in [("spell", &usage.spell), ("range", &usage.range), ("damage", &usage.damage), ("drawsFrom", &usage.draws_from)] {
        text(field, value)?;
    }
    if let Some(count) = &usage.count {
        number("count.fixed", count.fixed)?;
        number("count.perLevel", count.per_level)?;
        one_of("count.ability", &count.ability, &ABILITIES)?;
        text("count.table", &count.table)?;
        let set = [count.fixed.is_some(), count.ability.is_some(), count.proficiency == Some(true), count.per_level.is_some(), count.table.is_some()];
        if set.iter().filter(|s| **s).count() != 1 {
            return Err("count needs exactly one of fixed, ability, proficiency, perLevel or table".into());
        }
    }
    Ok(())
}

/// An empty map when nothing has been saved yet.
pub fn load(path: &Path) -> Result<UsageMap, StorageError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(UsageMap::new()),
        Err(e) => return Err(e.into()),
    };
    let parsed = serde_json::from_str::<UsageMap>(&text)
        .map_err(|e| e.to_string())
        .and_then(|map| map.iter().try_for_each(|(k, u)| validate(k, u)).map(|()| map));
    match parsed {
        Ok(map) => Ok(map),
        Err(reason) => {
            // Keep the bad file, so the next save never destroys something we couldn't read.
            fs::copy(path, path.with_extension("corrupt.json"))?;
            Err(StorageError::Corrupt(reason))
        }
    }
}

// Saves read, change and write the whole file, so one at a time.
static SAVING: Mutex<()> = Mutex::new(());

/// Sets one feature's usage (an empty one, or `None`, removes it) and returns the whole map.
pub fn save(path: &Path, key: &str, usage: Option<Usage>) -> Result<UsageMap, StorageError> {
    let key = key.trim().to_lowercase();
    if let Some(u) = &usage {
        validate(&key, u).map_err(StorageError::Invalid)?;
    }
    let _guard = SAVING.lock().unwrap_or_else(|e| e.into_inner());
    let mut map = load(path)?;
    match usage {
        Some(u) if u != Usage::default() => map.insert(key, u),
        _ => map.remove(&key),
    };
    write_atomic(path, &to_json(&map)?)?;
    Ok(map)
}

fn usage_path(app: &AppHandle) -> Result<PathBuf, StorageError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(FILE_NAME))
        .map_err(|e| StorageError::Io(e.to_string()))
}

#[tauri::command]
pub async fn get_feature_usage(app: AppHandle) -> Result<UsageMap, StorageError> {
    load(&usage_path(&app)?)
}

#[tauri::command]
pub async fn set_feature_usage(app: AppHandle, key: String, usage: Option<Usage>) -> Result<UsageMap, StorageError> {
    save(&usage_path(&app)?, &key, usage)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dmc-feature-usage-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join(FILE_NAME)
    }

    fn channel_divinity() -> Usage {
        Usage {
            usage: Some("uses".into()),
            count: Some(Count { table: Some("Channel Divinity".into()), ..Count::default() }),
            short: Some("one".into()),
            long: Some(true),
            time: Some("action".into()),
            ..Usage::default()
        }
    }

    #[test]
    fn missing_file_means_nothing_saved() {
        assert_eq!(load(&temp_file("missing")), Ok(UsageMap::new()));
    }

    #[test]
    fn saves_round_trip_by_lowercase_key_and_empty_removes() {
        let path = temp_file("roundtrip");
        let map = save(&path, "classFeature:Channel Divinity|XPHB", Some(channel_divinity())).unwrap();
        assert_eq!(map.get("classfeature:channel divinity|xphb"), Some(&channel_divinity()));
        assert_eq!(load(&path).unwrap(), map);
        assert!(save(&path, "classfeature:channel divinity|xphb", Some(Usage::default())).unwrap().is_empty());
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn rejects_bad_values_without_writing() {
        let path = temp_file("invalid");
        let bad_time = Usage { time: Some("free".into()), ..Usage::default() };
        assert!(matches!(save(&path, "feat:alert|xphb", Some(bad_time)), Err(StorageError::Invalid(_))));
        let two_counts = Usage { count: Some(Count { fixed: Some(2), proficiency: Some(true), ..Count::default() }), ..Usage::default() };
        assert!(matches!(save(&path, "feat:alert|xphb", Some(two_counts)), Err(StorageError::Invalid(_))));
        let too_big = Usage { count: Some(Count { fixed: Some(5000), ..Count::default() }), ..Usage::default() };
        assert!(matches!(save(&path, "feat:alert|xphb", Some(too_big)), Err(StorageError::Invalid(_))));
        assert!(matches!(save(&path, " ", Some(channel_divinity())), Err(StorageError::Invalid(_))));
        assert!(!path.exists());
    }

    #[test]
    fn corrupt_file_is_reported_and_kept() {
        let path = temp_file("corrupt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"feat:alert|xphb":{"time":"free"}}"#).unwrap();
        assert!(matches!(load(&path), Err(StorageError::Corrupt(_))));
        assert!(path.with_extension("corrupt.json").exists());
        // A save doesn't overwrite what couldn't be read.
        assert!(matches!(save(&path, "feat:lucky|xphb", Some(channel_divinity())), Err(StorageError::Corrupt(_))));
    }
}
