'use client';

import { getClient } from '@/lib/supabase/client';

/**
 * Converts a URL-safe Base64 string to a Uint8Array for PushManager subscription.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData =
    typeof window !== 'undefined' && typeof window.atob === 'function'
      ? window.atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks whether Web Push API is supported on this browser/platform.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Detects if the device is iOS Safari and NOT running in standalone (Add to Home Screen) mode.
 * On iOS, Web Push is only supported when installed to Home Screen (iOS 16.4+).
 */
export function isIosNonStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) && !/windows phone/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
  return isIos && !isStandalone;
}

/**
 * Gets the current active PushSubscription from the service worker if one exists.
 */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribes the current device to Web Push and saves the subscription to Supabase.
 */
async function getVapidPublicKey(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (fromEnv) return fromEnv;

  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (res.ok) {
      const data = (await res.json()) as { publicKey?: string };
      if (data?.publicKey) return data.publicKey;
    }
  } catch {
    // Non-blocking fallback
  }

  // Pre-configured public key fallback
  return 'BPOpgPYF76-7lewd64cjFS4EgilF25AuySicAiXS_Jz9KObOCGJw9zNjKLYWmyxKW6DqRVrQhqZw6j8JtndJ5ZA';
}

export async function subscribeDeviceToPush(): Promise<{
  success: boolean;
  error?: string;
  subscription?: PushSubscription;
}> {
  if (!isPushSupported()) {
    if (isIosNonStandalone()) {
      return {
        success: false,
        error: 'On iPhone / iPad, you must first add OWEME to your Home Screen to enable background push notifications.',
      };
    }
    return {
      success: false,
      error: 'Web Push is not supported by your current browser.',
    };
  }

  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) {
    return {
      success: false,
      error: 'VAPID public key is not configured on this server.',
    };
  }

  try {
    // 1. Request user permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error:
          permission === 'denied'
            ? 'Notifications are blocked. Please enable them in your browser or device settings.'
            : 'Notification permission was dismissed.',
      };
    }

    // 2. Ensure Service Worker is registered and ready
    const reg = await navigator.serviceWorker.ready;

    // 3. Check for existing subscription or create a new one
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });
    }

    // 4. Extract keys
    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint;
    const p256dh = subJson.keys?.p256dh;
    const auth = subJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return {
        success: false,
        error: 'Failed to retrieve full push subscription keys from device.',
      };
    }

    // 5. Store in Supabase
    const supabase = getClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: 'You must be signed in to enable notifications.',
      };
    }

    const { error: dbError } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        last_used_at: new Date().toISOString(),
      },
      {
        onConflict: 'endpoint',
      },
    );

    if (dbError) {
      console.error('Failed to save push subscription in database:', dbError);
      return {
        success: false,
        error: 'Failed to store notification subscription in database.',
      };
    }

    return {
      success: true,
      subscription,
    };
  } catch (err: unknown) {
    console.error('subscribeDeviceToPush error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error subscribing to push alerts.',
    };
  }
}

/**
 * Unsubscribes the current device from Web Push and removes it from Supabase.
 */
export async function unsubscribeDeviceFromPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: true };

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Remove from database
      const supabase = getClient();
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('unsubscribeDeviceFromPush error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unsubscribe.',
    };
  }
}
