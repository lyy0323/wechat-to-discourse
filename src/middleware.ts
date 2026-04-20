import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/api/fetch-article', '/api/publish', '/api/categories'];

export function middleware(request: NextRequest) {
  if (PROTECTED_ROUTES.some((r) => request.nextUrl.pathname.startsWith(r))) {
    const session = request.cookies.get('session')?.value;
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
