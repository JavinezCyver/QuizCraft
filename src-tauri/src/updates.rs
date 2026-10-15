#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct UpdateHandle(tauri::plugin::PluginHandle<tauri::Wry>);

pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    #[cfg(target_os = "android")]
    return builder.plugin(
        tauri::plugin::Builder::<tauri::Wry, ()>::new("app-updates")
            .setup(|app, api| {
                app.manage(UpdateHandle(api.register_android_plugin(
                    "com.quizcraft.app",
                    "AppUpdatesPlugin",
                )?));
                Ok(())
            })
            .build(),
    );
    #[cfg(not(target_os = "android"))]
    builder
}

// No URLs, paths, or package identifiers are accepted from the webview.
#[tauri::command]
pub async fn app_update(
    app: tauri::AppHandle,
    action: String,
) -> Result<serde_json::Value, String> {
    if !matches!(
        action.as_str(),
        "status" | "check" | "download" | "install" | "allow"
    ) {
        return Err("Unknown update action".into());
    }
    #[cfg(target_os = "android")]
    {
        let handle = app.state::<UpdateHandle>().0.clone();
        handle
            .run_mobile_plugin_async(&action, serde_json::json!({}))
            .await
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("In-app installation is available in the Android app.".into())
    }
}
