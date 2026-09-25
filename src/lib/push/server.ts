import 'server-only';

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/server';

export interface PushNotificationPayload {
  type: string;
  title: string;
  body: string;
  url?: string;
  settlement_id?: string;
  tag?: string;
}

let configuredKeys: string | null = null;

function ensureVapidConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@oweme.in';

  if (!publicKey || !privateKey) {
    console.warn('[WebPush] VAPID keys are missing from environment variables.');
    return false;
  }

  const currentConfigKey = `${subject}:${publicKey}:${privateKey}`;
  if (configuredKeys === currentConfigKey) {
    return true;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredKeys = currentConfigKey;
    return true;
  } catch (err) {
    console.error('[WebPush] Failed to configure VAPID details:', err);
    return false;
  }
}

/**
 * Sends a real Web Push notification to all active devices registered by the specified user.
 *
 * Implements:
 *  - Multi-device parallel dispatch via Promise.allSettled
 *  - Automatic cleanup of 404/410/expired subscriptions
 *  - Graceful error isolation (never crashes the calling mutation)
 */
export async function sendPushNotificationToUser(
  userId: string,
  payload: PushNotificationPayload,
): Promise<{ delivered: number; failed: number; pruned: number }> {
  if (!ensureVapidConfigured()) {
    return { delivered: 0, failed: 0, pruned: 0 };
  }

  const service = createServiceClient();
  if (!service) {
    console.warn('[WebPush] Service client unavailable; cannot fetch subscriptions.');
    return { delivered: 0, failed: 0, pruned: 0 };
  }

  // Fetch all registered subscriptions for the recipient
  const { data: subscriptions, error } = await service
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error || !subscriptions || subscriptions.length === 0) {
    return { delivered: 0, failed: 0, pruned: 0 };
  }

  const jsonPayload = JSON.stringify({
    ...payload,
    tag: payload.tag || `oweme-${payload.type}`,
  });

  const staleEndpoints: string[] = [];
  let delivered = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      return webpush.sendNotification(pushSubscription, jsonPayload, {
        TTL: 60 * 60 * 24, // 24 hours
        urgency: 'high',
      });
    }),
  );

  results.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      delivered += 1;
    } else {
      failed += 1;
      const statusCode = (res.reason as { statusCode?: number })?.statusCode;
      // HTTP 404 Not Found or HTTP 410 Gone means the subscription expired or was revoked
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(subscriptions[idx].endpoint);
      } else {
        console.warn(`[WebPush] Failed sending push to ${subscriptions[idx].endpoint.slice(0, 30)}...:`, res.reason);
      }
    }
  });

  // Prune invalid or expired subscriptions from database
  let pruned = 0;
  if (staleEndpoints.length > 0) {
    const { count } = await service
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .in('endpoint', staleEndpoints);
    pruned = count ?? staleEndpoints.length;
  }

  return { delivered, failed, pruned };
}
