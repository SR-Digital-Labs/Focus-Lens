import { isTauri } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appConfig } from '../config/appConfig';
import type {
  ServiceEvent,
  ServiceRequest,
  ServiceResponse,
  Unsubscribe,
} from './contracts';
import { FocusLensServiceError, toServiceError } from './serviceErrors';

export type NativeCommand = (typeof appConfig.nativeCommands)[keyof typeof appConfig.nativeCommands];
export type NativeEvent = (typeof appConfig.nativeEvents)[keyof typeof appConfig.nativeEvents];

export async function sendNativeRequest<TPayload, TData>(
  command: NativeCommand,
  payload: TPayload,
): Promise<TData> {
  if (!isTauri()) {
    throw new FocusLensServiceError('NATIVE_UNAVAILABLE', 'Native services are only available in the desktop app.');
  }

  const request: ServiceRequest<TPayload> = {
    requestId: crypto.randomUUID(),
    payload,
  };

  try {
    const response = await invoke<ServiceResponse<TData>>(command, { request });

    if (response.requestId !== request.requestId) {
      throw new FocusLensServiceError('INVALID_RESPONSE', 'Native response request ID did not match.');
    }
    if (!response.ok) {
      throw toServiceError(response.error ?? {
        code: 'INTERNAL',
        message: 'Native service returned an unspecified error.',
      });
    }
    if (response.data === undefined) {
      throw new FocusLensServiceError('INVALID_RESPONSE', 'Native service response did not include data.');
    }

    return response.data;
  } catch (error) {
    throw toServiceError(error);
  }
}

export async function subscribeToNativeEvent<TPayload>(
  eventName: NativeEvent,
  handler: (event: ServiceEvent<TPayload>) => void,
): Promise<Unsubscribe> {
  if (!isTauri()) {
    return () => undefined;
  }

  try {
    return await listen<ServiceEvent<TPayload>>(eventName, (event) => handler(event.payload));
  } catch (error) {
    throw toServiceError(error);
  }
}