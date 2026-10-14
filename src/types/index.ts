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
  durationMinutes: number;
  totalSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  progress: number;
  formattedRemaining: string;
}

export type ActivityEventType = 'focused' | 'distracted' | 'away';

export interface ActivityEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: ActivityEventType;
  duration?: number;
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
