//! Imports a 5etools data archive (.tar.gz) that the user provides into the rules library.

use super::library::{self, Writer, LIBRARY_LOCK};
use super::text::{is_section, own_text, plain_text};
use crate::storage::StorageError;
use flate2::read::GzDecoder;
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Compressed bytes read so far, out of the archive's size.
    pub done: u64,
    pub total: u64,
}

/// Counts bytes read from the archive file, for progress.
pub struct Counting<R> {
    pub inner: R,
    pub count: Arc<AtomicU64>,
}

impl<R: Read> Read for Counting<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.count.fetch_add(n as u64, Ordering::Relaxed);
        Ok(n)
    }
}

/// Path inside the archive without its top folder (GitHub tarballs wrap everything in `<repo>-<sha>/`).
pub fn relative(path: &Path) -> Option<String> {
    let parts: Vec<&str> = path.components().filter_map(|c| match c {
        Component::Normal(p) => p.to_str(),
        _ => None,
    }).collect();
    let start = match parts.first() {
        Some(&"data") | Some(&"package.json") => 0,
        _ => 1,
    };
    (parts.len() > start).then(|| parts[start..].join("/"))
}

/// How many files to look at before deciding what kind of archive this is.
pub const SNIFF_FILES: u32 = 300;

/// Tells a rules data archive from an images archive by looking at the files as they stream past,
/// so picking the wrong file fails within a moment instead of after reading gigabytes.
#[derive(Default)]
pub struct Sniff {
    pub files: u32,
    pub images: u32,
    /// Saw a `data/*.json` file, the mark of a rules data archive.
    pub data_json: bool,
}

impl Sniff {
    pub fn record(&mut self, rel: &str) {
        self.files += 1;
        let lower = rel.to_ascii_lowercase();
        if [".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".avif"].iter().any(|ext| lower.ends_with(ext)) {
            self.images += 1;
        }
        if lower.starts_with("data/") && lower.ends_with(".json") {
            self.data_json = true;
        }
    }

    /// Mostly images so far (at least half of the files seen).
    pub fn mostly_images(&self) -> bool {
        self.files > 0 && self.images * 2 >= self.files
    }
}

pub const WRONG_FOR_DATA: &str = "This looks like an images archive, not rules data. Use Import images for it.";
pub const WRONG_FOR_IMAGES: &str = "This looks like a rules data archive, not images. Use Import data for it.";

/// (JSON key inside the file, entity kind) for each data file the library uses.
fn entity_keys(path: &str) -> &'static [(&'static str, &'static str)] {
    let file = path.trim_start_matches("data/");
    if file.starts_with("spells/spells-") {
        return &[("spell", "spell")];
    }
    if file.starts_with("bestiary/bestiary-") {
        return &[("monster", "creature")];
    }
    if file.starts_with("class/class-") {
        return &[("class", "class"), ("subclass", "subclass"), ("classFeature", "classFeature"), ("subclassFeature", "subclassFeature")];
    }
    match file {
        "items.json" => &[("item", "item")],
        "items-base.json" => &[("baseitem", "item"), ("itemProperty", "itemProperty"), ("itemMastery", "itemMastery")],
        "feats.json" => &[("feat", "feat")],
        "backgrounds.json" => &[("background", "background")],
        "races.json" => &[("race", "species"), ("subrace", "subspecies")],
        "optionalfeatures.json" => &[("optionalfeature", "optionalfeature")],
        "conditionsdiseases.json" => &[("condition", "condition"), ("disease", "disease"), ("status", "condition")],
        "variantrules.json" => &[("variantrule", "variantrule")],
        "actions.json" => &[("action", "action")],
        "languages.json" => &[("language", "language")],
        "skills.json" => &[("skill", "skill")],
        "senses.json" => &[("sense", "sense")],
        "trapshazards.json" => &[("trap", "trap"), ("hazard", "hazard")],
        _ => &[],
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Entity name; item properties have no name of their own, so use their first entry's name or abbreviation.
fn entity_name(kind: &str, v: &Value) -> String {
    let name = str_of(v, "name");
    if !name.is_empty() || kind != "itemProperty" {
        return name.to_string();
    }
    v.pointer("/entries/0/name").and_then(Value::as_str).unwrap_or(str_of(v, "abbreviation")).to_string()
}

/// Distinguishes entities that share kind, source and name (class features repeat per class and level).
fn entity_extra(kind: &str, v: &Value) -> String {
    let level = v.get("level").map(Value::to_string).unwrap_or_default();
    match kind {
        "subspecies" => format!("{}|{}", str_of(v, "raceName"), str_of(v, "raceSource")),
        "subclass" => format!("{}|{}", str_of(v, "className"), str_of(v, "classSource")),
        "classFeature" => format!("{}|{}|{level}", str_of(v, "className"), str_of(v, "classSource")),
        "subclassFeature" => format!("{}|{}|{level}", str_of(v, "className"), str_of(v, "subclassShortName")),
        "itemProperty" => str_of(v, "abbreviation").to_string(),
        _ => String::new(),
    }
}

struct Import<'a> {
    writer: Writer,
    removed: &'a [String],
    version: Option<String>,
    saw_books: bool,
}

