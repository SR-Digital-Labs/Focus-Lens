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
  requestId: string;
  payload: TPayload;
}

export interface ServiceResponse<TData> {
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
  | 'active'
  | 'unavailable'
  | 'error';

export interface CameraStatus {
  state: CameraState;
  reason?: 'not_implemented' | 'runtime_unavailable' | 'permission_denied' | 'device_unavailable';
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