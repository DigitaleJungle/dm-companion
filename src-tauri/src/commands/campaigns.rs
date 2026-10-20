//! Campaigns: one folder per campaign, described by `campaign.json`.
//! Active campaigns live in `<app data>/campaigns/<id>/`. Archiving moves the folder to
//! `<app data>/archived-campaigns/<id>/`, where it can be restored or, only from there, deleted for good.

use crate::storage::{to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "campaign.json";
const MAX_NAME_LEN: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Campaign {
    pub id: String,
    pub name: String,
    /// Milliseconds since the Unix epoch.
    pub created_at: u64,
    pub last_opened_at: u64,
    /// Sourcebooks (rules sources) this campaign uses. Empty for new campaigns and older files.
    #[serde(default)]
    pub sources: Vec<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignList {
    /// Most recently opened first.
    pub campaigns: Vec<Campaign>,
    pub archived: Vec<Campaign>,
    /// Folders whose campaign.json could not be read. They are left untouched.
    pub unreadable: Vec<String>,
}

/// Where active and archived campaign folders live.
pub struct Dirs {
    pub active: PathBuf,
    pub archived: PathBuf,
}

// Ids become folder names, so only allow characters that can't escape the campaigns folders.
pub(crate) fn check_id(id: &str) -> Result<(), StorageError> {
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        Ok(())
    } else {
        Err(StorageError::Invalid(format!("\"{id}\" is not a campaign id.")))
    }
}

fn read(dir: &Path) -> Result<Campaign, StorageError> {
    let text = fs::read_to_string(dir.join(FILE_NAME)).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => StorageError::NotFound("That campaign doesn't exist.".into()),
        _ => e.into(),
    })?;
    serde_json::from_str(&text).map_err(|e| StorageError::Corrupt(e.to_string()))
}

/// Campaigns in one folder, most recently opened first, plus the names of folders that couldn't be read.
fn read_all(root: &Path) -> Result<(Vec<Campaign>, Vec<String>), StorageError> {
    let (mut campaigns, mut unreadable) = (vec![], vec![]);
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok((campaigns, unreadable)),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        match read(&entry.path()) {
            Ok(campaign) => campaigns.push(campaign),
            Err(_) => unreadable.push(entry.file_name().to_string_lossy().into_owned()),
        }
    }
    campaigns.sort_by_key(|c| std::cmp::Reverse(c.last_opened_at));
    Ok((campaigns, unreadable))
}

pub fn list(dirs: &Dirs) -> Result<CampaignList, StorageError> {
    let (campaigns, mut unreadable) = read_all(&dirs.active)?;
    let (archived, unreadable_archived) = read_all(&dirs.archived)?;
    unreadable.extend(unreadable_archived.into_iter().map(|name| format!("archived/{name}")));
    Ok(CampaignList { campaigns, archived, unreadable })
}

/// Trimmed, non-empty, not too long, and unique among active and archived campaigns (ignoring case).
fn check_name(dirs: &Dirs, name: &str, except_id: Option<&str>) -> Result<String, StorageError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(StorageError::Invalid("The campaign needs a name.".into()));
    }
    if name.chars().count() > MAX_NAME_LEN {
        return Err(StorageError::Invalid(format!("Keep the name under {MAX_NAME_LEN} characters.")));
    }
    let all = list(dirs)?;
    let taken = all.campaigns.iter().chain(&all.archived).any(|c| Some(c.id.as_str()) != except_id && c.name.to_lowercase() == name.to_lowercase());
    if taken {
        return Err(StorageError::Invalid(format!("A campaign called \"{name}\" already exists (or is archived).")));
    }
    Ok(name.to_string())
}

pub fn create(dirs: &Dirs, name: &str, now: u64) -> Result<Campaign, StorageError> {
    let name = check_name(dirs, name, None)?;
    let base = format!("{now:x}");
    let mut id = base.clone();
    let mut n = 1;
    while dirs.active.join(&id).exists() || dirs.archived.join(&id).exists() {
        n += 1;
        id = format!("{base}-{n}");
    }
    let campaign = Campaign { id: id.clone(), name, created_at: now, last_opened_at: now, sources: vec![] };
    write_atomic(&dirs.active.join(&id).join(FILE_NAME), &to_json(&campaign)?)?;
    Ok(campaign)
}

