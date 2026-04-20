import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/session';

export async function GET(req: NextRequest) {
  const sso = req.nextUrl.searchParams.get('sso');
  const sig = req.nextUrl.searchParams.get('sig');

  if (!sso || !sig) {
    return NextResponse.json({ error: '缺少 SSO 参数' }, { status: 400 });
  }

  // Verify signature
  const expectedSig = crypto
    .createHmac('sha256', process.env.DISCOURSE_CONNECT_SECRET!)
    .update(sso)
    .digest('hex');

  if (sig !== expectedSig) {
    return NextResponse.json({ error: '签名验证失败' }, { status: 401 });
  }

  // Decode payload
  const decoded = Buffer.from(sso, 'base64').toString();
  const params = new URLSearchParams(decoded);

  // Verify nonce
  const nonce = params.get('nonce');
  const storedNonce = req.cookies.get('sso_nonce')?.value;
  if (!nonce || nonce !== storedNonce) {
    return NextResponse.json({ error: 'Nonce 不匹配' }, { status: 401 });
  }

  const user = {
    username: params.get('username') || '',
    email: params.get('email') || '',
    name: params.get('name') || '',
    avatar_url: params.get('avatar_url') || '',
  };

  const token = createSessionToken(user);

  const response = NextResponse.redirect(new URL('/', req.url));
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
  });
  response.cookies.delete('sso_nonce');

  return response;
}
