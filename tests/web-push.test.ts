import { describe, expect, it, vi, beforeEach } from 'vitest';
import { urlBase64ToUint8Array } from '@/lib/push/client';
import { sendPushNotificationToUser } from '@/lib/push/server';
import webpush from 'web-push';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

const mockSubscriptions = [
  {
    id: 'sub-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/valid-endpoint-1',
    p256dh: 'mock-p256dh-1',
    auth: 'mock-auth-1',
  },
  {
    id: 'sub-2',
    endpoint: 'https://fcm.googleapis.com/fcm/send/stale-endpoint-2',
    p256dh: 'mock-p256dh-2',
    auth: 'mock-auth-2',
  },
  {
    id: 'sub-3',
    endpoint: 'https://fcm.googleapis.com/fcm/send/valid-endpoint-3',
    p256dh: 'mock-p256dh-3',
    auth: 'mock-auth-3',
  },
];

const mockDelete = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ count: 1 }) });
const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: mockSubscriptions, error: null }) });

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'push_subscriptions') {
        return {
          select: mockSelect,
          delete: mockDelete,
        };
      }
      return {};
    },
  }),
}));

describe('Web Push Notification System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BPOpgPYF76-7lewd64cjFS4EgilF25AuySicAiXS_Jz9KObOCGJw9zNjKLYWmyxKW6DqRVrQhqZw6j8JtndJ5ZA';
    process.env.VAPID_PRIVATE_KEY = 'mock-private-key';
    process.env.VAPID_SUBJECT = 'mailto:support@oweme.in';
  });

  it('urlBase64ToUint8Array correctly converts VAPID base64 key to Uint8Array', () => {
    // Provide window.atob polyfill if not present in test env
    if (typeof window !== 'undefined' && !window.atob) {
      window.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
    }

    const vapidKey = 'BPOpgPYF76-7lewd64cjFS4EgilF25AuySicAiXS_Jz9KObOCGJw9zNjKLYWmyxKW6DqRVrQhqZw6j8JtndJ5ZA';
    const uint8 = urlBase64ToUint8Array(vapidKey);

    expect(uint8).toBeInstanceOf(Uint8Array);
    expect(uint8.length).toBeGreaterThan(0);
  });

  it('sendPushNotificationToUser delivers to all devices and automatically prunes 410 Gone subscriptions', async () => {
    // Mock webpush responses: sub-1 and sub-3 succeed, sub-2 fails with 410 Gone
    (webpush.sendNotification as unknown as ReturnType<typeof vi.fn>).mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint.includes('stale-endpoint-2')) {
        const error = new Error('Subscription expired');
        (error as unknown as { statusCode: number }).statusCode = 410;
        return Promise.reject(error);
      }
      return Promise.resolve({ statusCode: 201 });
    });

    const result = await sendPushNotificationToUser('user-123', {
      type: 'payment_paid',
      title: 'Payment confirmation',
      body: 'Manesh marked ₹20 as paid for Dinner.',
      url: '/expenses/exp-123',
      settlement_id: 'exp-123',
    });

    expect(result.delivered).toBe(2);
    expect(result.failed).toBe(1);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('sendPushNotificationToUser gracefully handles missing VAPID keys without throwing', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await sendPushNotificationToUser('user-123', {
      type: 'test',
      title: 'Test',
      body: 'Test',
    });

    expect(result).toEqual({ delivered: 0, failed: 0, pruned: 0 });
  });
});
