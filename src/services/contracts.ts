import type { SessionLifecycleState } from '../types';

export type ServiceErrorCode =
  | 'NATIVE_UNAVAILABLE'
  | 'NOT_IMPLEMENTED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'REQUEST_FAILED'
  | 'INTERNAL';

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  details?: unknown;
}

export interface ServiceRequest<TPayload> {
  protocolVersion: number;
  requestId: string;
  payload: TPayload;
}

export interface ServiceResponse<TData> {
  protocolVersion: number;
  requestId: string;
  ok: boolean;
  data?: TData;
  error?: ServiceError;
}

export interface ServiceEvent<TPayload> {
  eventId: string;
  occurredAt: string;
  sessionId?: string;
  payload: TPayload;
}

export type CameraState =
  | 'unknown'
  | 'inactive'
  | 'requesting'
  | 'starting'
  | 'permission_denied'
  | 'frame_error'
  | 'device_unavailable'
  | 'initialization_failed'
  | 'device_in_use'
  | 'active'
  | 'unavailable'
  | 'error';

export interface CameraStatus {
  state: CameraState;
  reason?: string;
  message?: string;
}

export interface LiveCameraFrame {
  data: HTMLVideoElement;
  frameIndex: number;
  capturedAt: number;
  width: number;
  height: number;
}

export interface ActivitySignal {
  occurredAt: string;
  personPresence: 'present' | 'away' | 'unknown';
  screenFacing: 'facing' | 'looking_away' | 'unknown';
  posture: 'good' | 'slouched' | 'unknown';
  confidence?: number;
  postureReminder?: boolean;
}

export type ActivityMonitoringStatus =
  | 'inactive'
  | 'paused'
  | 'waiting'
  | 'active'
  | 'unavailable'
  | 'error';

export interface ActivityMonitoringState {
  sessionId: string | null;
  status: ActivityMonitoringStatus;
  signal: ActivitySignal | null;
  error: string | null;
}

export type SessionEventType =
  | 'session.started'
  | 'session.paused'
  | 'session.resumed'
  | 'session.completed'
  | 'session.cancelled'
  | 'session.interrupted';

export interface SessionEventPayload {
  type: SessionEventType;
  status: SessionLifecycleState;
}

export interface SessionSnapshot {
  sessionId: string | null;
  status: SessionLifecycleState;
  plannedDurationSeconds: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  elapsedSeconds: number;
  pausedDurationSeconds: number;
}

export interface CvResponse {
  requestId: string;
  status: 'completed' | 'unavailable' | 'failed';
  signal?: ActivitySignal;
  error?: ServiceError;
}

export type Unsubscribe = () => void;