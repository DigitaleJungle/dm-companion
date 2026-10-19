//! Order of the cards on the Home screen, saved app-wide in the app data folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Every card Home knows about. Each may appear at most once.
pub const CARD_IDS: [&str; 6] = ["encounters", "party", "legendKeeper", "notes", "continue", "tools"];
const FILE_NAME: &str = "home-layout.json";

// Saves can arrive concurrently; they share one temp file, so write one at a time.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum LayoutError {
    Io(String),
    /// The saved file could not be read as a valid layout. A copy was kept next to it.
    Corrupt(String),
    Invalid(String),
}

impl From<io::Error> for LayoutError {
    fn from(e: io::Error) -> Self {
        LayoutError::Io(e.to_string())
    }
}

#[derive(Serialize, Deserialize)]
struct Layout {
    cards: Vec<String>,
}

fn validate(cards: &[String]) -> Result<(), String> {
    for (i, card) in cards.iter().enumerate() {
        if !CARD_IDS.contains(&card.as_str()) {
            return Err(format!("unknown card \"{card}\""));
        }
        if cards[..i].contains(card) {
            return Err(format!("card \"{card}\" appears twice"));
        }
    }
    Ok(())
}

/// `None` when nothing has been saved yet.
pub fn load(path: &Path) -> Result<Option<Vec<String>>, LayoutError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let parsed = serde_json::from_str::<Layout>(&text)
        .map_err(|e| e.to_string())
        .and_then(|layout| validate(&layout.cards).map(|()| layout.cards));
    match parsed {
        Ok(cards) => Ok(Some(cards)),
        Err(reason) => {
            // Keep the bad file, so the next save never destroys something we couldn't read.
            fs::copy(path, path.with_extension("corrupt.json"))?;
            Err(LayoutError::Corrupt(reason))
        }
    }
}

/// Validates, then writes atomically: temp file, flush to disk, rename over the old file.
pub fn save(path: &Path, cards: &[String]) -> Result<(), LayoutError> {
    validate(cards).map_err(LayoutError::Invalid)?;
    let json = serde_json::to_string_pretty(&Layout { cards: cards.to_vec() }).map_err(|e| LayoutError::Io(e.to_string()))?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

fn layout_path(app: &AppHandle) -> Result<PathBuf, LayoutError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(FILE_NAME))
        .map_err(|e| LayoutError::Io(e.to_string()))
}

#[tauri::command]
pub async fn get_home_cards(app: AppHandle) -> Result<Option<Vec<String>>, LayoutError> {
    load(&layout_path(&app)?)
}

#[tauri::command]
pub async fn set_home_cards(app: AppHandle, cards: Vec<String>) -> Result<(), LayoutError> {
    save(&layout_path(&app)?, &cards)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dmc-home-layout-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join(FILE_NAME)
    }

    fn cards(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn missing_file_means_nothing_saved() {
        assert_eq!(load(&temp_file("missing")), Ok(None));
    }

    #[test]
    fn save_then_load_round_trips_and_leaves_no_temp_file() {
        let path = temp_file("roundtrip");
        let order = cards(&["tools", "party", "notes"]);
        save(&path, &order).unwrap();
        assert_eq!(load(&path), Ok(Some(order)));
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn empty_layout_is_valid() {
        let path = temp_file("empty");
        save(&path, &[]).unwrap();
        assert_eq!(load(&path), Ok(Some(vec![])));
    }

    #[test]
    fn rejects_unknown_and_duplicate_cards_without_writing() {
        let path = temp_file("invalid");
        assert!(matches!(save(&path, &cards(&["party", "dragons"])), Err(LayoutError::Invalid(_))));
        assert!(matches!(save(&path, &cards(&["party", "party"])), Err(LayoutError::Invalid(_))));
        assert!(!path.exists());
    }

    #[test]
    fn corrupt_file_is_reported_and_kept() {
        let path = temp_file("corrupt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{ not json").unwrap();
        assert!(matches!(load(&path), Err(LayoutError::Corrupt(_))));
        assert_eq!(fs::read_to_string(path.with_extension("corrupt.json")).unwrap(), "{ not json");
    }

    #[test]
    fn file_with_unknown_card_counts_as_corrupt() {
        let path = temp_file("bad-id");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"cards":["party","dragons"]}"#).unwrap();
        assert!(matches!(load(&path), Err(LayoutError::Corrupt(_))));
    }
}
