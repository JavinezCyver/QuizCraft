mod updates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    updates::register(tauri::Builder::default())
        .invoke_handler(tauri::generate_handler![updates::app_update])
        .run(tauri::generate_context!())
        .expect("Failed to run QuizCraft");
}
