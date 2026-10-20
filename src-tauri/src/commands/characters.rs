//! Characters: one file per character, inside the campaign it belongs to:
//! `<campaign folder>/characters/<id>.json`. Fields this module doesn't know are kept as they are.

use super::campaigns::{check_id, dirs, now_ms, Dirs};
use crate::storage::{to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;
use tauri::AppHandle;

const FOLDER: &str = "characters";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subclass {
    pub name: String,
    #[serde(default)]
    pub short_name: String,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassLevel {
    pub name: String,
    pub source: String,
    pub level: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subclass: Option<Subclass>,
}

/// What a character file must contain to be listed.
#[derive(Deserialize)]
struct Summary {
    id: String,
    name: String,
    #[serde(default)]
    classes: Vec<ClassLevel>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterCard {
    pub campaign_id: String,
    pub archived: bool,
    pub id: String,
    pub name: String,
    pub classes: Vec<ClassLevel>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterList {
    /// Sorted by name.
    pub characters: Vec<CharacterCard>,
    /// Files that couldn't be read, as "<campaign id>/characters/<file>". They are left untouched.
    pub unreadable: Vec<String>,
}

fn read_campaigns(root: &Path, archived: bool, list: &mut CharacterList) -> Result<(), StorageError> {
    let campaigns = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for campaign in campaigns {
        let campaign = campaign?;
        let campaign_id = campaign.file_name().to_string_lossy().into_owned();
        let files = match fs::read_dir(campaign.path().join(FOLDER)) {
            Ok(files) => files,
            Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.into()),
        };
        for file in files {
            let path = file?.path();
            if path.extension().is_none_or(|ext| ext != "json") {
                continue;
            }
            let parsed = fs::read_to_string(&path).ok().and_then(|text| serde_json::from_str::<Summary>(&text).ok());
            match parsed {
                Some(c) => list.characters.push(CharacterCard { campaign_id: campaign_id.clone(), archived, id: c.id, name: c.name, classes: c.classes }),
                None => list.unreadable.push(format!("{campaign_id}/{FOLDER}/{}", path.file_name().unwrap_or_default().to_string_lossy())),
            }
        }
    }
    Ok(())
}

pub fn list(dirs: &Dirs) -> Result<CharacterList, StorageError> {
    let mut list = CharacterList { characters: vec![], unreadable: vec![] };
    read_campaigns(&dirs.active, false, &mut list)?;
    read_campaigns(&dirs.archived, true, &mut list)?;
    list.characters.sort_by_key(|c| c.name.to_lowercase());
    Ok(list)
}

/// Copies a character (from an active or archived campaign) into another active campaign, under a new id.
pub fn copy(dirs: &Dirs, from_campaign: &str, id: &str, to_campaign: &str, now: u64) -> Result<CharacterCard, StorageError> {
    check_id(from_campaign)?;
    check_id(id)?;
    check_id(to_campaign)?;
    if from_campaign == to_campaign {
        return Err(StorageError::Invalid("The character is already in that campaign.".into()));
    }
    let target = dirs.active.join(to_campaign);
    if !target.join("campaign.json").exists() {
        return Err(StorageError::Invalid("Characters can only be copied into an active campaign.".into()));
    }
    let source = [&dirs.active, &dirs.archived]
        .into_iter()
        .map(|root| root.join(from_campaign).join(FOLDER).join(format!("{id}.json")))
        .find(|path| path.exists())
        .ok_or_else(|| StorageError::NotFound("That character doesn't exist.".into()))?;
    let text = fs::read_to_string(source)?;
    let mut value: serde_json::Value = serde_json::from_str(&text).map_err(|e| StorageError::Corrupt(e.to_string()))?;
    let summary: Summary = serde_json::from_value(value.clone()).map_err(|e| StorageError::Corrupt(e.to_string()))?;

    let folder = target.join(FOLDER);
    let base = format!("{now:x}");
    let mut new_id = base.clone();
    let mut n = 1;
    while folder.join(format!("{new_id}.json")).exists() {
        n += 1;
        new_id = format!("{base}-{n}");
    }
    value["id"] = serde_json::Value::String(new_id.clone());
    write_atomic(&folder.join(format!("{new_id}.json")), &to_json(&value)?)?;
    Ok(CharacterCard { campaign_id: to_campaign.to_string(), archived: false, id: new_id, name: summary.name, classes: summary.classes })
}

#[tauri::command]
pub async fn list_characters(app: AppHandle) -> Result<CharacterList, StorageError> {
    list(&dirs(&app)?)
}

#[tauri::command]
pub async fn copy_character(app: AppHandle, from_campaign: String, id: String, to_campaign: String) -> Result<CharacterCard, StorageError> {
    copy(&dirs(&app)?, &from_campaign, &id, &to_campaign, now_ms())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dirs(name: &str) -> Dirs {
        let root = std::env::temp_dir().join(format!("dmc-characters-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        Dirs { active: root.join("campaigns"), archived: root.join("archived-campaigns") }
    }

    fn campaign(root: &Path, id: &str) {
        write_atomic(&root.join(id).join("campaign.json"), "{}").unwrap();
    }

    fn character(root: &Path, campaign: &str, id: &str, value: serde_json::Value) {
        write_atomic(&root.join(campaign).join(FOLDER).join(format!("{id}.json")), &value.to_string()).unwrap();
    }

    #[test]
    fn no_folders_means_no_characters() {
        let list = list(&temp_dirs("none")).unwrap();
        assert!(list.characters.is_empty() && list.unreadable.is_empty());
    }

    #[test]
    fn lists_active_and_archived_characters_by_name() {
        let dirs = temp_dirs("list");
        campaign(&dirs.active, "a");
        campaign(&dirs.active, "empty");
        campaign(&dirs.archived, "old");
        character(&dirs.active, "a", "c1", json!({ "id": "c1", "name": "Thalia", "classes": [
            { "name": "Fighter", "source": "XPHB", "level": 3, "subclass": { "name": "Champion", "shortName": "Champion", "source": "XPHB" } },
            { "name": "Wizard", "source": "XPHB", "level": 2 } ] }));
        character(&dirs.archived, "old", "c2", json!({ "id": "c2", "name": "brom" }));
        let list = list(&dirs).unwrap();
        let rows: Vec<_> = list.characters.iter().map(|c| (c.name.as_str(), c.campaign_id.as_str(), c.archived)).collect();
        assert_eq!(rows, [("brom", "old", true), ("Thalia", "a", false)]);
        assert_eq!(list.characters[1].classes.len(), 2);
        assert_eq!(list.characters[1].classes[0].subclass.as_ref().unwrap().short_name, "Champion");
    }

    #[test]
    fn unreadable_files_are_reported_and_left_alone() {
        let dirs = temp_dirs("unreadable");
        campaign(&dirs.active, "a");
        write_atomic(&dirs.active.join("a").join(FOLDER).join("bad.json"), "{ not json").unwrap();
        let list = list(&dirs).unwrap();
        assert_eq!(list.unreadable, ["a/characters/bad.json"]);
        assert!(dirs.active.join("a").join(FOLDER).join("bad.json").exists());
    }

    #[test]
    fn copy_gets_a_new_id_and_keeps_everything_else() {
        let dirs = temp_dirs("copy");
        campaign(&dirs.archived, "old");
        campaign(&dirs.active, "new");
        character(&dirs.archived, "old", "c1", json!({ "id": "c1", "name": "Thalia", "notes": "keep me" }));
        let copied = copy(&dirs, "old", "c1", "new", 255).unwrap();
        assert_eq!((copied.id.as_str(), copied.campaign_id.as_str()), ("ff", "new"));
        let text = fs::read_to_string(dirs.active.join("new").join(FOLDER).join("ff.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!((value["id"].as_str(), value["notes"].as_str()), (Some("ff"), Some("keep me")));
        assert!(dirs.archived.join("old").join(FOLDER).join("c1.json").exists());
        assert_eq!(copy(&dirs, "old", "c1", "new", 255).unwrap().id, "ff-2");
    }

    #[test]
    fn copy_refuses_bad_targets_and_path_tricks() {
        let dirs = temp_dirs("refuse");
        campaign(&dirs.active, "a");
        campaign(&dirs.active, "b");
        campaign(&dirs.archived, "old");
        character(&dirs.active, "a", "c1", json!({ "id": "c1", "name": "Thalia" }));
        assert!(matches!(copy(&dirs, "a", "c1", "a", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(copy(&dirs, "a", "c1", "old", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(copy(&dirs, "a", "missing", "b", 1), Err(StorageError::NotFound(_))));
        assert!(matches!(copy(&dirs, "a", "../c1", "b", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(copy(&dirs, "..", "c1", "b", 1), Err(StorageError::Invalid(_))));
    }
}
