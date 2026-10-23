use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

mod config;
mod cv_pipeline;

use config::SERVICE_PROTOCOL_VERSION;
use cv_pipeline::CvPipelineBridge;

// ---------------------------------------------------------------------------
// Service protocol types (shared with the frontend)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ServiceRequest<T> {
    protocol_version: u32,
    request_id: String,
    payload: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceResponse<T: Serialize> {
    protocol_version: u32,
    request_id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ServiceError>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceError {
    code: &'static str,
    message: String,
}

impl ServiceError {
    fn static_message(code: &'static str, message: &'static str) -> Self {
        ServiceError {
            code,
            message: message.to_string(),
        }
    }

    fn dynamic_message(code: &'static str, message: String) -> Self {
        ServiceError { code, message }
    }
}

// ---------------------------------------------------------------------------
// Camera status command
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CameraStatus {
    state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyPayload {}

fn validate_request<T>(
    request: &ServiceRequest<T>,
) -> Option<ServiceResponse<()>> {
    if request.protocol_version != SERVICE_PROTOCOL_VERSION {
        return Some(ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id.clone(),
            ok: false,
            data: None,
            error: Some(ServiceError::static_message(
                "INVALID_REQUEST",
                "Unsupported service protocol version.",
            )),
        });
    }
    if request.request_id.trim().is_empty() {
        return Some(ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id.clone(),
            ok: false,
            data: None,
            error: Some(ServiceError::static_message(
                "INVALID_REQUEST",
                "Request ID must not be empty.",
            )),
        });
    }
    None
}

#[tauri::command]
fn get_camera_status(
    request: ServiceRequest<EmptyPayload>,
    bridge: State<'_, Mutex<CvPipelineBridge>>,
) -> ServiceResponse<CameraStatus> {
    if let Some(err_response) = validate_request(&request) {
        return ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: err_response.request_id,
            ok: false,
            data: None,
            error: err_response.error,
        };
    }

    let is_running = match bridge.lock() {
        Ok(bridge) => match bridge.is_running() {
            Ok(is_running) => is_running,
            Err(error) => {
                return ServiceResponse {
                    protocol_version: SERVICE_PROTOCOL_VERSION,
                    request_id: request.request_id,
                    ok: false,
                    data: None,
                    error: Some(ServiceError::dynamic_message("INTERNAL", error)),
                };
            }
        },
        Err(error) => {
            return ServiceResponse {
                protocol_version: SERVICE_PROTOCOL_VERSION,
                request_id: request.request_id,
                ok: false,
                data: None,
                error: Some(ServiceError::dynamic_message("INTERNAL", error.to_string())),
            };
        }
    };

    let status = if is_running {
        CameraStatus {
            state: "active".to_string(),
            reason: None,
            message: Some("CV pipeline is running.".to_string()),
        }
    } else {
        CameraStatus {
            state: "inactive".to_string(),
            reason: Some("cv_pipeline_stopped".to_string()),
            message: Some("CV pipeline is not running.".to_string()),
        }
    };

    ServiceResponse {
        protocol_version: SERVICE_PROTOCOL_VERSION,
        request_id: request.request_id,
        ok: true,
        data: Some(status),
        error: None,
    }
}

// ---------------------------------------------------------------------------
// CV pipeline start / stop commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CvPipelineStatus {
    running: bool,
    message: String,
}

#[tauri::command]
fn start_cv_pipeline(
    app: tauri::AppHandle,
    request: ServiceRequest<EmptyPayload>,
    bridge: State<'_, Mutex<CvPipelineBridge>>,
) -> ServiceResponse<CvPipelineStatus> {
    if let Some(err_response) = validate_request(&request) {
        return ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: err_response.request_id,
            ok: false,
            data: None,
            error: err_response.error,
        };
    }

    let guard = match bridge.lock() {
        Ok(g) => g,
        Err(e) => {
            return ServiceResponse {
                protocol_version: SERVICE_PROTOCOL_VERSION,
                request_id: request.request_id,
                ok: false,
                data: None,
                error: Some(ServiceError::dynamic_message("INTERNAL", e.to_string())),
            };
        }
    };

    let already_running = match guard.is_running() {
        Ok(is_running) => is_running,
        Err(error) => {
            return ServiceResponse {
                protocol_version: SERVICE_PROTOCOL_VERSION,
                request_id: request.request_id,
                ok: false,
                data: None,
                error: Some(ServiceError::dynamic_message("INTERNAL", error)),
            };
        }
    };
    if already_running {
        return ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id,
            ok: true,
            data: Some(CvPipelineStatus {
                running: true,
                message: "CV pipeline is already running.".to_string(),
            }),
            error: None,
        };
    }

    let cv_dir = match resolve_cv_dir(&app) {
        Ok(path) => path,
        Err(message) => {
            return ServiceResponse {
                protocol_version: SERVICE_PROTOCOL_VERSION,
                request_id: request.request_id,
                ok: false,
                data: None,
                error: Some(ServiceError::dynamic_message("DEVICE_UNAVAILABLE", message)),
            };
        }
    };

    match guard.start(app.clone(), cv_dir) {
        Ok(()) => ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id,
            ok: true,
            data: Some(CvPipelineStatus {
                running: true,
                message: "CV pipeline started.".to_string(),
            }),
            error: None,
        },
        Err(e) => ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id,
            ok: false,
            data: None,
            error: Some(ServiceError::dynamic_message("DEVICE_UNAVAILABLE", e)),
        },
    }
}

