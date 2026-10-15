export type SessionLifecycleState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'interrupted';

export type PersistedSessionStatus = Exclude<SessionLifecycleState, 'idle' | 'starting'>;

export interface Session {
  id: string;
  status: PersistedSessionStatus;
  plannedDurationSeconds: number;
  startedAt: string;
  pausedAt: string | null;
  endedAt: string | null;
  elapsedSeconds: number;
  pausedDurationSeconds: number;
}

export type FocusDurationPreset = 25 | 45 | 60;
export const PRESET_DURATIONS: readonly FocusDurationPreset[] = [25, 45, 60] as const;
export const MIN_FOCUS_DURATION_MINUTES = 1;
export const MAX_FOCUS_DURATION_MINUTES = 180;
export const DEFAULT_FOCUS_DURATION_MINUTES = 25;

export type FocusTimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface FocusTimerState {
  status: FocusTimerStatus;
  sessionId: string | null;
  durationMinutes: number;
  totalSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  progress: number;
  formattedRemaining: string;
}

// Session Lifecycle Event Types (from BDS.md Section 8 and contracts.ts)
export type SessionLifecycleEventType =
  | 'SESSION_STARTED'
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'SESSION_ENDED'
  | 'SESSION_COMPLETED';

// Person Presence Event Types (from BDS.md Section 8 and Python PersonState)
export type PersonEventType = 'PERSON_PRESENT' | 'PERSON_AWAY' | 'PERSON_UNKNOWN';

// Screen Facing Event Types (from BDS.md Section 8 and Python ScreenFacingState)
export type ScreenFacingEventType = 'SCREEN_FACING' | 'LOOKING_AWAY' | 'SCREEN_FACING_UNKNOWN';

// Posture Event Types (from BDS.md Section 8 and Python PostureState)
export type PostureEventType = 'POSTURE_GOOD' | 'POSTURE_SLOUCHED' | 'POSTURE_UNKNOWN';

// Unified ActivityEventType preserving backwards compatibility with legacy strings
export type ActivityEventType =
  | PersonEventType
  | ScreenFacingEventType
  | PostureEventType
  | SessionLifecycleEventType
  | 'focused'
  | 'distracted'
  | 'away';

export type ActivityEventCategory = 'person' | 'screen_facing' | 'posture' | 'session';

export interface ActivityEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  occurredAt: string;
  category?: ActivityEventCategory;
  stateValue?: string;
  previousStateValue?: string;
  confidence?: number;
  duration?: number;
  awayStartedAt?: number;
  thresholdReachedAt?: number;
  endedAt?: number | null;
  metadata?: Record<string, unknown>;
}

export interface DetectionSignalInput {
  personPresence?: 'present' | 'away' | 'unknown' | 'PRESENT' | 'AWAY' | 'UNKNOWN' | null;
  screenFacing?: 'facing' | 'looking_away' | 'unknown' | 'SCREEN_FACING' | 'LOOKING_AWAY' | 'UNKNOWN' | null;
  posture?: 'good' | 'slouched' | 'unknown' | 'GOOD_POSTURE' | 'SLOUCHED_POSTURE' | 'SLOUCHED' | 'UNKNOWN' | null;
  confidence?: number | null;
  timestamp?: number | string | null;
  occurredAt?: string | null;
}

export interface PersonPresence {
  isPresent: boolean;
  confidence: number;
  lastUpdated: number;
}

export interface ScreenFacing {
  isFacingScreen: boolean;
  confidence: number;
  lastUpdated: number;
}

export type PostureStatus = 'good' | 'poor' | 'unknown';

export interface Posture {
  status: PostureStatus;
  confidence: number;
  lastUpdated: number;
}

export interface FocusIndicator {
  score: number; // 0 to 100
  trend: 'improving' | 'declining' | 'stable';
  lastUpdated: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notificationsEnabled: boolean;
  autoStartSession: boolean;
}

export interface PrivacySettings {
  saveVideoLocally: boolean;
  blurBackgroundInVideo: boolean;
  dataRetentionDays: number;
}
