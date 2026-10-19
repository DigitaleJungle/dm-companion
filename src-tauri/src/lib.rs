mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::home_layout::get_home_cards,
            commands::home_layout::set_home_cards,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