impl Import<'_> {
    fn is_removed(&self, source: &str) -> bool {
        self.removed.iter().any(|r| r.eq_ignore_ascii_case(source))
    }

    fn file(&mut self, path: &str, json: Value) -> Result<(), StorageError> {
        match path {
            "package.json" => self.version = json.get("version").and_then(Value::as_str).map(str::to_string),
            "data/books.json" => {
                self.saw_books = true;
                for book in json.get("book").and_then(Value::as_array).into_iter().flatten() {
                    let id = str_of(book, "id");
                    if id.is_empty() || self.is_removed(id) {
                        continue;
                    }
                    let group = book.get("group").and_then(Value::as_str).unwrap_or("other");
                    let published = book.get("published").and_then(Value::as_str);
                    self.writer.source(id, str_of(book, "name"), group, published, Some(book.get("contents").unwrap_or(&Value::Null)))?;
                }
            }
            "data/adventures.json" => {
                for adventure in json.get("adventure").and_then(Value::as_array).into_iter().flatten() {
                    let id = str_of(adventure, "id");
                    if !id.is_empty() && !self.is_removed(id) {
                        self.writer.source(id, str_of(adventure, "name"), "adventure", adventure.get("published").and_then(Value::as_str), None)?;
                    }
                }
            }
            p if p.starts_with("data/book/book-") => self.book(&json)?,
            p => self.entities(p, &json)?,
        }
        Ok(())
    }

    fn book(&mut self, json: &Value) -> Result<(), StorageError> {
        for book in json.get("bookData").and_then(Value::as_array).into_iter().flatten() {
            let id = str_of(book, "id");
            if id.is_empty() || self.is_removed(id) {
                continue;
            }
            for (idx, chapter) in book.get("data").and_then(Value::as_array).into_iter().flatten().enumerate() {
                let name = chapter.get("name").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("Part {}", idx + 1));
                self.writer.chapter(id, idx, &name, chapter)?;
                self.index_sections(id, idx, chapter)?;
            }
        }
        Ok(())
    }

    /// One search row per named section, holding only that section's own text.
    fn index_sections(&self, book: &str, idx: usize, value: &Value) -> Result<(), StorageError> {
        if is_section(value) {
            let name = str_of(value, "name");
            self.writer.search_row(name, &own_text(value), "section", book, &format!("c:{book}:{idx}:{name}"))?;
        }
        match value {
            Value::Array(items) => items.iter().try_for_each(|v| self.index_sections(book, idx, v)),
            Value::Object(map) => map.values().try_for_each(|v| self.index_sections(book, idx, v)),
            _ => Ok(()),
        }
    }

    fn entities(&mut self, path: &str, json: &Value) -> Result<(), StorageError> {
        for (key, kind) in entity_keys(path) {
            for item in json.get(*key).and_then(Value::as_array).into_iter().flatten() {
                let source = str_of(item, "source");
                let name = entity_name(kind, item);
                if source.is_empty() || name.is_empty() || self.is_removed(source) {
                    continue;
                }
                let page = item.get("page").and_then(Value::as_i64);
                if let Some(id) = self.writer.entity(kind, source, &name, &entity_extra(kind, item), page, item)? {
                    self.writer.search_row(&name, &plain_text(item), kind, source, &format!("e:{id}"))?;
                }
            }
        }
        Ok(())
    }
}

