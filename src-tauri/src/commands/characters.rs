//! Characters: one file per character. A character in a campaign lives in that campaign's folder,
//! `<campaign folder>/characters/<id>.json`; one without a campaign lives in `<app data>/characters/<id>.json`.
//! Fields this module doesn't know are kept as they are.

use super::campaigns::{check_id, now_ms, Dirs};
use crate::storage::{write_atomic_bytes, to_json, write_atomic, StorageError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const FOLDER: &str = "characters";
const MAX_NAME_LEN: usize = 100;

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
    #[serde(default)]
    avatar: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterCard {
    /// None for a character without a campaign.
    pub campaign_id: Option<String>,
    pub archived: bool,
    pub id: String,
    pub name: String,
    pub classes: Vec<ClassLevel>,
    /// The character's own picture, as a `data:image/…` URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
}

/// An avatar is a small picture kept in the file itself (the app downsizes it first); anything else is refused.
const MAX_AVATAR_LEN: usize = 512 * 1024;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterList {
    /// Sorted by name.
    pub characters: Vec<CharacterCard>,
    /// Files that couldn't be read, as "<campaign id>/characters/<file>" or "characters/<file>". They are left untouched.
    pub unreadable: Vec<String>,
}

/// Where characters live: the campaign folders, plus the folder for characters without a campaign.
pub struct Places {
    pub campaigns: Dirs,
    pub loose: PathBuf,
}

fn read_folder(folder: &Path, campaign_id: Option<&str>, archived: bool, list: &mut CharacterList) -> Result<(), StorageError> {
    let files = match fs::read_dir(folder) {
        Ok(files) => files,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for file in files {
        let path = file?.path();
        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let parsed = fs::read_to_string(&path).ok().and_then(|text| serde_json::from_str::<Summary>(&text).ok());
        match parsed {
            Some(c) => list.characters.push(CharacterCard { campaign_id: campaign_id.map(str::to_string), archived, id: c.id, name: c.name, classes: c.classes, avatar: c.avatar }),
            None => {
                let file = path.file_name().unwrap_or_default().to_string_lossy();
                list.unreadable.push(match campaign_id {
                    Some(id) => format!("{id}/{FOLDER}/{file}"),
                    None => format!("{FOLDER}/{file}"),
                });
            }
        }
    }
    Ok(())
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
        read_folder(&campaign.path().join(FOLDER), Some(&campaign_id), archived, list)?;
    }
    Ok(())
}

pub fn list(places: &Places) -> Result<CharacterList, StorageError> {
    let mut list = CharacterList { characters: vec![], unreadable: vec![] };
    read_campaigns(&places.campaigns.active, false, &mut list)?;
    read_campaigns(&places.campaigns.archived, true, &mut list)?;
    read_folder(&places.loose, None, false, &mut list)?;
    list.characters.sort_by_key(|c| c.name.to_lowercase());
    Ok(list)
}

/// The characters folder of an active campaign, or the app-wide one for no campaign.
fn target_folder(places: &Places, campaign: Option<&str>) -> Result<PathBuf, StorageError> {
    let Some(campaign) = campaign else { return Ok(places.loose.clone()) };
    check_id(campaign)?;
    let dir = places.campaigns.active.join(campaign);
    if !dir.join("campaign.json").exists() {
        return Err(StorageError::Invalid("Characters can only be added to an active campaign.".into()));
    }
    Ok(dir.join(FOLDER))
}

/// Writes `value` under a fresh id (derived from `now`) into `folder` and returns its card.
fn write_new(folder: &Path, campaign: Option<&str>, mut value: Value, now: u64) -> Result<CharacterCard, StorageError> {
    let base = format!("{now:x}");
    let mut id = base.clone();
    let mut n = 1;
    while folder.join(format!("{id}.json")).exists() {
        n += 1;
        id = format!("{base}-{n}");
    }
    value["id"] = Value::String(id.clone());
    let summary: Summary = serde_json::from_value(value.clone()).map_err(|e| StorageError::Invalid(format!("The character is incomplete: {e}")))?;
    write_atomic(&folder.join(format!("{id}.json")), &to_json(&value)?)?;
    Ok(CharacterCard { campaign_id: campaign.map(str::to_string), archived: false, id, name: summary.name, classes: summary.classes, avatar: summary.avatar })
}

/// The character's fields with a trimmed, valid name, or why it can't be saved.
fn checked_fields(character: &mut Value) -> Result<&mut serde_json::Map<String, Value>, StorageError> {
    let Some(fields) = character.as_object_mut() else {
        return Err(StorageError::Invalid("The character is incomplete.".into()));
    };
    let name = fields.get("name").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if name.is_empty() {
        return Err(StorageError::Invalid("The character needs a name.".into()));
    }
    if name.chars().count() > MAX_NAME_LEN {
        return Err(StorageError::Invalid(format!("Keep the name under {MAX_NAME_LEN} characters.")));
    }
    fields.insert("name".into(), Value::String(name));
    match fields.get("avatar") {
        None | Some(Value::Null) => {}
        Some(Value::String(a)) if a.starts_with("data:image/") && a.len() <= MAX_AVATAR_LEN => {}
        Some(_) => return Err(StorageError::Invalid("The avatar must be a picture of at most 512 KB.".into())),
    }
    Ok(fields)
}

/// Saves a new character in an active campaign, or without a campaign. Its id and creation time are set here.
pub fn create(places: &Places, campaign: Option<&str>, mut character: Value, now: u64) -> Result<CharacterCard, StorageError> {
    checked_fields(&mut character)?.insert("createdAt".into(), Value::from(now));
    let folder = target_folder(places, campaign)?;
    write_new(&folder, campaign, character, now)
}

/// An existing character's file, and whether it sits in an archived campaign.
fn existing_file(places: &Places, campaign: Option<&str>, id: &str) -> Result<(PathBuf, bool), StorageError> {
    check_id(id)?;
    let file = format!("{id}.json");
    let found = match campaign {
        Some(campaign) => {
            check_id(campaign)?;
            let dirs = &places.campaigns;
            [(&dirs.active, false), (&dirs.archived, true)]
                .into_iter()
                .map(|(root, archived)| (root.join(campaign).join(FOLDER).join(&file), archived))
                .find(|(path, _)| path.exists())
        }
        None => Some((places.loose.join(&file), false)).filter(|(path, _)| path.exists()),
    };
    found.ok_or_else(|| StorageError::NotFound("That character doesn't exist.".into()))
}

fn read_value(path: &Path) -> Result<Value, StorageError> {
    serde_json::from_str(&fs::read_to_string(path)?).map_err(|e| StorageError::Corrupt(e.to_string()))
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterFile {
    /// In an archived campaign: shown, but not saved until the campaign is restored.
    pub archived: bool,
    pub character: Value,
}

pub fn get(places: &Places, campaign: Option<&str>, id: &str) -> Result<CharacterFile, StorageError> {
    let (path, archived) = existing_file(places, campaign, id)?;
    Ok(CharacterFile { archived, character: read_value(&path)? })
}

/// Replaces an existing character. Its id and creation time always come from the file on disk.
pub fn save(places: &Places, campaign: Option<&str>, id: &str, mut character: Value) -> Result<CharacterCard, StorageError> {
    let (path, archived) = existing_file(places, campaign, id)?;
    if archived {
        return Err(StorageError::Invalid("This character's campaign is archived. Restore the campaign to change the character.".into()));
    }
    let on_disk = read_value(&path)?;
    let fields = checked_fields(&mut character)?;
    fields.insert("id".into(), Value::String(id.to_string()));
    match on_disk.get("createdAt") {
        Some(created) => fields.insert("createdAt".into(), created.clone()),
        None => fields.remove("createdAt"),
    };
    let summary: Summary = serde_json::from_value(character.clone()).map_err(|e| StorageError::Invalid(format!("The character is incomplete: {e}")))?;
    write_atomic(&path, &to_json(&character)?)?;
    Ok(CharacterCard { campaign_id: campaign.map(str::to_string), archived: false, id: summary.id, name: summary.name, classes: summary.classes, avatar: summary.avatar })
}

/// Permanently deletes a character. Characters in an archived campaign stay as they are until it's restored.
pub fn delete(places: &Places, campaign: Option<&str>, id: &str) -> Result<(), StorageError> {
    let (path, archived) = existing_file(places, campaign, id)?;
    if archived {
        return Err(StorageError::Invalid("This character's campaign is archived. Restore the campaign to delete the character.".into()));
    }
    for avatar in avatar_files(&path) {
        fs::remove_file(avatar)?;
    }
    fs::remove_file(path)?;
    Ok(())
}

// --- The original avatar picture: `<id>.avatar.<ext>` next to the character's file -------------------------

const AVATAR_TYPES: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];
const MAX_AVATAR_FILE: usize = 20 * 1024 * 1024;

/// The original pictures saved for the character whose file is `json` (at most one, in practice).
fn avatar_files(json: &Path) -> Vec<PathBuf> {
    let (Some(dir), Some(id)) = (json.parent(), json.file_stem().and_then(|s| s.to_str())) else { return Vec::new() };
    AVATAR_TYPES.iter().map(|ext| dir.join(format!("{id}.avatar.{ext}"))).filter(|p| p.exists()).collect()
}

/// Where the character's original picture is, if it has one.
pub fn avatar_path(places: &Places, campaign: Option<&str>, id: &str) -> Result<Option<PathBuf>, StorageError> {
    let (path, _) = existing_file(places, campaign, id)?;
    Ok(avatar_files(&path).into_iter().next())
}

/// Keeps the original of the character's picture (the file keeps only a small copy), replacing any earlier one.
pub fn save_avatar(places: &Places, campaign: Option<&str>, id: &str, bytes: &[u8], ext: &str) -> Result<PathBuf, StorageError> {
    let (path, archived) = existing_file(places, campaign, id)?;
    if archived {
        return Err(StorageError::Invalid("This character's campaign is archived. Restore the campaign to change the character.".into()));
    }
    let ext = ext.to_ascii_lowercase();
    if !AVATAR_TYPES.contains(&ext.as_str()) {
        return Err(StorageError::Invalid("Use a PNG, JPG, WebP or GIF picture.".into()));
    }
    if bytes.is_empty() || bytes.len() > MAX_AVATAR_FILE {
        return Err(StorageError::Invalid("The picture must be at most 20 MB.".into()));
    }
    for old in avatar_files(&path) {
        fs::remove_file(old)?;
    }
    let target = path.with_file_name(format!("{id}.avatar.{ext}"));
    write_atomic_bytes(&target, bytes)?;
    Ok(target)
}

pub fn remove_avatar(places: &Places, campaign: Option<&str>, id: &str) -> Result<(), StorageError> {
    let (path, archived) = existing_file(places, campaign, id)?;
    if archived {
        return Err(StorageError::Invalid("This character's campaign is archived. Restore the campaign to change the character.".into()));
    }
    for old in avatar_files(&path) {
        fs::remove_file(old)?;
    }
    Ok(())
}

/// Copies a character (from an active or archived campaign, or from no campaign) into another active campaign, under a new id.
pub fn copy(places: &Places, from_campaign: Option<&str>, id: &str, to_campaign: &str, now: u64) -> Result<CharacterCard, StorageError> {
    check_id(id)?;
    if from_campaign == Some(to_campaign) {
        return Err(StorageError::Invalid("The character is already in that campaign.".into()));
    }
    let folder = target_folder(places, Some(to_campaign))?;
    let (source, _) = existing_file(places, from_campaign, id)?;
    let card = write_new(&folder, Some(to_campaign), read_value(&source)?, now)?;
    // The copy gets its own copy of the original picture.
    if let Some(avatar) = avatar_files(&source).into_iter().next() {
        let ext = avatar.extension().and_then(|e| e.to_str()).unwrap_or("png");
        fs::copy(&avatar, folder.join(format!("{}.avatar.{ext}", card.id)))?;
    }
    Ok(card)
}

fn places(app: &AppHandle) -> Result<Places, StorageError> {
    let data = app.path().app_data_dir().map_err(|e| StorageError::Io(e.to_string()))?;
    Ok(Places { campaigns: Dirs { active: data.join("campaigns"), archived: data.join("archived-campaigns") }, loose: data.join(FOLDER) })
}

#[tauri::command]
pub async fn list_characters(app: AppHandle) -> Result<CharacterList, StorageError> {
    list(&places(&app)?)
}

#[tauri::command]
pub async fn create_character(app: AppHandle, campaign: Option<String>, character: Value) -> Result<CharacterCard, StorageError> {
    create(&places(&app)?, campaign.as_deref(), character, now_ms())
}

#[tauri::command]
pub async fn get_character(app: AppHandle, campaign: Option<String>, id: String) -> Result<CharacterFile, StorageError> {
    get(&places(&app)?, campaign.as_deref(), &id)
}

#[tauri::command]
pub async fn save_character(app: AppHandle, campaign: Option<String>, id: String, character: Value) -> Result<CharacterCard, StorageError> {
    save(&places(&app)?, campaign.as_deref(), &id, character)
}

#[tauri::command]
pub async fn delete_character(app: AppHandle, campaign: Option<String>, id: String) -> Result<(), StorageError> {
    delete(&places(&app)?, campaign.as_deref(), &id)
}

#[tauri::command]
pub async fn copy_character(app: AppHandle, from_campaign: Option<String>, id: String, to_campaign: String) -> Result<CharacterCard, StorageError> {
    copy(&places(&app)?, from_campaign.as_deref(), &id, &to_campaign, now_ms())
}

/// Where the character's original picture is, as a path the window can show through the asset protocol.
#[tauri::command]
pub async fn character_avatar(app: AppHandle, campaign: Option<String>, id: String) -> Result<Option<String>, StorageError> {
    Ok(avatar_path(&places(&app)?, campaign.as_deref(), &id)?.map(|p| p.to_string_lossy().into_owned()))
}

/// Saves the original picture. The body is the raw bytes (pictures are too big for JSON); `campaign` (empty for
/// none), `id` and `ext` come as headers.
#[tauri::command]
pub async fn save_character_avatar(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, StorageError> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(StorageError::Invalid("The picture didn't arrive.".into()));
    };
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let campaign = Some(header("campaign")).filter(|c| !c.is_empty());
    let path = save_avatar(&places(&app)?, campaign.as_deref(), &header("id"), bytes, &header("ext"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn remove_character_avatar(app: AppHandle, campaign: Option<String>, id: String) -> Result<(), StorageError> {
    remove_avatar(&places(&app)?, campaign.as_deref(), &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_places(name: &str) -> Places {
        let root = std::env::temp_dir().join(format!("dmc-characters-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        Places { campaigns: Dirs { active: root.join("campaigns"), archived: root.join("archived-campaigns") }, loose: root.join(FOLDER) }
    }

    fn campaign(root: &Path, id: &str) {
        write_atomic(&root.join(id).join("campaign.json"), "{}").unwrap();
    }

    fn character(folder: &Path, id: &str, value: Value) {
        write_atomic(&folder.join(format!("{id}.json")), &value.to_string()).unwrap();
    }

    fn read(path: PathBuf) -> Value {
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn no_folders_means_no_characters() {
        let list = list(&temp_places("none")).unwrap();
        assert!(list.characters.is_empty() && list.unreadable.is_empty());
    }

    #[test]
    fn lists_active_archived_and_campaignless_characters_by_name() {
        let p = temp_places("list");
        campaign(&p.campaigns.active, "a");
        campaign(&p.campaigns.active, "empty");
        campaign(&p.campaigns.archived, "old");
        character(&p.campaigns.active.join("a").join(FOLDER), "c1", json!({ "id": "c1", "name": "Thalia", "classes": [
            { "name": "Fighter", "source": "XPHB", "level": 3, "subclass": { "name": "Champion", "shortName": "Champion", "source": "XPHB" } },
            { "name": "Wizard", "source": "XPHB", "level": 2 } ] }));
        character(&p.campaigns.archived.join("old").join(FOLDER), "c2", json!({ "id": "c2", "name": "brom" }));
        character(&p.loose, "c3", json!({ "id": "c3", "name": "Mira" }));
        let list = list(&p).unwrap();
        let rows: Vec<_> = list.characters.iter().map(|c| (c.name.as_str(), c.campaign_id.as_deref(), c.archived)).collect();
        assert_eq!(rows, [("brom", Some("old"), true), ("Mira", None, false), ("Thalia", Some("a"), false)]);
        assert_eq!(list.characters[2].classes.len(), 2);
        assert_eq!(list.characters[2].classes[0].subclass.as_ref().unwrap().short_name, "Champion");
    }

    #[test]
    fn unreadable_files_are_reported_and_left_alone() {
        let p = temp_places("unreadable");
        campaign(&p.campaigns.active, "a");
        write_atomic(&p.campaigns.active.join("a").join(FOLDER).join("bad.json"), "{ not json").unwrap();
        write_atomic(&p.loose.join("worse.json"), "[]").unwrap();
        let list = list(&p).unwrap();
        assert_eq!(list.unreadable, ["a/characters/bad.json", "characters/worse.json"]);
        assert!(p.campaigns.active.join("a").join(FOLDER).join("bad.json").exists());
    }

    #[test]
    fn create_saves_in_a_campaign_or_without_one() {
        let p = temp_places("create");
        campaign(&p.campaigns.active, "a");
        let thalia = json!({ "name": "  Thalia ", "player": "Sam", "classes": [{ "name": "Fighter", "source": "XPHB", "level": 1 }] });
        let card = create(&p, Some("a"), thalia, 255).unwrap();
        assert_eq!((card.id.as_str(), card.campaign_id.as_deref(), card.name.as_str()), ("ff", Some("a"), "Thalia"));
        let saved = read(p.campaigns.active.join("a").join(FOLDER).join("ff.json"));
        assert_eq!((saved["id"].as_str(), saved["player"].as_str(), saved["createdAt"].as_u64()), (Some("ff"), Some("Sam"), Some(255)));

        let loose = create(&p, None, json!({ "name": "Mira" }), 255).unwrap();
        assert_eq!(loose.campaign_id, None);
        assert!(p.loose.join("ff.json").exists());
        assert_eq!(create(&p, None, json!({ "name": "Mira" }), 255).unwrap().id, "ff-2");
    }

    #[test]
    fn create_checks_the_name_campaign_and_shape() {
        let p = temp_places("create-bad");
        campaign(&p.campaigns.archived, "old");
        assert!(matches!(create(&p, None, json!({ "name": " " }), 1), Err(StorageError::Invalid(_))));
        assert!(matches!(create(&p, None, json!({ "name": "x".repeat(101) }), 1), Err(StorageError::Invalid(_))));
        assert!(matches!(create(&p, None, json!(["Thalia"]), 1), Err(StorageError::Invalid(_))));
        assert!(matches!(create(&p, None, json!({ "name": "T", "classes": "Fighter" }), 1), Err(StorageError::Invalid(_))));
        assert!(matches!(create(&p, Some("old"), json!({ "name": "T" }), 1), Err(StorageError::Invalid(_))));
        assert!(matches!(create(&p, Some("../x"), json!({ "name": "T" }), 1), Err(StorageError::Invalid(_))));
        // An avatar must be a small embedded picture.
        assert!(matches!(create(&p, None, json!({ "name": "T", "avatar": "https://example.com/a.png" }), 1), Err(StorageError::Invalid(_))));
        let huge = format!("data:image/webp;base64,{}", "A".repeat(MAX_AVATAR_LEN));
        assert!(matches!(create(&p, None, json!({ "name": "T", "avatar": huge }), 1), Err(StorageError::Invalid(_))));
        assert!(!p.loose.exists());
    }

    #[test]
    fn the_original_picture_is_kept_beside_the_file_and_follows_copy_and_delete() {
        let p = temp_places("avatar-file");
        campaign(&p.campaigns.active, "a");
        let card = create(&p, None, json!({ "name": "Kira" }), 1).unwrap();
        assert_eq!(avatar_path(&p, None, &card.id).unwrap(), None);
        let saved = save_avatar(&p, None, &card.id, b"png bytes", "PNG").unwrap();
        assert_eq!(saved, p.loose.join(format!("{}.avatar.png", card.id)));
        // A new picture replaces the old one, in any of the allowed types only.
        save_avatar(&p, None, &card.id, b"jpg bytes", "jpg").unwrap();
        assert_eq!(avatar_path(&p, None, &card.id).unwrap(), Some(p.loose.join(format!("{}.avatar.jpg", card.id))));
        assert!(!saved.exists());
        assert!(matches!(save_avatar(&p, None, &card.id, b"x", "exe"), Err(StorageError::Invalid(_))));
        assert!(matches!(save_avatar(&p, None, &card.id, b"", "png"), Err(StorageError::Invalid(_))));
        assert!(matches!(save_avatar(&p, None, "../x", b"x", "png"), Err(StorageError::Invalid(_))));

        let copy = copy(&p, None, &card.id, "a", 2).unwrap();
        assert_eq!(fs::read(avatar_path(&p, Some("a"), &copy.id).unwrap().unwrap()).unwrap(), b"jpg bytes");
        delete(&p, None, &card.id).unwrap();
        assert!(fs::read_dir(&p.loose).unwrap().next().is_none());
        remove_avatar(&p, Some("a"), &copy.id).unwrap();
        assert_eq!(avatar_path(&p, Some("a"), &copy.id).unwrap(), None);
    }

    #[test]
    fn the_avatar_comes_with_the_card() {
        let p = temp_places("avatar");
        let card = create(&p, None, json!({ "name": "Kira", "avatar": "data:image/webp;base64,AAAA" }), 1).unwrap();
        assert_eq!(card.avatar.as_deref(), Some("data:image/webp;base64,AAAA"));
        assert_eq!(list(&p).unwrap().characters[0].avatar.as_deref(), Some("data:image/webp;base64,AAAA"));
    }

    #[test]
    fn copy_gets_a_new_id_and_keeps_everything_else() {
        let p = temp_places("copy");
        campaign(&p.campaigns.archived, "old");
        campaign(&p.campaigns.active, "new");
        character(&p.campaigns.archived.join("old").join(FOLDER), "c1", json!({ "id": "c1", "name": "Thalia", "notes": "keep me" }));
        let copied = copy(&p, Some("old"), "c1", "new", 255).unwrap();
        assert_eq!((copied.id.as_str(), copied.campaign_id.as_deref()), ("ff", Some("new")));
        let value = read(p.campaigns.active.join("new").join(FOLDER).join("ff.json"));
        assert_eq!((value["id"].as_str(), value["notes"].as_str()), (Some("ff"), Some("keep me")));
        assert!(p.campaigns.archived.join("old").join(FOLDER).join("c1.json").exists());
        assert_eq!(copy(&p, Some("old"), "c1", "new", 255).unwrap().id, "ff-2");

        character(&p.loose, "m", json!({ "id": "m", "name": "Mira" }));
        assert_eq!(copy(&p, None, "m", "new", 16).unwrap().id, "10");
        assert!(p.loose.join("m.json").exists());
    }

    #[test]
    fn get_and_save_round_trip_keeping_id_and_creation_time() {
        let p = temp_places("save");
        campaign(&p.campaigns.active, "a");
        let card = create(&p, Some("a"), json!({ "name": "Thalia", "hp": { "max": 12 } }), 255).unwrap();
        let mut file = get(&p, Some("a"), &card.id).unwrap();
        assert!(!file.archived);
        file.character["hp"]["current"] = json!(7);
        file.character["id"] = json!("hijack"); // ignored: the id comes from the file on disk
        file.character["createdAt"] = json!(1);
        file.character["name"] = json!(" Thalia the Bold ");
        let saved = save(&p, Some("a"), &card.id, file.character).unwrap();
        assert_eq!((saved.id.as_str(), saved.name.as_str()), ("ff", "Thalia the Bold"));
        let value = read(p.campaigns.active.join("a").join(FOLDER).join("ff.json"));
        assert_eq!((value["id"].as_str(), value["createdAt"].as_u64(), value["hp"]["current"].as_u64()), (Some("ff"), Some(255), Some(7)));
        assert!(!p.campaigns.active.join("a").join(FOLDER).join("hijack.json").exists());

        let loose = create(&p, None, json!({ "name": "Mira" }), 16).unwrap();
        assert_eq!(get(&p, None, &loose.id).unwrap().character["name"], "Mira");
        save(&p, None, &loose.id, json!({ "name": "Mira", "notes": "hi" })).unwrap();
        assert_eq!(read(p.loose.join("10.json"))["notes"], "hi");
    }

    #[test]
    fn save_refuses_archived_unknown_and_invalid_characters() {
        let p = temp_places("save-bad");
        campaign(&p.campaigns.active, "a");
        campaign(&p.campaigns.archived, "old");
        character(&p.campaigns.archived.join("old").join(FOLDER), "c1", json!({ "id": "c1", "name": "Brom" }));
        character(&p.campaigns.active.join("a").join(FOLDER), "c2", json!({ "id": "c2", "name": "Thalia" }));
        // Archived characters can be read but not changed.
        assert!(get(&p, Some("old"), "c1").unwrap().archived);
        assert!(matches!(save(&p, Some("old"), "c1", json!({ "name": "B" })), Err(StorageError::Invalid(_))));
        assert!(matches!(get(&p, Some("a"), "missing"), Err(StorageError::NotFound(_))));
        assert!(matches!(save(&p, None, "c2", json!({ "name": "T" })), Err(StorageError::NotFound(_))));
        assert!(matches!(get(&p, Some("a"), "../c2"), Err(StorageError::Invalid(_))));
        // A bad payload leaves the file as it was.
        assert!(matches!(save(&p, Some("a"), "c2", json!({ "name": " " })), Err(StorageError::Invalid(_))));
        assert!(matches!(save(&p, Some("a"), "c2", json!({ "name": "T", "classes": "Fighter" })), Err(StorageError::Invalid(_))));
        assert_eq!(read(p.campaigns.active.join("a").join(FOLDER).join("c2.json"))["name"], "Thalia");
    }

    #[test]
    fn delete_removes_only_that_character_and_refuses_archived_ones() {
        let p = temp_places("delete");
        campaign(&p.campaigns.active, "a");
        campaign(&p.campaigns.archived, "old");
        let folder = p.campaigns.active.join("a").join(FOLDER);
        character(&folder, "c1", json!({ "id": "c1", "name": "Thalia" }));
        character(&folder, "c2", json!({ "id": "c2", "name": "Brom" }));
        character(&p.loose, "m", json!({ "id": "m", "name": "Mira" }));
        character(&p.campaigns.archived.join("old").join(FOLDER), "o", json!({ "id": "o", "name": "Old" }));

        delete(&p, Some("a"), "c1").unwrap();
        assert!(!folder.join("c1.json").exists() && folder.join("c2.json").exists());
        delete(&p, None, "m").unwrap();
        assert!(!p.loose.join("m.json").exists());

        assert!(matches!(delete(&p, Some("old"), "o"), Err(StorageError::Invalid(_))));
        assert!(p.campaigns.archived.join("old").join(FOLDER).join("o.json").exists());
        assert!(matches!(delete(&p, Some("a"), "c1"), Err(StorageError::NotFound(_))));
        assert!(matches!(delete(&p, Some("a"), "../c2"), Err(StorageError::Invalid(_))));
        assert!(folder.join("c2.json").exists());
    }

    #[test]
    fn copy_refuses_bad_targets_and_path_tricks() {
        let p = temp_places("refuse");
        campaign(&p.campaigns.active, "a");
        campaign(&p.campaigns.active, "b");
        campaign(&p.campaigns.archived, "old");
        character(&p.campaigns.active.join("a").join(FOLDER), "c1", json!({ "id": "c1", "name": "Thalia" }));
        assert!(matches!(copy(&p, Some("a"), "c1", "a", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(copy(&p, Some("a"), "c1", "old", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(copy(&p, Some("a"), "missing", "b", 1), Err(StorageError::NotFound(_))));
        assert!(matches!(copy(&p, None, "c1", "b", 1), Err(StorageError::NotFound(_))));
        assert!(matches!(copy(&p, Some("a"), "../c1", "b", 1), Err(StorageError::Invalid(_))));
        assert!(matches!(copy(&p, Some(".."), "c1", "b", 1), Err(StorageError::Invalid(_))));
    }
}
