// 万象转换桌面端：窗口加载纯静态前端（dist/），所有转换仍在本地完成
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