/// Loads an active campaign and records that it was opened now.
pub fn open(dirs: &Dirs, id: &str, now: u64) -> Result<Campaign, StorageError> {
    check_id(id)?;
    let dir = dirs.active.join(id);
    let mut campaign = read(&dir)?;
    campaign.last_opened_at = now;
    write_atomic(&dir.join(FILE_NAME), &to_json(&campaign)?)?;
    Ok(campaign)
}

pub fn rename(dirs: &Dirs, id: &str, name: &str) -> Result<Campaign, StorageError> {
    check_id(id)?;
    let dir = dirs.active.join(id);
    let mut campaign = read(&dir)?;
    campaign.name = check_name(dirs, name, Some(id))?;
    write_atomic(&dir.join(FILE_NAME), &to_json(&campaign)?)?;
    Ok(campaign)
}

/// Moves a campaign folder between the active and archived folders. A rename is atomic on one disk.
fn move_folder(from_root: &Path, to_root: &Path, id: &str) -> Result<(), StorageError> {
    check_id(id)?;
    let from = from_root.join(id);
    read(&from)?; // only move folders that really are campaigns
    let to = to_root.join(id);
    if to.exists() {
        return Err(StorageError::Invalid(format!("Another campaign folder called \"{id}\" is in the way.")));
    }
    fs::create_dir_all(to_root)?;
    fs::rename(&from, &to)?;
    Ok(())
}

pub fn archive(dirs: &Dirs, id: &str) -> Result<(), StorageError> {
    move_folder(&dirs.active, &dirs.archived, id)
}

pub fn restore(dirs: &Dirs, id: &str) -> Result<(), StorageError> {
    move_folder(&dirs.archived, &dirs.active, id)
}

/// Sets the sourcebooks an active campaign uses. Source ids are short plain identifiers like "XPHB".
pub fn set_sources(dirs: &Dirs, id: &str, sources: &[String]) -> Result<Campaign, StorageError> {
    check_id(id)?;
    let mut clean: Vec<String> = vec![];
    for source in sources {
        let valid = !source.is_empty() && source.len() <= 32 && source.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid {
            return Err(StorageError::Invalid(format!("\"{source}\" is not a source id.")));
        }
        if !clean.iter().any(|s| s.eq_ignore_ascii_case(source)) {
            clean.push(source.clone());
        }
    }
    let dir = dirs.active.join(id);
    let mut campaign = read(&dir)?;
    campaign.sources = clean;
    write_atomic(&dir.join(FILE_NAME), &to_json(&campaign)?)?;
    Ok(campaign)
}

/// Permanently deletes a campaign and all its data, whether it is active or archived.
pub fn delete(dirs: &Dirs, id: &str) -> Result<(), StorageError> {
    check_id(id)?;
    let dir = [&dirs.active, &dirs.archived]
        .into_iter()
        .map(|root| root.join(id))
        .find(|dir| dir.join(FILE_NAME).exists())
        .ok_or_else(|| StorageError::NotFound("That campaign doesn't exist.".into()))?;
    fs::remove_dir_all(dir)?;
    Ok(())
}

