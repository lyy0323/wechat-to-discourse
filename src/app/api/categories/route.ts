import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getCategories } from '@/lib/discourse';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const result = await getCategories(session.username);
  const categories =
    result.category_list?.categories
      ?.filter((c: { read_restricted: boolean }) => !c.read_restricted)
      .map((c: { id: number; name: string; color: string }) => ({
        id: c.id,
        name: c.name,
        color: c.color,
      })) || [];

  return NextResponse.json({ categories });
}
