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
        .invoke_handler(tauri::generate_handler![
            get_process_info_list,
            get_process_path,
            kill_process
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
