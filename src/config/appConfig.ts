export const appConfig = {
  serviceProtocolVersion: 1,
  nativeCommands: {
    getCameraStatus: 'get_camera_status',
  },
  nativeEvents: {
    activitySignal: 'activity-signal',
    sessionEvent: 'session-event',
    cvResponse: 'cv-response',
  },
} as const;