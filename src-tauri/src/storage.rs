//! Shared local storage helpers: one error type and crash-safe file writes.

use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum StorageError {
    Io(String),
    /// A saved file could not be read as valid data. It is left untouched (or a copy is kept).
    Corrupt(String),
    Invalid(String),
    NotFound(String),
}

impl From<io::Error> for StorageError {
    fn from(e: io::Error) -> Self {
        StorageError::Io(e.to_string())
    }
}

// Concurrent saves to the same file share its temp file, so write one at a time.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Writes atomically: temp file, flush to disk, rename over the old file. A crash leaves either the old or the new file.
pub fn write_atomic(path: &Path, contents: &str) -> Result<(), StorageError> {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn to_json<T: Serialize>(value: &T) -> Result<String, StorageError> {
    serde_json::to_string_pretty(value).map_err(|e| StorageError::Io(e.to_string()))
}
