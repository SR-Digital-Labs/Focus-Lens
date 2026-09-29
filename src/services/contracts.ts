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
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
}

export interface CvResponse {
  requestId: string;
  status: 'completed' | 'unavailable' | 'failed';
  signal?: ActivitySignal;
  error?: ServiceError;
}

export type Unsubscribe = () => void;