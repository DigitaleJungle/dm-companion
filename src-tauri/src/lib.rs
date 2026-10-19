mod commands;
mod rules;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            commands::rules::rules_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
