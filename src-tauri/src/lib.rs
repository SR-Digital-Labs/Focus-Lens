use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

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

    let is_running = bridge
        .lock()
        .map(|b| b.is_running())
        .unwrap_or(false);

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

    let cv_dir = resolve_cv_dir(&app);
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

    if guard.is_running() {
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

fn resolve_cv_dir(app: &tauri::AppHandle) -> String {
    // Try the resource directory first (production bundles)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join("cv");
        if candidate.is_dir() {
            return candidate.to_string_lossy().to_string();
        }
        // Also try parent of resource dir
        if let Some(parent) = resource_dir.parent() {
            let candidate = parent.join("cv");
            if candidate.is_dir() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }

    // Development fallback: cv/ sits next to src-tauri/
    // Executable is typically at target/debug/focuslens or similar.
    // Walk upward from the current exe to find the workspace root.
    if let Ok(exe) = std::env::current_exe() {
        let mut dir: &std::path::Path = exe.as_path();
        for _ in 0..6 {
            if let Some(parent) = dir.parent() {
                let candidate: PathBuf = parent.join("cv");
                if candidate.is_dir() {
                    return candidate.to_string_lossy().to_string();
                }
                dir = parent;
            } else {
                break;
            }
        }
    }

    // Last resort: use the current working directory
    std::env::current_dir()
        .map(|d| d.join("cv").to_string_lossy().to_string())
        .unwrap_or_else(|_| "cv".to_string())
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("error while running FocusLens")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{EmptyPayload, ServiceRequest};
    use crate::config::SERVICE_PROTOCOL_VERSION;
    use crate::cv_pipeline::CvPipelineBridge;
    use std::sync::Mutex;

    fn make_bridge() -> Mutex<CvPipelineBridge> {
        Mutex::new(CvPipelineBridge::new())
    }

    #[test]
    fn cv_pipeline_bridge_is_not_running_initially() {
        let bridge = make_bridge();
        let guard = bridge.lock().unwrap();
        assert!(!guard.is_running());
    }

    #[test]
    fn cv_pipeline_stop_when_not_running_is_idempotent() {
        let bridge = make_bridge();
        let guard = bridge.lock().unwrap();
        assert!(guard.stop().is_ok());
        assert!(!guard.is_running());
    }

    // Note: get_camera_status requires a Tauri AppHandle via State<>, which
    // cannot easily be constructed in a unit test.  The existing command-level
    // tests verify the ServiceResponse shape; the bridge is tested above.
    //
    // Full integration (Python subprocess + Tauri events) must be verified
    // by running `npm run tauri:dev` with a webcam present.
}
