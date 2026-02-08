mod netstat;
mod process_info;

use process_info::ProcessInfo;

#[tauri::command]
fn get_process_info_list() -> Result<Vec<ProcessInfo>, String> {
    netstat::fetch_process_info_list()
}

#[tauri::command]
fn get_process_path(_pid: u32) -> String {
    // Stub — same as the current Electron implementation
    String::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_process_info_list,
            get_process_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
