import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    'BPOpgPYF76-7lewd64cjFS4EgilF25AuySicAiXS_Jz9KObOCGJw9zNjKLYWmyxKW6DqRVrQhqZw6j8JtndJ5ZA';

  return NextResponse.json({
    publicKey,
    configured: Boolean(publicKey),
  });
}
