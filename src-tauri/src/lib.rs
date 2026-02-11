mod netstat;
mod process_info;

use process_info::ProcessInfo;
use sysinfo::{Pid, ProcessesToUpdate, System};

#[tauri::command]
fn get_process_info_list() -> Result<Vec<ProcessInfo>, String> {
    netstat::fetch_process_info_list()
}

#[tauri::command]
fn get_process_path(_pid: u32) -> String {
    // Stub — same as the current Electron implementation
    String::new()
}

#[tauri::command]
fn kill_process(pid: u32) -> Result<(), String> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let process = sys
        .process(Pid::from_u32(pid))
        .ok_or_else(|| format!("Process with PID {} not found", pid))?;

    if process.kill() {
        Ok(())
    } else {
        Err(format!("Failed to kill process with PID {}", pid))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            // decorations: true in tauri.conf.json is required for macOS — it keeps the
            // native traffic light buttons (close/minimize/fullscreen). Combined with
            // titleBarStyle: "Overlay" and hiddenTitle: true, the title bar becomes
            // transparent while the traffic lights float over our web content.
            //
            // On Windows, however, decorations: true shows a full native title bar,
            // which duplicates our custom React title bar. So we disable it here,
            // before the window becomes visible (visible: false in config).
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_process_info_list,
            get_process_path,
            kill_process
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
