import { isTauri } from '@tauri-apps/api/core';
import { appConfig } from '../config/appConfig';
import type {
  ActivitySignal,
  CameraStatus,
  CvResponse,
  ServiceEvent,
  SessionEventPayload,
  Unsubscribe,
} from './contracts';
import { sendNativeRequest, subscribeToNativeEvent } from './nativeTransport';

export const focusLensService = {
  camera: {
    async getStatus(): Promise<CameraStatus> {
      if (!isTauri()) {
        return { state: 'unavailable', reason: 'runtime_unavailable' };
      }

      return sendNativeRequest<Record<string, never>, CameraStatus>(
        appConfig.nativeCommands.getCameraStatus,
        {},
      );
    },
  },
  activity: {
    subscribe(handler: (event: ServiceEvent<ActivitySignal>) => void): Promise<Unsubscribe> {
      return subscribeToNativeEvent(appConfig.nativeEvents.activitySignal, handler);
    },
  },
  session: {
    subscribe(handler: (event: ServiceEvent<SessionEventPayload>) => void): Promise<Unsubscribe> {
      return subscribeToNativeEvent(appConfig.nativeEvents.sessionEvent, handler);
    },
  },
  cv: {
    subscribe(handler: (event: ServiceEvent<CvResponse>) => void): Promise<Unsubscribe> {
      return subscribeToNativeEvent(appConfig.nativeEvents.cvResponse, handler);
    },
  },
};