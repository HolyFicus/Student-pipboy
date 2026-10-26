/**
 * Pip-Boy 3000 Web Notifications & Push Dispatcher
 */
import { pipAudio } from './audio';

export interface NotificationResult {
  granted: boolean;
  permission: NotificationPermission;
}

export async function requestNotificationPermission(): Promise<NotificationResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, permission: 'denied' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      pipAudio.playSuccess();
      sendNativeNotification({
        title: 'ROBCO SYSTEM INITIALIZED',
        body: 'Канал оперативной связи Pip-Boy 3000 активирован! Вы будете получать push-оповещения об изменениях сайтов.',
        icon: '/icon-192.svg'
      });
    }
    return {
      granted: permission === 'granted',
      permission
    };
  } catch (error) {
    console.error('Notification permission request error:', error);
    return { granted: false, permission: 'denied' };
  }
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export interface SendNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: unknown;
  url?: string;
}

export function sendNativeNotification(opts: SendNotificationOptions): boolean {
  if (typeof window === 'undefined') return false;

  // Sound and vibration feedback
  pipAudio.playAlert();
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([150, 80, 150]);
    } catch {}
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    // Try service worker registration first if available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(opts.title, {
          body: opts.body,
          icon: opts.icon || '/icon-192.svg',
          badge: opts.badge || '/icon-192.svg',
          tag: opts.tag || 'pipboy-alert',
          data: opts.url || window.location.href,
        } as unknown as NotificationOptions).catch(() => {
          // Fallback to window Notification constructor
          new Notification(opts.title, {
            body: opts.body,
            icon: opts.icon || '/icon-192.svg',
          });
        });
      });
      return true;
    }

    // Direct Notification constructor fallback
    new Notification(opts.title, {
      body: opts.body,
      icon: opts.icon || '/icon-192.svg',
    });
    return true;
  } catch (err) {
    console.warn('Native notification failed:', err);
    return false;
  }
}
