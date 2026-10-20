use crate::dice::{roll, Roll};
use crate::storage::StorageError;

/// Rolls dice notation like `4d6kh3` or `2d20kh1+4`.
#[tauri::command]
pub async fn roll_dice(notation: String) -> Result<Roll, StorageError> {
    roll(&notation).map_err(StorageError::Invalid)
}
