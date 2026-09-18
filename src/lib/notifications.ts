'use client';

import { toast } from 'sonner';

/**
 * Checks if browser Notification API is available.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Gets the current notification permission.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Requests notification permission from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

/**
 * Synthesizes a pleasant, subtle two-tone chime using Web Audio API.
 * Guaranteed to work without needing to fetch external sound files.
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    // First note: A5 (880 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // Second note: E6 (1318.5 Hz) - bright, harmonic resolve
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.08);
    gain2.gain.setValueAtTime(0.09, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.32);
  } catch {
    // AudioContext might be blocked before user gesture; gracefully ignore
  }
}

/**
 * Vibrates device on mobile devices that support the Vibration API.
 */
export function vibrateDevice(pattern: number[] = [120, 60, 120]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration errors
    }
  }
}

export interface ShowNotificationOptions {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * Triggers a native system/browser notification for desktop & mobile.
 * Tries ServiceWorkerRegistration.showNotification first (required by Android Chrome/PWAs),
 * then falls back to window.Notification.
 */
export async function showNativeNotification({
  title,
  body,
  url = '/notifications',
  tag = 'oweme-alert',
}: ShowNotificationOptions): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag,
    data: { url },
  };

  // 1. Try ServiceWorkerRegistration (best for Android Chrome, iOS PWA, and Desktop)
  if ('serviceWorker' in navigator) {
    try {
      const reg: ServiceWorkerRegistration | undefined =
        (await navigator.serviceWorker.ready) ?? (await navigator.serviceWorker.getRegistration());
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return true;
      }
    } catch (e) {
      console.debug('ServiceWorker showNotification failed, trying fallback', e);
    }
  }

  // 2. Fallback to standard window.Notification constructor
  try {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      tag,
    });
    notification.onclick = () => {
      window.focus();
      if (url) {
        window.location.href = url;
      }
      notification.close();
    };
    return true;
  } catch (e) {
    console.debug('Standard Notification constructor failed', e);
    return false;
  }
}

/**
 * Sends a live test notification to verify audio, vibration, toast, and system notifications.
 */
export async function testDeviceNotification(): Promise<void> {
  // Sound & vibration
  playNotificationSound();
  vibrateDevice();

  let perm = getNotificationPermission();
  if (perm === 'default') {
    perm = await requestNotificationPermission();
  }

  // Interactive in-app toast
  toast.success('Test Notification Received!', {
    description: 'Sound, vibration, and real-time alerts are working on this device.',
    duration: 5000,
  });

  if (perm === 'granted') {
    await showNativeNotification({
      title: 'OweMe [BETA] Alert',
      body: 'Desktop & phone notifications are active! You will receive alerts when friends pay or add expenses.',
      url: '/notifications',
      tag: 'test-notification',
    });
  } else if (perm === 'denied') {
    toast.error('Browser notifications are blocked in your site permissions. Enable them in site settings for lock screen alerts.');
  }
}
