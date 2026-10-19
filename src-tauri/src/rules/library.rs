//! The processed rules library: one SQLite file built at import time, read by the reader and search.

use crate::storage::StorageError;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// Reads share the library; swapping in a freshly imported file (or removing a source) waits for them.
/// On Windows a file can't be replaced while it's open, so this also keeps the swap from failing.
pub static LIBRARY_LOCK: RwLock<()> = RwLock::new(());

pub const FILE_NAME: &str = "library.sqlite";

const SCHEMA: &str = "
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sources (
        id TEXT PRIMARY KEY COLLATE NOCASE, name TEXT NOT NULL, grp TEXT NOT NULL,
        published TEXT, is_book INTEGER NOT NULL DEFAULT 0, contents TEXT
    );
    CREATE TABLE chapters (
        book_id TEXT NOT NULL COLLATE NOCASE, idx INTEGER NOT NULL, name TEXT NOT NULL, json TEXT NOT NULL,
        PRIMARY KEY (book_id, idx)
    );
    CREATE TABLE entities (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL COLLATE NOCASE, extra TEXT NOT NULL DEFAULT '', page INTEGER, json TEXT NOT NULL,
        UNIQUE (kind, source, name, extra)
    );
    CREATE INDEX entities_by_name ON entities (kind, name);
    CREATE INDEX entities_by_source ON entities (source);
    CREATE VIRTUAL TABLE search USING fts5(
        title, body, kind UNINDEXED, source UNINDEXED, ref UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
    );
";

fn db_err(e: rusqlite::Error) -> StorageError {
    StorageError::Io(format!("rules library: {e}"))
}

pub fn path(rules_dir: &Path) -> PathBuf {
    rules_dir.join(FILE_NAME)
}

