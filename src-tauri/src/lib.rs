use serde::{Deserialize, Serialize};

mod config;

use config::SERVICE_PROTOCOL_VERSION;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceRequest<T> {
    protocol_version: u32,
    request_id: String,
    payload: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceResponse<T> {
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
    message: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CameraStatus {
    state: &'static str,
    reason: &'static str,
}

#[derive(Deserialize)]
struct EmptyPayload {}

#[tauri::command]
fn get_camera_status(request: ServiceRequest<EmptyPayload>) -> ServiceResponse<CameraStatus> {
    let ServiceRequest {
        protocol_version,
        request_id,
        payload: _,
    } = request;

    if protocol_version != SERVICE_PROTOCOL_VERSION {
        return ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id,
            ok: false,
            data: None,
            error: Some(ServiceError {
                code: "INVALID_REQUEST",
                message: "Unsupported service protocol version.",
            }),
        };
    }

    ServiceResponse {
        protocol_version: SERVICE_PROTOCOL_VERSION,
        request_id,
        ok: true,
        data: Some(CameraStatus {
            state: "unavailable",
            reason: "not_implemented",
        }),
        error: None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_camera_status])
        .run(tauri::generate_context!())
        .expect("error while running FocusLens");
}
