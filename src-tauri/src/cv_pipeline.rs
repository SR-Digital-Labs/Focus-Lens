// FocusLens — CV Pipeline Bridge (Day 24)
// =========================================
// Manages the Python CV subprocess lifecycle and forwards its stdout
// JSON signals to the Tauri event bus.
//
// Communication protocol
// ----------------------
// The Python process writes newline-delimited JSON to stdout.
// Each line is one of:
//
//   ActivitySignal:
//     {"person_presence":"PRESENT","screen_facing":"SCREEN_FACING",
//      "posture":"GOOD_POSTURE","confidence":0.9,"timestamp":1700000000.0,
//      "posture_reminder":false,"occurred_at":"2024-01-01T00:00:00Z"}
//
//   CvStatus (cv-response):
//     {"__type":"cv_status","status":"unavailable","error":"..."}
//
// The bridge emits:
//   "activity-signal" events  <- ActivitySignal lines
//   "cv-response"     events  <- cv_status lines
//
// Privacy guarantee
// -----------------
// Raw webcam frames are never present in the JSON output (enforced in
// cv/app/pipeline.py::_emit_signal). Only typed detection metadata is
// forwarded to the frontend.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter, Manager};

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/// Normalized ActivitySignal forwarded to the frontend as "activity-signal".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySignalEvent {
    pub event_id: String,
    pub occurred_at: String,
    pub payload: ActivitySignalPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySignalPayload {
    pub occurred_at: String,
    pub person_presence: String,
    pub screen_facing: String,
    pub posture: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posture_reminder: Option<bool>,
    // snake_case aliases so the frontend normalizer can pick them up
    // (normalizeActivitySignal in activitySessionMonitor.service.ts
    //  reads both camelCase and snake_case field names)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posture_reminder_snake: Option<bool>,
}