/// Imports `archive` into `<rules_dir>/library.sqlite`. Builds a temp file first and only replaces
/// the existing library when everything succeeded, so a bad archive never costs the old data.
/// Returns the imported version.
pub fn import_archive(archive: &Path, rules_dir: &Path, removed: &[String], now: u64, progress: &mut dyn FnMut(Progress)) -> Result<String, StorageError> {
    fs::create_dir_all(rules_dir)?;
    let tmp = rules_dir.join(format!("{}.tmp", library::FILE_NAME));
    let result = build(archive, &tmp, removed, now, progress);
    match result {
        Ok(version) => {
            let _guard = LIBRARY_LOCK.write().unwrap_or_else(|p| p.into_inner());
            fs::rename(&tmp, library::path(rules_dir))?;
            Ok(version)
        }
        Err(e) => {
            let _ = fs::remove_file(&tmp); // best effort; the import error is what the user needs to see
            Err(e)
        }
    }
}

fn build(archive: &Path, tmp: &Path, removed: &[String], now: u64, progress: &mut dyn FnMut(Progress)) -> Result<String, StorageError> {
    let file = File::open(archive).map_err(|e| StorageError::NotFound(format!("Couldn't open {}: {e}", archive.display())))?;
    let total = file.metadata()?.len();
    let count = Arc::new(AtomicU64::new(0));
    let reader = Counting { inner: file, count: count.clone() };
    let mut tar = tar::Archive::new(GzDecoder::new(reader));
    let not_archive = |e: io::Error| StorageError::Invalid(format!("This isn't a readable .tar.gz file ({e})."));

    let mut import = Import { writer: Writer::create(tmp)?, removed, version: None, saw_books: false };
    let mut sniff = Sniff::default();
    let mut last_reported = 0;
    for entry in tar.entries().map_err(not_archive)? {
        let mut entry = entry.map_err(not_archive)?;
        let path = entry.path().map_err(not_archive)?.into_owned();
        let Some(rel) = relative(&path) else { continue };
        if entry.header().entry_type().is_file() {
            sniff.record(&rel);
            if sniff.files == SNIFF_FILES && !sniff.data_json && sniff.mostly_images() {
                return Err(StorageError::Invalid(WRONG_FOR_DATA.into()));
            }
        }
        let wanted = rel == "package.json" || rel == "data/books.json" || rel == "data/adventures.json" || rel.starts_with("data/book/book-") || !entity_keys(&rel).is_empty();
        if wanted && rel.ends_with(".json") {
            let mut bytes = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut bytes).map_err(not_archive)?;
            let json: Value = serde_json::from_slice(&bytes).map_err(|e| StorageError::Corrupt(format!("{rel}: {e}")))?;
            import.file(&rel, json)?;
        }
        let done = count.load(Ordering::Relaxed);
        if done - last_reported > total / 100 {
            last_reported = done;
            progress(Progress { done, total });
        }
    }

    if !sniff.data_json && sniff.mostly_images() {
        return Err(StorageError::Invalid(WRONG_FOR_DATA.into()));
    }
    let Some(version) = import.version.clone() else {
        return Err(StorageError::Invalid("This archive has no package.json with a version. Is it 5etools data?".into()));
    };
    if !import.saw_books {
        return Err(StorageError::Invalid("This archive has no data/books.json. Is it 5etools data?".into()));
    }
    import.writer.meta("version", &version)?;
    import.writer.meta("imported_at", &now.to_string())?;
    import.writer.finish()?;
    progress(Progress { done: total, total });
    Ok(version)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use std::path::PathBuf;
    use flate2::Compression;
    use serde_json::json;

    pub fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dmc-rules-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A tiny 5etools-shaped archive, wrapped in a root folder like a GitHub tarball.
    pub fn fixture(dir: &Path, version: &str) -> PathBuf {
        let files: Vec<(&str, Value)> = vec![
            ("package.json", json!({ "version": version })),
            ("data/books.json", json!({ "book": [
                { "id": "XPHB", "name": "Player's Handbook (2024)", "group": "core", "published": "2024-09-17", "contents": [{ "name": "Playing the Game" }] },
                { "id": "PHB", "name": "Player's Handbook (2014)", "group": "core", "published": "2014-08-19", "contents": [] }
            ]})),
            ("data/book/book-xphb.json", json!({ "bookData": [{ "id": "XPHB", "source": "XPHB", "data": [
                { "type": "section", "name": "Playing the Game", "entries": [
                    "Roll a {@dice d20}.",
                    { "type": "entries", "name": "Hiding", "entries": ["Make a {@skill Stealth|XPHB} check to hide."] }
                ]}
            ]}]})),
            ("data/spells/spells-xphb.json", json!({ "spell": [
                { "name": "Fireball", "source": "XPHB", "page": 274, "level": 3, "entries": ["A bright streak flashes to a point you choose."] }
            ]})),
            ("data/spells/spells-phb.json", json!({ "spell": [{ "name": "Fireball", "source": "PHB", "level": 3, "entries": ["Old fireball."] }] })),
            ("data/class/class-fighter.json", json!({
                "class": [{ "name": "Fighter", "source": "XPHB" }],
                "classFeature": [
                    { "name": "Ability Score Improvement", "source": "XPHB", "className": "Fighter", "classSource": "XPHB", "level": 4, "entries": ["Improve."] },
                    { "name": "Ability Score Improvement", "source": "XPHB", "className": "Fighter", "classSource": "XPHB", "level": 6, "entries": ["Again."] }
                ]
            })),
            ("data/items-base.json", json!({ "itemProperty": [{ "abbreviation": "F", "source": "XPHB", "entries": [{ "name": "Finesse", "entries": ["Use Dex."] }] }] })),
            ("data/unrelated.json", json!({ "ignored": true })),
        ];
        let file = dir.join("data.tar.gz");
        let mut tar = tar::Builder::new(GzEncoder::new(File::create(&file).unwrap(), Compression::fast()));
        for (path, value) in files {
            let bytes = serde_json::to_vec(&value).unwrap();
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, format!("5etools-src-abc123/{path}"), bytes.as_slice()).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();
        file
    }

    fn count(conn: &rusqlite::Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn imports_books_chapters_entities_and_search_rows() {
        let dir = temp_dir("import");
        let archive = fixture(&dir, "2.38.0");
        let rules = dir.join("rules");
        let mut reports = 0;
        let version = import_archive(&archive, &rules, &[], 1_000, &mut |_| reports += 1).unwrap();
        assert_eq!(version, "2.38.0");
        assert!(reports > 0);

        let conn = library::open(&rules).unwrap().unwrap();
        let info = library::info(&conn).unwrap();
        assert_eq!((info.version.as_str(), info.imported_at), ("2.38.0", 1_000));
        assert_eq!(count(&conn, "SELECT count(*) FROM chapters"), 1);
        assert_eq!(count(&conn, "SELECT count(*) FROM entities WHERE kind = 'spell'"), 2);
        // Class features that share a name are kept apart by class and level.
        assert_eq!(count(&conn, "SELECT count(*) FROM entities WHERE kind = 'classFeature'"), 2);
        // Item properties take their name from their first entry.
        assert!(library::find(&conn, "itemProperty", "Finesse", Some("XPHB")).unwrap().is_some());
        // Both book sections are searchable, each with its own text only.
        let hiding: String = conn.query_row("SELECT body FROM search WHERE title = 'Hiding'", [], |r| r.get(0)).unwrap();
        assert_eq!(hiding, "Make a Stealth check to hide.");
        assert_eq!(count(&conn, "SELECT count(*) FROM search WHERE kind = 'section'"), 2);
        assert!(!rules.join("library.sqlite.tmp").exists());
    }

    #[test]
    fn rejects_an_images_archive_early_and_keeps_the_existing_library() {
        let dir = temp_dir("wrong-kind");
        let rules = dir.join("rules");
        import_archive(&fixture(&dir, "1.0.0"), &rules, &[], 1, &mut |_| {}).unwrap();

        // More files than the sniff window, all images, wrapped like a GitHub tarball.
        let file = dir.join("img.tar.gz");
        let mut tar = tar::Builder::new(GzEncoder::new(File::create(&file).unwrap(), Compression::fast()));
        for i in 0..(SNIFF_FILES + 50) {
            let mut header = tar::Header::new_gnu();
            header.set_size(3);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, format!("5etools-img-abc/bestiary/MM/{i}.webp"), &b"img"[..]).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();

        let mut reports = 0;
        let err = import_archive(&file, &rules, &[], 2, &mut |_| reports += 1).unwrap_err();
        assert_eq!(err, StorageError::Invalid(WRONG_FOR_DATA.into()));
        let conn = library::open(&rules).unwrap().unwrap();
        assert_eq!(library::info(&conn).unwrap().version, "1.0.0");
        assert!(!rules.join("library.sqlite.tmp").exists());
    }

    #[test]
    fn catalog_returns_only_the_requested_fields() {
        let dir = temp_dir("catalog");
        let rules = dir.join("rules");
        import_archive(&fixture(&dir, "1.0.0"), &rules, &[], 1, &mut |_| {}).unwrap();
        let conn = library::open(&rules).unwrap().unwrap();
        let spells = library::catalog(&conn, Some("spell"), &["level".into(), "entries".into(), "missing".into()]).unwrap();
        assert_eq!(spells.len(), 2);
        assert_eq!(spells[0].data["level"], 3);
        assert!(spells[0].data["entries"].is_array()); // structured values stay JSON, not strings
        assert!(spells[0].data["missing"].is_null());
        assert!(spells[0].data.get("source").is_none());
        let all = library::catalog(&conn, None, &[]).unwrap();
        assert!(all.len() > spells.len());
        assert!(matches!(library::catalog(&conn, None, &["x') --".into()]), Err(StorageError::Invalid(_))));
    }

    #[test]
    fn find_prefers_the_named_source_then_the_newest() {
        let dir = temp_dir("find");
        let rules = dir.join("rules");
        import_archive(&fixture(&dir, "1.0.0"), &rules, &[], 1, &mut |_| {}).unwrap();
        let conn = library::open(&rules).unwrap().unwrap();
        assert_eq!(library::find(&conn, "spell", "fireball", Some("phb")).unwrap().unwrap().source, "PHB");
        assert_eq!(library::find(&conn, "spell", "Fireball", None).unwrap().unwrap().source, "XPHB");
        assert!(library::find(&conn, "spell", "Wish", None).unwrap().is_none());
    }

    #[test]
    fn removed_sources_are_skipped_and_can_be_removed_later() {
        let dir = temp_dir("removed");
        let rules = dir.join("rules");
        import_archive(&fixture(&dir, "1.0.0"), &rules, &["phb".to_string()], 1, &mut |_| {}).unwrap();
        let conn = library::open(&rules).unwrap().unwrap();
        let ids: Vec<String> = library::info(&conn).unwrap().sources.into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec!["XPHB"]);
        assert_eq!(count(&conn, "SELECT count(*) FROM entities WHERE source = 'PHB'"), 0);
        drop(conn);

        library::remove_source(&library::open_write(&rules).unwrap(), "XPHB").unwrap();
        let conn = library::open(&rules).unwrap().unwrap();
        assert!(library::info(&conn).unwrap().sources.is_empty());
        assert_eq!(count(&conn, "SELECT count(*) FROM search"), 0);
        assert_eq!(count(&conn, "SELECT count(*) FROM chapters"), 0);
    }

    #[test]
    fn a_bad_archive_keeps_the_existing_library() {
        let dir = temp_dir("bad");
        let rules = dir.join("rules");
        import_archive(&fixture(&dir, "1.0.0"), &rules, &[], 1, &mut |_| {}).unwrap();

        let junk = dir.join("junk.tar.gz");
        fs::write(&junk, b"not a tarball").unwrap();
        assert!(matches!(import_archive(&junk, &rules, &[], 2, &mut |_| {}), Err(StorageError::Invalid(_))));
        assert!(matches!(import_archive(&dir.join("missing.tar.gz"), &rules, &[], 2, &mut |_| {}), Err(StorageError::NotFound(_))));

        let conn = library::open(&rules).unwrap().unwrap();
        assert_eq!(library::info(&conn).unwrap().version, "1.0.0");
        assert!(!rules.join("library.sqlite.tmp").exists());
    }

    /// Opt-in check against a real archive: `DMC_RULES_ARCHIVE=<path> cargo test real_archive -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn real_archive() {
        let Ok(path) = std::env::var("DMC_RULES_ARCHIVE") else { return };
        let dir = temp_dir("real");
        let started = std::time::Instant::now();
        let version = import_archive(Path::new(&path), &dir, &[], 1, &mut |_| {}).unwrap();
        let conn = library::open(&dir).unwrap().unwrap();
        let info = library::info(&conn).unwrap();
        println!("version {version}, {} sources, imported in {:?}", info.sources.len(), started.elapsed());
        let mut stmt = conn.prepare("SELECT kind, count(*) FROM entities GROUP BY kind ORDER BY 2 DESC").unwrap();
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))).unwrap() {
            println!("  {:?}", row.unwrap());
        }
        println!("  chapters: {}, search rows: {}", count(&conn, "SELECT count(*) FROM chapters"), count(&conn, "SELECT count(*) FROM search"));
        println!("  library size: {} MB", fs::metadata(library::path(&dir)).unwrap().len() / 1_048_576);
        println!("  _copy entities: {}, of which in XPHB/XDMG/XMM: {}", count(&conn, "SELECT count(*) FROM entities WHERE json LIKE '%\"_copy\"%'"), count(&conn, "SELECT count(*) FROM entities WHERE json LIKE '%\"_copy\"%' AND source IN ('XPHB','XDMG','XMM')"));
        assert!(library::find(&conn, "spell", "Fireball", Some("XPHB")).unwrap().is_some());
        let keys: Vec<String> = ["cr", "type", "size", "ac", "hp", "alignment"].iter().map(|k| k.to_string()).collect();
        let started = std::time::Instant::now();
        let creatures = library::catalog(&conn, Some("creature"), &keys).unwrap();
        let bytes = serde_json::to_string(&creatures).unwrap().len();
        println!("  catalog: {} creatures in {:?}, {} KB as JSON", creatures.len(), started.elapsed(), bytes / 1024);
        let started = std::time::Instant::now();
        let all = library::catalog(&conn, None, &[]).unwrap();
        println!("  catalog: all {} entries in {:?}", all.len(), started.elapsed());
    }

    /// Opt-in: both real archives swapped. `DMC_RULES_ARCHIVE=… DMC_IMAGES_ARCHIVE=… cargo test real_wrong_kind -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_wrong_kind() {
        let (Ok(data), Ok(images)) = (std::env::var("DMC_RULES_ARCHIVE"), std::env::var("DMC_IMAGES_ARCHIVE")) else { return };
        let dir = temp_dir("real-wrong");
        let started = std::time::Instant::now();
        let err = import_archive(Path::new(&images), &dir, &[], 1, &mut |_| {}).unwrap_err();
        println!("images as data: {err:?} after {:?}", started.elapsed());
        let started = std::time::Instant::now();
        let err = crate::rules::images::import_images(Path::new(&data), &dir, 1, &mut |_| {}).unwrap_err();
        println!("data as images: {err:?} after {:?}", started.elapsed());
    }

    #[test]
    fn strips_the_archive_root_folder() {
        assert_eq!(relative(Path::new("5etools-abc/data/books.json")).as_deref(), Some("data/books.json"));
        assert_eq!(relative(Path::new("data/books.json")).as_deref(), Some("data/books.json"));
        assert_eq!(relative(Path::new("root/package.json")).as_deref(), Some("package.json"));
        assert_eq!(relative(Path::new("root")), None);
    }
}
