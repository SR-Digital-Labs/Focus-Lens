import { isTauri } from '@tauri-apps/api/core';
import { appConfig } from '../config/appConfig.ts';
import type {
  ActivitySignal,
  CameraStatus,
  CvPipelineStatus,
  CvResponse,
  ServiceEvent,
  SessionEventPayload,
  Unsubscribe,
} from './contracts.ts';
import { sendNativeRequest, subscribeToNativeEvent } from './nativeTransport.ts';
import {
  activityEventTracker,
  type ActivityEventTrackerService,
} from './activityEventTracker.service.ts';

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
    /**
     * Connects native ActivitySignals directly to the ActivityEventTracker.
     * Ready for Ragavi's CV signals pipeline (Day 18 integration).
     */
    async connectToEventTracker(
      tracker: ActivityEventTrackerService = activityEventTracker,
    ): Promise<Unsubscribe> {
      return subscribeToNativeEvent<ActivitySignal>(
        appConfig.nativeEvents.activitySignal,
        (event: ServiceEvent<ActivitySignal>) => {
          if (event.payload) {
            tracker.processSignal({
              personPresence: event.payload.personPresence,
              screenFacing: event.payload.screenFacing,
              posture: event.payload.posture,
              confidence: event.payload.confidence,
              occurredAt: event.occurredAt || event.payload.occurredAt,
            });
          }
        },
      );
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
    async start(): Promise<CvPipelineStatus> {
      if (!isTauri()) {
        return { running: false, message: 'Runtime unavailable (not running in Tauri desktop).' };
      }
      return sendNativeRequest<Record<string, never>, CvPipelineStatus>(
        appConfig.nativeCommands.startCvPipeline,
        {},
      );
    },
    async stop(): Promise<CvPipelineStatus> {
      if (!isTauri()) {
        return { running: false, message: 'Runtime unavailable (not running in Tauri desktop).' };
      }
      return sendNativeRequest<Record<string, never>, CvPipelineStatus>(
        appConfig.nativeCommands.stopCvPipeline,
        {},
      );
    },
  },
};