#[tauri::command]
fn stop_cv_pipeline(
    request: ServiceRequest<EmptyPayload>,
    bridge: State<'_, Mutex<CvPipelineBridge>>,
) -> ServiceResponse<CvPipelineStatus> {
    if let Some(err_response) = validate_request(&request) {
        return ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: err_response.request_id,
            ok: false,
            data: None,
            error: err_response.error,
        };
    }

    let guard = match bridge.lock() {
        Ok(g) => g,
        Err(e) => {
            return ServiceResponse {
                protocol_version: SERVICE_PROTOCOL_VERSION,
                request_id: request.request_id,
                ok: false,
                data: None,
                error: Some(ServiceError::dynamic_message("INTERNAL", e.to_string())),
            };
        }
    };

    match guard.stop() {
        Ok(()) => ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id,
            ok: true,
            data: Some(CvPipelineStatus {
                running: false,
                message: "CV pipeline stopped.".to_string(),
            }),
            error: None,
        },
        Err(e) => ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: request.request_id,
            ok: false,
            data: None,
            error: Some(ServiceError::dynamic_message("INTERNAL", e)),
        },
    }
}

// ---------------------------------------------------------------------------
// Helper: locate the cv/ directory
// ---------------------------------------------------------------------------

fn resolve_cv_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join("cv");
        if is_cv_directory(&candidate) {
            return Ok(candidate);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(candidate) = find_cv_directory(exe.as_path()) {
            return Ok(candidate);
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(candidate) = find_cv_directory(&current_dir) {
            return Ok(candidate);
        }
    }

    Err(
        "The local CV resources could not be found. Reinstall FocusLens or restore its bundled cv/ directory."
            .to_string(),
    )
}

fn find_cv_directory(start: &Path) -> Option<PathBuf> {
    start.ancestors().find_map(|directory| {
        let candidate = directory.join("cv");
        if is_cv_directory(&candidate) {
            Some(candidate)
        } else {
            None
        }
    })
}

fn is_cv_directory(path: &Path) -> bool {
    path.join("main.py").is_file()
}

fn stop_pipeline_on_exit(app_handle: &tauri::AppHandle) {
    let Some(bridge) = app_handle.try_state::<Mutex<CvPipelineBridge>>() else {
        return;
    };
    match bridge.lock() {
        Ok(bridge) => {
            if let Err(error) = bridge.stop() {
                eprintln!("[FocusLens] Failed to stop CV pipeline during shutdown: {error}");
            }
        }
        Err(error) => eprintln!("[FocusLens] CV pipeline state was poisoned during shutdown: {error}"),
    }
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:focuslens.db",
                    vec![tauri_plugin_sql::Migration {
                        version: 1,
                        description: "initial_focuslens_schema",
                        sql: include_str!("../migrations/0001_initial.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .manage(Mutex::new(CvPipelineBridge::new()))
        .invoke_handler(tauri::generate_handler![
            get_camera_status,
            start_cv_pipeline,
            stop_cv_pipeline,
        ])
        .build(tauri::generate_context!())
        .expect("error while building FocusLens");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            stop_pipeline_on_exit(&app_handle);
        }
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{find_cv_directory, is_cv_directory, EmptyPayload, ServiceRequest};
    use crate::config::SERVICE_PROTOCOL_VERSION;
    use crate::cv_pipeline::CvPipelineBridge;
    use std::sync::Mutex;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_bridge() -> Mutex<CvPipelineBridge> {
        Mutex::new(CvPipelineBridge::new())
    }

    #[test]
    fn cv_pipeline_bridge_is_not_running_initially() {
        let bridge = make_bridge();
        let guard = bridge.lock().unwrap();
        assert!(!guard.is_running().unwrap());
    }

    #[test]
    fn cv_pipeline_stop_when_not_running_is_idempotent() {
        let bridge = make_bridge();
        let guard = bridge.lock().unwrap();
        assert!(guard.stop().is_ok());
        assert!(!guard.is_running().unwrap());
    }

    #[test]
    fn cv_resource_lookup_requires_the_entry_point_and_finds_parent_resource_directory() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("focuslens-cv-resource-{unique}"));
        let cv_dir = root.join("cv");
        fs::create_dir_all(&cv_dir).unwrap();

        assert!(!is_cv_directory(&cv_dir));
        assert!(find_cv_directory(&root).is_none());

        fs::write(cv_dir.join("main.py"), "pass").unwrap();
        assert!(is_cv_directory(&cv_dir));
        assert_eq!(find_cv_directory(&root), Some(cv_dir.clone()));

        fs::remove_dir_all(root).unwrap();
    }

    // Note: get_camera_status requires a Tauri AppHandle via State<>, which
    // cannot easily be constructed in a unit test.  The existing command-level
    // tests verify the ServiceResponse shape; the bridge is tested above.
    //
    // Full integration (Python subprocess + Tauri events) must be verified
    // by running `npm run tauri:dev` with a webcam present.
}
