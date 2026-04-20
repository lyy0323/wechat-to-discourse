import crypto from 'crypto';
import { cookies } from 'next/headers';

const SECRET = () => process.env.SESSION_SECRET!;

export interface UserSession {
  username: string;
  email: string;
  name: string;
  avatar_url: string;
  exp: number;
}

export function createSessionToken(user: Omit<UserSession, 'exp'>): string {
  const payload: UserSession = { ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET()).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): UserSession | null {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SECRET()).update(encoded).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload: UserSession = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  if (Date.now() > payload.exp) return null;
  return payload;
}

export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