/// Opens the library read-only. `None` when nothing has been imported yet.
pub fn open(rules_dir: &Path) -> Result<Option<Connection>, StorageError> {
    let file = path(rules_dir);
    if !file.exists() {
        return Ok(None);
    }
    Connection::open_with_flags(&file, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map(Some)
        .map_err(db_err)
}

pub fn open_write(rules_dir: &Path) -> Result<Connection, StorageError> {
    Connection::open(path(rules_dir)).map_err(db_err)
}

/// Builds a new library at `file` (removing any leftover). Everything goes in one transaction for speed.
pub struct Writer {
    conn: Connection,
}

impl Writer {
    pub fn create(file: &Path) -> Result<Self, StorageError> {
        if file.exists() {
            std::fs::remove_file(file)?;
        }
        let conn = Connection::open(file).map_err(db_err)?;
        conn.execute_batch(SCHEMA).map_err(db_err)?;
        conn.execute_batch("BEGIN").map_err(db_err)?;
        Ok(Writer { conn })
    }

    pub fn meta(&self, key: &str, value: &str) -> Result<(), StorageError> {
        self.conn.execute("INSERT OR REPLACE INTO meta VALUES (?1, ?2)", params![key, value]).map_err(db_err)?;
        Ok(())
    }

    pub fn source(&self, id: &str, name: &str, group: &str, published: Option<&str>, contents: Option<&Value>) -> Result<(), StorageError> {
        self.conn
            .execute(
                "INSERT INTO sources (id, name, grp, published, is_book, contents) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (id) DO UPDATE SET
                   name = excluded.name, grp = excluded.grp, published = excluded.published,
                   is_book = max(is_book, excluded.is_book), contents = coalesce(excluded.contents, contents)",
                params![id, name, group, published, contents.is_some() as i64, contents.map(Value::to_string)],
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn chapter(&self, book: &str, idx: usize, name: &str, json: &Value) -> Result<(), StorageError> {
        self.conn
            .execute("INSERT OR REPLACE INTO chapters VALUES (?1, ?2, ?3, ?4)", params![book, idx as i64, name, json.to_string()])
            .map_err(db_err)?;
        Ok(())
    }

    /// Adds an entity; returns its row id, or `None` if an identical (kind, source, name, extra) already exists.
    pub fn entity(&self, kind: &str, source: &str, name: &str, extra: &str, page: Option<i64>, json: &Value) -> Result<Option<i64>, StorageError> {
        let added = self
            .conn
            .execute(
                "INSERT OR IGNORE INTO entities (kind, source, name, extra, page, json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![kind, source, name, extra, page, json.to_string()],
            )
            .map_err(db_err)?;
        Ok((added == 1).then(|| self.conn.last_insert_rowid()))
    }

    pub fn search_row(&self, title: &str, body: &str, kind: &str, source: &str, reference: &str) -> Result<(), StorageError> {
        self.conn
            .execute("INSERT INTO search VALUES (?1, ?2, ?3, ?4, ?5)", params![title, body, kind, source, reference])
            .map_err(db_err)?;
        Ok(())
    }

    pub fn finish(self) -> Result<(), StorageError> {
        self.conn.execute_batch("COMMIT; PRAGMA optimize;").map_err(db_err)?;
        self.conn.close().map_err(|(_, e)| db_err(e))
    }
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub group: String,
    pub published: Option<String>,
    pub is_book: bool,
    pub entities: i64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInfo {
    pub version: String,
    /// Milliseconds since the Unix epoch.
    pub imported_at: u64,
    /// Sources that still have content (removed ones are gone from the library).
    pub sources: Vec<SourceInfo>,
}

fn meta(conn: &Connection, key: &str) -> Result<Option<String>, StorageError> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional().map_err(db_err)
}

pub fn info(conn: &Connection) -> Result<LibraryInfo, StorageError> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.grp, s.published, s.is_book, (SELECT count(*) FROM entities e WHERE e.source = s.id)
             FROM sources s
             WHERE s.is_book = 1 OR EXISTS (SELECT 1 FROM entities e WHERE e.source = s.id)
             ORDER BY s.grp, s.published, s.name",
        )
        .map_err(db_err)?;
    let sources = stmt
        .query_map([], |r| {
            Ok(SourceInfo { id: r.get(0)?, name: r.get(1)?, group: r.get(2)?, published: r.get(3)?, is_book: r.get::<_, i64>(4)? == 1, entities: r.get(5)? })
        })
        .map_err(db_err)?
        .collect::<Result<_, _>>()
        .map_err(db_err)?;
    Ok(LibraryInfo {
        version: meta(conn, "version")?.unwrap_or_default(),
        imported_at: meta(conn, "imported_at")?.and_then(|v| v.parse().ok()).unwrap_or(0),
        sources,
    })
}

/// Deletes everything that came from one source: its book chapters, entities, search rows and the source itself.
pub fn remove_source(conn: &Connection, id: &str) -> Result<(), StorageError> {
    conn.execute_batch("BEGIN").map_err(db_err)?;
    let result = (|| {
        conn.execute("DELETE FROM search WHERE source = ?1 COLLATE NOCASE", [id])?;
        conn.execute("DELETE FROM chapters WHERE book_id = ?1", [id])?;
        conn.execute("DELETE FROM entities WHERE source = ?1", [id])?;
        conn.execute("DELETE FROM sources WHERE id = ?1", [id])?;
        Ok(())
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT").map_err(db_err),
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK"); // the original error below is what matters
            Err(db_err(e))
        }
    }
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub name: String,
    pub group: String,
    /// The `contents` list from books.json: chapter names and their headers.
    pub contents: Value,
}

pub fn book(conn: &Connection, id: &str) -> Result<Option<Book>, StorageError> {
    conn.query_row("SELECT id, name, grp, contents FROM sources WHERE id = ?1 AND is_book = 1", [id], |r| {
        let contents: Option<String> = r.get(3)?;
        Ok(Book { id: r.get(0)?, name: r.get(1)?, group: r.get(2)?, contents: contents.and_then(|c| serde_json::from_str(&c).ok()).unwrap_or(Value::Null) })
    })
    .optional()
    .map_err(db_err)
}

pub fn chapter(conn: &Connection, book_id: &str, idx: i64) -> Result<Option<Value>, StorageError> {
    let json: Option<String> =
        conn.query_row("SELECT json FROM chapters WHERE book_id = ?1 AND idx = ?2", params![book_id, idx], |r| r.get(0)).optional().map_err(db_err)?;
    json.map(|j| serde_json::from_str(&j).map_err(|e| StorageError::Corrupt(e.to_string()))).transpose()
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: i64,
    pub kind: String,
    pub source: String,
    pub name: String,
    pub page: Option<i64>,
    pub data: Value,
}

const ENTITY_COLUMNS: &str = "id, kind, source, name, page, json";

fn row_to_entity(r: &rusqlite::Row) -> rusqlite::Result<Entity> {
    let json: String = r.get(5)?;
    Ok(Entity { id: r.get(0)?, kind: r.get(1)?, source: r.get(2)?, name: r.get(3)?, page: r.get(4)?, data: serde_json::from_str(&json).unwrap_or(Value::Null) })
}

pub fn entity(conn: &Connection, id: i64) -> Result<Option<Entity>, StorageError> {
    conn.query_row(&format!("SELECT {ENTITY_COLUMNS} FROM entities WHERE id = ?1"), [id], row_to_entity).optional().map_err(db_err)
}

/// Finds an entity the way inline tags name them: kind + name, and the source when given.
/// Without a match on the source (or without a source), any entity of that kind and name will do,
/// preferring the most recently published source.
pub fn find(conn: &Connection, kind: &str, name: &str, source: Option<&str>) -> Result<Option<Entity>, StorageError> {
    if let Some(source) = source {
        let exact = conn
            .query_row(
                &format!("SELECT {ENTITY_COLUMNS} FROM entities WHERE kind = ?1 AND name = ?2 AND source = ?3 ORDER BY extra LIMIT 1"),
                params![kind, name, source],
                row_to_entity,
            )
            .optional()
            .map_err(db_err)?;
        if exact.is_some() {
            return Ok(exact);
        }
    }
    conn.query_row(
        &format!(
            "SELECT {ENTITY_COLUMNS} FROM entities e WHERE kind = ?1 AND name = ?2
             ORDER BY (SELECT published FROM sources s WHERE s.id = e.source) DESC LIMIT 1"
        ),
        params![kind, name],
        row_to_entity,
    )
    .optional()
    .map_err(db_err)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EntitySummary {
    pub id: i64,
    pub kind: String,
    pub source: String,
    pub name: String,
}

/// One page of entities of a kind, alphabetical, optionally filtered by a name fragment.
pub fn list(conn: &Connection, kind: &str, filter: &str, offset: i64, limit: i64) -> Result<Vec<EntitySummary>, StorageError> {
    let pattern = format!("%{}%", filter.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn
        .prepare("SELECT id, kind, source, name FROM entities WHERE kind = ?1 AND name LIKE ?2 ESCAPE '\\' ORDER BY name, source LIMIT ?3 OFFSET ?4")
        .map_err(db_err)?;
    stmt.query_map(params![kind, pattern, limit, offset], |r| Ok(EntitySummary { id: r.get(0)?, kind: r.get(1)?, source: r.get(2)?, name: r.get(3)? }))
        .map_err(db_err)?
        .collect::<Result<_, _>>()
        .map_err(db_err)
}