/// CvResponse event forwarded to the frontend as "cv-response".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvResponseEvent {
    pub event_id: String,
    pub occurred_at: String,
    pub payload: CvResponsePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvResponsePayload {
    pub request_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CvErrorPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvErrorPayload {
    pub code: String,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Pipeline state
// ---------------------------------------------------------------------------

struct PipelineState {
    child: Child,
    reader_thread: Option<JoinHandle<()>>,
}

pub struct CvPipelineBridge {
    state: Arc<Mutex<Option<PipelineState>>>,
    running: Arc<Mutex<bool>>,
}

impl CvPipelineBridge {
    pub fn new() -> Self {
        CvPipelineBridge {
            state: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
        }
    }

    /// Start the Python CV pipeline subprocess.
    ///
    /// Locates `cv/main.py` relative to the Tauri app resource directory,
    /// launches `python cv/main.py --headless`, and spawns a background
    /// reader thread that forwards stdout JSON lines as Tauri events.
    pub fn start(&self, app: AppHandle, cv_dir: std::path::PathBuf) -> Result<(), String> {
        if self.is_running()? {
            return Ok(());
        }
        self.stop()?;

        let mut running = self.running.lock().map_err(|e| e.to_string())?;
        if *running {
            return Ok(());
        }
        let mut state_guard = self.state.lock().map_err(|e| e.to_string())?;

        let main_py = cv_dir.join("main.py");
        if !main_py.is_file() {
            return Err(format!(
                "The CV entry point is missing: {}",
                main_py.display()
            ));
        }
        for model in ["face_landmarker.task", "pose_landmarker_lite.task"] {
            let model_path = cv_dir.join("models").join(model);
            if !model_path.is_file() {
                return Err(format!(
                    "The required CV model is missing: {}. Download both models with the scripts in cv/models/ before building or running FocusLens.",
                    model_path.display()
                ));
            }
        }

        // Find `python` / `python3` on PATH
        let python = if cfg!(target_os = "windows") {
            "python"
        } else {
            "python3"
        };

        let mut child = Command::new(python)
            .arg(&main_py)
            .arg("--headless")
            .current_dir(&cv_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit()) // CV log → Tauri's stderr for debugging
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to start Python CV pipeline ({}): {}. \
                     Ensure Python is on PATH and MediaPipe models are downloaded.",
                    python, e
                )
            })?;

        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("CV subprocess did not provide a stdout handle.".to_string());
            }
        };

        let reader_running = Arc::clone(&self.running);
        let app_clone = app.clone();

        // The reader thread reads JSON lines from the Python process stdout
        // and emits them as Tauri events.  It exits when the subprocess
        // closes its stdout (normal or abnormal termination).
        let reader = thread::spawn(move || {
            let reader = BufReader::new(stdout);
            let mut seq: u64 = 0;

            for line_result in reader.lines() {
                // Check if we should still be running
                if let Ok(r) = reader_running.lock() {
                    if !*r {
                        break;
                    }
                }

                let line = match line_result {
                    Ok(l) if !l.trim().is_empty() => l,
                    Ok(_) => continue,
                    Err(_) => break,
                };

                // Parse as JSON
                let value: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("[FocusLens CV] Failed to parse JSON line: {} | {}", e, line);
                        continue;
                    }
                };

                seq += 1;
                let event_id = format!("cv-{}", seq);
                let now = chrono_now_iso();

                // Dispatch based on line type
                if value.get("__type").and_then(Value::as_str) == Some("cv_status") {
                    // Emit as "cv-response" event
                    let status = value.get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("failed")
                        .to_string();
                    let error_msg = value.get("error")
                        .and_then(Value::as_str)
                        .map(|s| s.to_string());

                    let event = CvResponseEvent {
                        event_id,
                        occurred_at: now.clone(),
                        payload: CvResponsePayload {
                            request_id: format!("cv-status-{}", seq),
                            status,
                            error: error_msg.map(|msg| CvErrorPayload {
                                code: "DEVICE_UNAVAILABLE".to_string(),
                                message: msg,
                            }),
                        },
                    };

                    if let Err(e) = app_clone.emit("cv-response", &event) {
                        eprintln!("[FocusLens CV] Failed to emit cv-response event: {}", e);
                    }
                } else {
                    // Treat as ActivitySignal
                    let person_presence = value.get("person_presence")
                        .and_then(Value::as_str)
                        .unwrap_or("UNKNOWN")
                        .to_string();
                    let screen_facing = value.get("screen_facing")
                        .and_then(Value::as_str)
                        .unwrap_or("UNKNOWN")
                        .to_string();
                    let posture = value.get("posture")
                        .and_then(Value::as_str)
                        .unwrap_or("UNKNOWN")
                        .to_string();
                    let confidence = value.get("confidence")
                        .and_then(Value::as_f64);
                    let posture_reminder = value.get("posture_reminder")
                        .and_then(Value::as_bool);
                    let occurred_at = value.get("occurred_at")
                        .and_then(Value::as_str)
                        .unwrap_or(&now)
                        .to_string();

                    let event = ActivitySignalEvent {
                        event_id,
                        occurred_at: occurred_at.clone(),
                        payload: ActivitySignalPayload {
                            occurred_at,
                            person_presence,
                            screen_facing,
                            posture,
                            confidence,
                            posture_reminder,
                            posture_reminder_snake: posture_reminder,
                        },
                    };

                    if let Err(e) = app_clone.emit("activity-signal", &event) {
                        eprintln!("[FocusLens CV] Failed to emit activity-signal event: {}", e);
                    }
                }
            }

            match reader_running.lock() {
                Ok(mut running) => *running = false,
                Err(error) => eprintln!("[FocusLens CV] Unable to update subprocess status: {error}"),
            }
            eprintln!("[FocusLens CV] Reader thread exiting.");
        });

        *running = true;
        *state_guard = Some(PipelineState {
            child,
            reader_thread: Some(reader),
        });

        Ok(())
    }

    /// Stop the Python CV pipeline subprocess and clean up resources.
    pub fn stop(&self) -> Result<(), String> {
        let mut running = self.running.lock().map_err(|e| e.to_string())?;
        *running = false;
        drop(running); // release lock before joining

        let mut state_guard = self.state.lock().map_err(|e| e.to_string())?;
        if let Some(mut state) = state_guard.take() {
            if state.child.try_wait().map_err(|error| {
                format!("Unable to check the CV subprocess status: {error}")
            })?.is_none() {
                state.child.kill().map_err(|error| {
                    format!("Unable to stop the CV subprocess: {error}")
                })?;
                state.child.wait().map_err(|error| {
                    format!("Unable to wait for the CV subprocess to stop: {error}")
                })?;
            }

            if let Some(handle) = state.reader_thread.take() {
                handle
                    .join()
                    .map_err(|_| "The CV subprocess reader thread panicked.".to_string())?;
            }
        }

        Ok(())
    }

    pub fn is_running(&self) -> Result<bool, String> {
        self.running
            .lock()
            .map(|running| *running)
            .map_err(|error| error.to_string())
    }
}

impl Drop for CvPipelineBridge {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("[FocusLens CV] Failed to clean up pipeline resources: {error}");
        }
    }
}

/// Return the current UTC time as an ISO 8601 string using only std.
/// We avoid adding a chrono dependency and instead format manually.
fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    // Format as ISO 8601: use a simple representation
    // Tauri's frontend will parse this with Date.parse()
    let secs = millis / 1_000;
    let ms = millis % 1_000;
    // Convert epoch seconds to a basic UTC datetime string
    // This is a minimal implementation — JavaScript Date.parse() handles it.
    let s = secs as u64;
    let hours = (s / 3600) % 24;
    let minutes = (s / 60) % 60;
    let seconds = s % 60;
    let days = s / 86400;
    // Simple epoch-to-date (good until 2100)
    let (year, month, day) = epoch_days_to_date(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hours, minutes, seconds, ms
    )
}

/// Convert epoch days since 1970-01-01 to (year, month, day).
fn epoch_days_to_date(days: u64) -> (u64, u64, u64) {
    let mut remaining = days;
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        year += 1;
    }
    let months = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for &m in &months {
        if remaining < m {
            break;
        }
        remaining -= m;
        month += 1;
    }
    (year, month, remaining + 1)
}

fn is_leap(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
