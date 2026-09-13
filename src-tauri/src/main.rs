// 万象转换桌面端：窗口加载纯静态前端（dist/），所有转换仍在本地完成
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebView2 用户数据目录指向独立路径（LOCALAPPDATA\OmniConvert\WebView2）：
    // 1) 不再使用安装目录内的默认 EBWebView —— v0.2.0 遗留的 Service Worker 会
    //    劫持 tauri.localhost 导航（其内部 fetch 被网络 DNS 污染），导致白屏；
    // 2) 前端已在桌面端禁用 SW 注册（见 js/app.js），新目录从源头保证干净。
    if std::env::var("WEBVIEW2_USER_DATA_FOLDER").is_err() {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let dir = std::path::Path::new(&local).join("OmniConvert").join("WebView2");
            if std::fs::create_dir_all(&dir).is_ok() {
                std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &dir);
            }
        }
    }

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
