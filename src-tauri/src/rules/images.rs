//! Optional images: a user-provided .tar.gz extracted to `<rules dir>/img/`, referenced by book entries.

use super::import::{Counting, Progress};
use crate::storage::{to_json, write_atomic, StorageError};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const DIR: &str = "img";
const MARKER: &str = ".imported.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagesInfo {
    pub files: u64,
    /// Milliseconds since the Unix epoch.
    pub imported_at: u64,
}

pub fn dir(rules_dir: &Path) -> PathBuf {
    rules_dir.join(DIR)
}

pub fn info(rules_dir: &Path) -> Option<ImagesInfo> {
    let text = fs::read_to_string(dir(rules_dir).join(MARKER)).ok()?;
    serde_json::from_str(&text).ok()
}

/// If extraction produced a single wrapping folder (like GitHub's `5etools-img-<sha>/` or a plain `img/`),
/// that folder is the real root. A lone content folder such as `covers/` is kept as it is.
fn content_root(extracted: &Path) -> io::Result<PathBuf> {
    let entries: Vec<_> = fs::read_dir(extracted)?.collect::<Result<_, _>>()?;
    match entries.as_slice() {
        [only] if only.file_type()?.is_dir() => {
            let name = only.file_name().to_string_lossy().to_lowercase();
            Ok(if name.contains("5etools") || name.contains("img") { only.path() } else { extracted.to_path_buf() })
        }
        _ => Ok(extracted.to_path_buf()),
    }
}

fn count_files(dir: &Path) -> io::Result<u64> {
    let mut n = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        n += if entry.file_type()?.is_dir() { count_files(&entry.path())? } else { 1 };
    }
    Ok(n)
}

/// Extracts into a temp folder, then swaps it in for the old images. A failed import leaves the old images.
pub fn import_images(archive: &Path, rules_dir: &Path, now: u64, progress: &mut dyn FnMut(Progress)) -> Result<ImagesInfo, StorageError> {
    let file = File::open(archive).map_err(|e| StorageError::NotFound(format!("Couldn't open {}: {e}", archive.display())))?;
    let total = file.metadata()?.len();
    let tmp = rules_dir.join("img.tmp");
    if tmp.exists() {
        fs::remove_dir_all(&tmp)?;
    }
    fs::create_dir_all(&tmp)?;

    let count = Arc::new(AtomicU64::new(0));
    let reader = Counting { inner: file, count: count.clone() };
    let not_archive = |e: io::Error| StorageError::Invalid(format!("This isn't a readable .tar.gz file ({e})."));
    let result = (|| {
        let mut tar = tar::Archive::new(GzDecoder::new(reader));
        let mut last_reported = 0;
        for entry in tar.entries().map_err(not_archive)? {
            // unpack_in refuses paths that would land outside the folder.
            entry.map_err(not_archive)?.unpack_in(&tmp).map_err(not_archive)?;
            let done = count.load(Ordering::Relaxed);
            if done - last_reported > total / 200 {
                last_reported = done;
                progress(Progress { done, total });
            }
        }
        let root = content_root(&tmp)?;
        let info = ImagesInfo { files: count_files(&root)?, imported_at: now };
        if info.files == 0 {
            return Err(StorageError::Invalid("That archive contains no files.".into()));
        }
        write_atomic(&root.join(MARKER), &to_json(&info)?)?;
        let target = dir(rules_dir);
        if target.exists() {
            fs::remove_dir_all(&target)?;
        }
        rename_with_retry(&root, &target)?;
        Ok(info)
    })();
    if tmp.exists() {
        let _ = fs::remove_dir_all(&tmp); // leftovers only; the result above is what matters
    }
    if result.is_ok() {
        progress(Progress { done: total, total });
    }
    result
}

// Antivirus scanners on Windows briefly lock freshly written folders; give them a moment.
fn rename_with_retry(from: &Path, to: &Path) -> io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Err(e) if attempt < 5 && e.kind() == io::ErrorKind::PermissionDenied => {
                attempt += 1;
                thread::sleep(Duration::from_millis(200 * attempt));
            }
            other => return other,
        }
    }
}

pub fn remove_images(rules_dir: &Path) -> Result<(), StorageError> {
    let target = dir(rules_dir);
    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::import::tests::temp_dir;
    use flate2::write::GzEncoder;
    use flate2::Compression;

    fn archive(dir: &Path, files: &[&str]) -> PathBuf {
        let file = dir.join("img.tar.gz");
        let mut tar = tar::Builder::new(GzEncoder::new(File::create(&file).unwrap(), Compression::fast()));
        for path in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(3);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, path, &b"img"[..]).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();
        file
    }

    #[test]
    fn extracts_under_img_without_the_wrapping_folder() {
        let dir = temp_dir("images");
        let rules = dir.join("rules");
        fs::create_dir_all(&rules).unwrap();
        let file = archive(&dir, &["5etools-img-abc/book/XPHB/cover.webp", "5etools-img-abc/covers/XPHB.webp"]);
        let info = import_images(&file, &rules, 7, &mut |_| {}).unwrap();
        assert_eq!(info, ImagesInfo { files: 2, imported_at: 7 });
        assert!(rules.join("img/book/XPHB/cover.webp").exists());
        assert_eq!(super::info(&rules), Some(info));

        remove_images(&rules).unwrap();
        assert_eq!(super::info(&rules), None);
    }

    #[test]
    fn a_bad_archive_keeps_the_old_images() {
        let dir = temp_dir("images-bad");
        let rules = dir.join("rules");
        fs::create_dir_all(&rules).unwrap();
        import_images(&archive(&dir, &["covers/A.webp"]), &rules, 1, &mut |_| {}).unwrap();
        let junk = dir.join("junk.tar.gz");
        fs::write(&junk, b"nope").unwrap();
        assert!(import_images(&junk, &rules, 2, &mut |_| {}).is_err());
        assert!(rules.join("img/covers/A.webp").exists());
        assert!(!rules.join("img.tmp").exists());
    }
}
