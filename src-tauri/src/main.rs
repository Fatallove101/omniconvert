// 万象转换桌面端：窗口加载纯静态前端（dist/），所有转换仍在本地完成
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use tauri::webview::DownloadEvent;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 桌面端下载统一落盘到这里：%USERPROFILE%\Downloads\OmniConvert
/// （桌面端没有浏览器的下载栏，固定目录 + 页内提示才能让用户知道文件去哪了）
fn download_dir() -> PathBuf {
    let base = std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("Downloads").join("OmniConvert")
}

/// 前端用它显示“桌面端保存到：…”并在需要时打开目录
#[tauri::command]
fn oc_download_dir() -> String {
    download_dir().to_string_lossy().to_string()
}

/// 在资源管理器中定位文件（文件不存在则打开其所在目录）
#[tauri::command]
fn oc_open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let arg = if p.exists() {
        format!("/select,{}", p.display())
    } else {
        p.parent().map(|d| d.display().to_string()).unwrap_or_default()
    };
    if arg.is_empty() {
        return Err("路径无效".into());
    }
    std::process::Command::new("explorer")
        .arg(arg)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 查询文件大小（前端用它确认"下载真的落盘了"，不依赖上游的下载完成回调）
#[tauri::command]
fn oc_file_size(path: String) -> Option<u64> {
    std::fs::metadata(&path).ok().map(|m| m.len())
}

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
        // 单实例：程序已运行时再次双击/启动，不再新开窗口，而是把已有主窗口提到最前
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![oc_download_dir, oc_open_folder, oc_file_size])
        .setup(|app| {
            // 窗口在 Rust 侧创建（而不是写在 tauri.conf.json 里）：
            // 只有这样才能挂上 on_download —— 把下载固定落到 OmniConvert 目录，
            // 并在完成时把最终路径回传前端显示“已保存到 …”。
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("万象转换 OmniConvert")
                .inner_size(1200.0, 820.0)
                .min_inner_size(380.0, 560.0)
                .center()
                .on_download(|webview, event| {
                    match event {
                        DownloadEvent::Requested { destination, .. } => {
                            let dir = download_dir();
                            let _ = std::fs::create_dir_all(&dir);
                            let name = destination
                                .file_name()
                                .map(|s| s.to_owned())
                                .unwrap_or_else(|| std::ffi::OsString::from("omniconvert-output"));
                            *destination = dir.join(name);
                        }
                        DownloadEvent::Finished { path, success, .. } => {
                            let payload = serde_json::json!({
                                "success": success,
                                "path": path.as_ref().map(|p| p.to_string_lossy().to_string()),
                            });
                            let _ = webview.emit("oc-download-finished", payload);
                        }
                        _ => {} // DownloadEvent 是 non_exhaustive，预留分支
                    }
                    true // 允许下载继续
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
