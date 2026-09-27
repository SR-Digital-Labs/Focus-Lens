export interface Session {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  isActive: boolean;
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
