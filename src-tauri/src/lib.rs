use serde::{Deserialize, Serialize};

mod config;

use config::SERVICE_PROTOCOL_VERSION;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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

    if request_id.trim().is_empty() {
        return ServiceResponse {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id,
            ok: false,
            data: None,
            error: Some(ServiceError {
                code: "INVALID_REQUEST",
                message: "Request ID must not be empty.",
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
        .invoke_handler(tauri::generate_handler![get_camera_status])
        .run(tauri::generate_context!())
        .expect("error while running FocusLens");
}

#[cfg(test)]
mod tests {
    use super::{get_camera_status, EmptyPayload, ServiceRequest};
    use crate::config::SERVICE_PROTOCOL_VERSION;

    #[test]
    fn rejects_unsupported_protocol_versions_with_a_structured_error() {
        let response = get_camera_status(ServiceRequest {
            protocol_version: SERVICE_PROTOCOL_VERSION + 1,
            request_id: "request-1".into(),
            payload: EmptyPayload {},
        });

        assert!(!response.ok);
        assert_eq!(response.request_id, "request-1");
        assert_eq!(response.error.expect("error response").code, "INVALID_REQUEST");
    }

    #[test]
    fn rejects_empty_request_ids_with_a_structured_error() {
        let response = get_camera_status(ServiceRequest {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: "  ".into(),
            payload: EmptyPayload {},
        });

        assert!(!response.ok);
        assert_eq!(response.error.expect("error response").code, "INVALID_REQUEST");
    }

    #[test]
    fn returns_an_explicit_unavailable_camera_status() {
        let response = get_camera_status(ServiceRequest {
            protocol_version: SERVICE_PROTOCOL_VERSION,
            request_id: "request-1".into(),
            payload: EmptyPayload {},
        });
        let camera = response.data.expect("successful response data");

        assert!(response.ok);
        assert_eq!(camera.state, "unavailable");
        assert_eq!(camera.reason, "not_implemented");
    }
}
