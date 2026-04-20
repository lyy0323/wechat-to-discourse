import crypto from 'crypto';
import { NextResponse } from 'next/server';

export async function GET() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;

  const payload = `nonce=${nonce}&return_sso_url=${encodeURIComponent(returnUrl)}`;
  const base64Payload = Buffer.from(payload).toString('base64');
  const sig = crypto
    .createHmac('sha256', process.env.DISCOURSE_CONNECT_SECRET!)
    .update(base64Payload)
    .digest('hex');

  const discourseUrl = `${process.env.DISCOURSE_URL}/session/sso_provider?sso=${encodeURIComponent(base64Payload)}&sig=${sig}`;

  const response = NextResponse.redirect(discourseUrl);
  response.cookies.set('sso_nonce', nonce, {
    httpOnly: true,
    maxAge: 600,
    sameSite: 'lax',
  });
  return response;
}
