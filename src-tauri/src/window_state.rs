//! Remembers the main window's size between sessions. The window starts hidden (tauri.conf.json),
//! gets its saved size, and is shown once the page has loaded, so the resize is never visible.

use crate::storage::{to_json, write_atomic};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, LogicalSize, Manager, Window};

const FILE_NAME: &str = "window-state.json";
const MIN: (f64, f64) = (360.0, 600.0); // same as minWidth/minHeight in tauri.conf.json

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    /// Size in logical pixels, so it survives a change of display scaling.
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(FILE_NAME))
}

fn load(file: &Path) -> Option<WindowState> {
    serde_json::from_str(&fs::read_to_string(file).ok()?).ok()
}

/// Fits a saved size within the minimum size and the screen it opens on.
pub fn fit(saved: WindowState, screen: Option<(f64, f64)>) -> (f64, f64) {
    let (mut width, mut height) = (saved.width.max(MIN.0), saved.height.max(MIN.1));
    if let Some((screen_w, screen_h)) = screen {
        width = width.min(screen_w.max(MIN.0));
        height = height.min(screen_h.max(MIN.1));
    }
    (width, height)
}

/// Applies the saved size before the window is first shown. Without a saved size, the config's size stays.
pub fn restore(window: &Window) {
    let Some(saved) = path(window.app_handle()).and_then(|f| load(&f)) else { return };
    let screen = window.current_monitor().ok().flatten().map(|m| {
        let size = m.size().to_logical::<f64>(m.scale_factor());
        (size.width, size.height)
    });
    let (width, height) = fit(saved, screen);
    // A failure here just means the default size; not worth stopping the app for.
    let _ = window.set_size(LogicalSize::new(width, height));
    if saved.maximized {
        let _ = window.maximize();
    }
}

/// Stores the window's size when it closes. A maximized window keeps the size it had before
/// maximizing, so un-maximizing next session returns to the user's own size.
pub fn save(window: &Window) {
    let Some(file) = path(window.app_handle()) else { return };
    let maximized = window.is_maximized().unwrap_or(false);
    let state = if maximized {
        match load(&file) {
            Some(previous) => WindowState { maximized: true, ..previous },
            None => return, // nothing better to remember than the default size
        }
    } else {
        let Ok(size) = window.inner_size() else { return };
        let scale = window.scale_factor().unwrap_or(1.0);
        let logical = size.to_logical::<f64>(scale);
        WindowState { width: logical.width, height: logical.height, maximized: false }
    };
    // The app is closing, so there's no screen left to show an error on; log it instead.
    if let Err(e) = to_json(&state).and_then(|json| write_atomic(&file, &json)) {
        eprintln!("Couldn't save the window size: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_keeps_the_size_within_minimum_and_screen() {
        let saved = |width, height| WindowState { width, height, maximized: false };
        assert_eq!(fit(saved(1400.0, 900.0), Some((1920.0, 1080.0))), (1400.0, 900.0));
        assert_eq!(fit(saved(2560.0, 1440.0), Some((1920.0, 1080.0))), (1920.0, 1080.0));
        assert_eq!(fit(saved(100.0, 100.0), Some((1920.0, 1080.0))), (360.0, 600.0));
        assert_eq!(fit(saved(1400.0, 900.0), None), (1400.0, 900.0));
    }

    #[test]
    fn state_round_trips_through_json() {
        let state = WindowState { width: 1280.5, height: 800.0, maximized: true };
        let back: WindowState = serde_json::from_str(&to_json(&state).unwrap()).unwrap();
        assert_eq!(back, state);
    }
}