fn dirs(app: &AppHandle) -> Result<Dirs, StorageError> {
    let data = app.path().app_data_dir().map_err(|e| StorageError::Io(e.to_string()))?;
    Ok(Dirs { active: data.join("campaigns"), archived: data.join("archived-campaigns") })
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[tauri::command]
pub async fn list_campaigns(app: AppHandle) -> Result<CampaignList, StorageError> {
    list(&dirs(&app)?)
}

#[tauri::command]
pub async fn create_campaign(app: AppHandle, name: String) -> Result<Campaign, StorageError> {
    create(&dirs(&app)?, &name, now_ms())
}

#[tauri::command]
pub async fn open_campaign(app: AppHandle, id: String) -> Result<Campaign, StorageError> {
    open(&dirs(&app)?, &id, now_ms())
}

#[tauri::command]
pub async fn rename_campaign(app: AppHandle, id: String, name: String) -> Result<Campaign, StorageError> {
    rename(&dirs(&app)?, &id, &name)
}

#[tauri::command]
pub async fn archive_campaign(app: AppHandle, id: String) -> Result<(), StorageError> {
    archive(&dirs(&app)?, &id)
}

#[tauri::command]
pub async fn restore_campaign(app: AppHandle, id: String) -> Result<(), StorageError> {
    restore(&dirs(&app)?, &id)
}

#[tauri::command]
pub async fn set_campaign_sources(app: AppHandle, id: String, sources: Vec<String>) -> Result<Campaign, StorageError> {
    set_sources(&dirs(&app)?, &id, &sources)
}

#[tauri::command]
pub async fn delete_campaign(app: AppHandle, id: String) -> Result<(), StorageError> {
    delete(&dirs(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dirs(name: &str) -> Dirs {
        let root = std::env::temp_dir().join(format!("dmc-campaigns-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        Dirs { active: root.join("campaigns"), archived: root.join("archived-campaigns") }
    }

    #[test]
    fn no_folders_means_no_campaigns() {
        let list = list(&temp_dirs("none")).unwrap();
        assert!(list.campaigns.is_empty() && list.archived.is_empty() && list.unreadable.is_empty());
    }

    #[test]
    fn create_trims_the_name_and_lists_most_recently_opened_first() {
        let dirs = temp_dirs("order");
        let a = create(&dirs, "  Shadows over Thornwood ", 1_000).unwrap();
        let b = create(&dirs, "Curse of Strahd", 2_000).unwrap();
        assert_eq!(a.name, "Shadows over Thornwood");
        assert_eq!(list(&dirs).unwrap().campaigns, vec![b, a.clone()]);

        assert_eq!(open(&dirs, &a.id, 3_000).unwrap().last_opened_at, 3_000);
        assert_eq!(list(&dirs).unwrap().campaigns[0].id, a.id);
    }

    #[test]
    fn rejects_empty_too_long_and_duplicate_names() {
        let dirs = temp_dirs("names");
        assert!(matches!(create(&dirs, "   ", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(create(&dirs, &"x".repeat(MAX_NAME_LEN + 1), 1), Err(StorageError::Invalid(_))));
        create(&dirs, "Thornwood", 1).unwrap();
        assert!(matches!(create(&dirs, "thornwood", 2), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn same_timestamp_still_gets_unique_ids() {
        let dirs = temp_dirs("ids");
        assert_ne!(create(&dirs, "One", 42).unwrap().id, create(&dirs, "Two", 42).unwrap().id);
    }

    #[test]
    fn rejects_path_tricks_and_unknown_ids() {
        let dirs = temp_dirs("ids-bad");
        assert!(matches!(open(&dirs, "../escape", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(open(&dirs, "", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(open(&dirs, "abc", 1), Err(StorageError::NotFound(_))));
        assert!(matches!(archive(&dirs, "../x"), Err(StorageError::Invalid(_))));
        assert!(matches!(delete(&dirs, "..\\x"), Err(StorageError::Invalid(_))));
        assert!(matches!(set_sources(&dirs, "../x", &[]), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn rename_keeps_the_id_and_checks_the_name() {
        let dirs = temp_dirs("rename");
        let a = create(&dirs, "Thornwood", 1).unwrap();
        create(&dirs, "Strahd", 2).unwrap();
        let renamed = rename(&dirs, &a.id, " Shadows over Thornwood ").unwrap();
        assert_eq!((renamed.id.as_str(), renamed.name.as_str()), (a.id.as_str(), "Shadows over Thornwood"));
        assert_eq!(open(&dirs, &a.id, 3).unwrap().name, "Shadows over Thornwood");
        assert!(matches!(rename(&dirs, &a.id, "strahd"), Err(StorageError::Invalid(_))));
        // Renaming to its own name (different case) is fine.
        assert!(rename(&dirs, &a.id, "SHADOWS over thornwood").is_ok());
    }

    #[test]
    fn archive_and_restore_move_the_folder_with_its_data() {
        let dirs = temp_dirs("archive");
        let a = create(&dirs, "Thornwood", 1).unwrap();
        fs::write(dirs.active.join(&a.id).join("notes.txt"), "the mill burned").unwrap();

        archive(&dirs, &a.id).unwrap();
        let after = list(&dirs).unwrap();
        assert!(after.campaigns.is_empty());
        assert_eq!(after.archived, vec![a.clone()]);
        assert!(matches!(open(&dirs, &a.id, 2), Err(StorageError::NotFound(_))));
        // An archived name still counts as taken.
        assert!(matches!(create(&dirs, "Thornwood", 3), Err(StorageError::Invalid(_))));

        restore(&dirs, &a.id).unwrap();
        assert_eq!(list(&dirs).unwrap().campaigns, vec![a.clone()]);
        assert_eq!(fs::read_to_string(dirs.active.join(&a.id).join("notes.txt")).unwrap(), "the mill burned");
    }

    #[test]
    fn deletes_active_and_archived_campaigns() {
        let dirs = temp_dirs("delete");
        let active = create(&dirs, "Thornwood", 1).unwrap();
        let archived = create(&dirs, "Strahd", 2).unwrap();
        archive(&dirs, &archived.id).unwrap();

        delete(&dirs, &active.id).unwrap();
        delete(&dirs, &archived.id).unwrap();
        assert!(!dirs.active.join(&active.id).exists() && !dirs.archived.join(&archived.id).exists());
        assert!(matches!(delete(&dirs, &active.id), Err(StorageError::NotFound(_))));
        let list = list(&dirs).unwrap();
        assert!(list.campaigns.is_empty() && list.archived.is_empty());
    }

    #[test]
    fn sources_start_empty_and_can_be_set() {
        let dirs = temp_dirs("sources");
        let a = create(&dirs, "Thornwood", 1).unwrap();
        assert!(a.sources.is_empty());
        let set = set_sources(&dirs, &a.id, &["XPHB".into(), "XDMG".into(), "xphb".into()]).unwrap();
        assert_eq!(set.sources, vec!["XPHB".to_string(), "XDMG".to_string()]); // duplicates dropped
        assert_eq!(open(&dirs, &a.id, 2).unwrap().sources, set.sources);
        assert!(matches!(set_sources(&dirs, &a.id, &["../etc".into()]), Err(StorageError::Invalid(_))));
        // Archived campaigns can't be changed until restored.
        let b = create(&dirs, "Strahd", 3).unwrap();
        archive(&dirs, &b.id).unwrap();
        assert!(matches!(set_sources(&dirs, &b.id, &["XPHB".into()]), Err(StorageError::NotFound(_))));
        // Files from before this field load with no sources.
        fs::write(dirs.active.join(&a.id).join(FILE_NAME), r#"{"id":"x","name":"Old","createdAt":1,"lastOpenedAt":1}"#).unwrap();
        assert!(read(&dirs.active.join(&a.id)).unwrap().sources.is_empty());
    }

    #[test]
    fn unreadable_campaigns_are_reported_and_left_alone() {
        let dirs = temp_dirs("corrupt");
        create(&dirs, "Good", 1).unwrap();
        fs::create_dir_all(dirs.active.join("broken")).unwrap();
        fs::write(dirs.active.join("broken").join(FILE_NAME), "{ nope").unwrap();

        let list = list(&dirs).unwrap();
        assert_eq!(list.campaigns.len(), 1);
        assert_eq!(list.unreadable, vec!["broken".to_string()]);
        assert!(matches!(open(&dirs, "broken", 2), Err(StorageError::Corrupt(_))));
        assert!(matches!(archive(&dirs, "broken"), Err(StorageError::Corrupt(_))));
        assert_eq!(fs::read_to_string(dirs.active.join("broken").join(FILE_NAME)).unwrap(), "{ nope");
    }
}
