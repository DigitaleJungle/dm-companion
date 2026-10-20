mod commands;
mod rules;
mod storage;
mod window_state;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                window_state::restore(&main.as_ref().window());
            }
            Ok(())
        })
        // The window starts hidden; show it once the page is ready, already at its saved size.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.window().show(); // nothing sensible to do if the OS refuses
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                window_state::save(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::campaigns::list_campaigns,
            commands::campaigns::create_campaign,
            commands::campaigns::open_campaign,
            commands::campaigns::rename_campaign,
            commands::campaigns::archive_campaign,
            commands::campaigns::restore_campaign,
            commands::campaigns::delete_archived_campaign,
            commands::home_layout::get_home_cards,
            commands::home_layout::set_home_cards,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::rules::rules_status,
            commands::rules::rules_import,
            commands::rules::rules_import_images,
            commands::rules::rules_remove_images,
            commands::rules::rules_remove_sources,
            commands::rules::rules_allow_source,
            commands::rules::rules_book,
            commands::rules::rules_chapter,
            commands::rules::rules_entity,
            commands::rules::rules_find,
            commands::rules::rules_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
