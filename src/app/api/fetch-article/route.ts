import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { parseWechatArticle } from '@/lib/wechat-parser';
import { isXiaohongshuUrl, parseXiaohongshuNote } from '@/lib/xiaohongshu-parser';
import { validateExternalUrl } from '@/lib/utils';

const ALLOWED_HOSTS = [
  'mp.weixin.qq.com',
  'xiaohongshu.com',
  'xhslink.com',
];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json();
  const url = typeof body?.url === 'string' ? body.url.trim() : '';

  if (!url) {
    return NextResponse.json({ error: '请提供链接' }, { status: 400 });
  }

  if (url.length > 2048) {
    return NextResponse.json({ error: '链接过长' }, { status: 400 });
  }

  try {
    validateExternalUrl(url, ALLOWED_HOSTS);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '链接不合法' },
      { status: 400 },
    );
  }

  try {
    let article;
    let platform: string;
    if (isXiaohongshuUrl(url)) {
      article = await parseXiaohongshuNote(url);
      platform = 'xiaohongshu';
    } else {
      article = await parseWechatArticle(url);
      platform = 'wechat';
    }
    return NextResponse.json({ ...article, platform });
  } catch (e) {
    const message = e instanceof Error ? e.message : '解析失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
