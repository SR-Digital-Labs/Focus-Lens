import { isTauri } from '@tauri-apps/api/core';
import {
  cancel,
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { WellnessReminder } from './wellnessReminder.service';

let activeNotificationId: string | null = null;
let activeNotification: Notification | null = null;
let activeNativeNotificationId: number | null = null;
let nextNativeNotificationId = 1;

export async function getWellnessNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (isTauri()) {
    try {
      return await isPermissionGranted() ? 'granted' : 'default';
    } catch (error) {
      console.error('Unable to read Tauri notification permission; checking the web notification API.', error);
    }
  }
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export function isWellnessNotificationSupported(): boolean {
  return isTauri() || typeof Notification !== 'undefined';
}

export async function requestWellnessNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (isTauri()) {
    try {
      if (await isPermissionGranted()) {
        return 'granted';
      }
      return await requestPermission();
    } catch (error) {
      console.error('Unable to request Tauri notification permission; trying the web notification API.', error);
    }
  }
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.requestPermission();
}

export async function showWellnessSystemNotification(
  reminder: WellnessReminder,
): Promise<boolean> {
  if (isTauri()) {
    try {
      if (await isPermissionGranted()) {
        if (activeNotificationId === reminder.id) {
          return true;
        }
        dismissWellnessSystemNotification();
        activeNativeNotificationId = nextNativeNotificationId++;
        activeNotificationId = reminder.id;
        const water = reminder.kind === 'water';
        sendNotification({
          id: activeNativeNotificationId,
          title: water ? 'FocusLens · Water break' : 'FocusLens · Wind down',
          body: water
            ? 'Woof! 🐶 Time to drink some water!'
            : 'It’s time to wrap up and get ready for sleep.',
        });
        return true;
      }
    } catch (error) {
      console.error('Unable to send a Tauri desktop notification; trying the web notification API.', error);
    }
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }
  if (activeNotificationId === reminder.id) {
    return true;
  }
  dismissWellnessSystemNotification();
  const water = reminder.kind === 'water';
  activeNotification = new Notification(water ? 'FocusLens · Water break' : 'FocusLens · Wind down', {
    body: water
      ? 'Woof! 🐶 Time to drink some water!'
      : 'It’s time to wrap up and get ready for sleep.',
    tag: reminder.id,
    requireInteraction: true,
  });
  activeNotificationId = reminder.id;
  activeNotification.addEventListener('close', () => {
    activeNotification = null;
    activeNotificationId = null;
  }, { once: true });
  return true;
}

export function dismissWellnessSystemNotification(): void {
  activeNotification?.close();
  const notificationId = activeNativeNotificationId;
  if (notificationId !== null && isTauri()) {
    void cancel([notificationId])
      .catch((error: unknown) => {
        console.error('Unable to cancel the pending native wellness notification.', error);
      });
  }
  activeNotification = null;
  activeNativeNotificationId = null;
  activeNotificationId = null;
}
