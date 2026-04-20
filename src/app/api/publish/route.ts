import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { uploadImage, createPost } from '@/lib/discourse';
import { downloadImage } from '@/lib/wechat-parser';

const MAX_CONCURRENCY = 3;

async function processImageBatch(
  images: { src: string; placeholder: string }[],
  username: string,
) {
  const results: { placeholder: string; discourseUrl: string | null }[] = [];
  for (let i = 0; i < images.length; i += MAX_CONCURRENCY) {
    const batch = images.slice(i, i + MAX_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (img) => {
        const { buffer, filename } = await downloadImage(img.src);
        const result = await uploadImage(username, buffer, filename);
        return { placeholder: img.placeholder, discourseUrl: result.short_url || result.url };
      }),
    );
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        results.push({ placeholder: batch[j].placeholder, discourseUrl: null });
      }
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { title, content, images, categoryId, sourceUrl, platform, mode } = await req.json();

  if (!title || !content) {
    return NextResponse.json({ error: '标题和内容不能为空' }, { status: 400 });
  }

  let processedContent = content as string;

  const imageResults = await processImageBatch(images || [], session.username);
  let failedImages = 0;

  for (const r of imageResults) {
    if (r.discourseUrl) {
      processedContent = processedContent.replaceAll(
        `![](${r.placeholder})`,
        `![](${r.discourseUrl})`,
      );
      processedContent = processedContent.replaceAll(r.placeholder, r.discourseUrl);
    } else {
      processedContent = processedContent.replaceAll(`![](${r.placeholder})`, '');
      processedContent = processedContent.replaceAll(r.placeholder, '');
      failedImages++;
    }
  }

  const platformName = platform === 'xiaohongshu' ? '小红书' : '微信公众号';
  const verb = mode === 'repost' ? '转载自' : '搬运自';
  processedContent += `\n\n---\n*本文${verb}${platformName}，[原文链接](${sourceUrl})*`;

  const finalTitle =
    mode === 'repost' && !title.startsWith('【搬运】') ? `【搬运】${title}` : title;

  try {
    const result = await createPost(
      session.username,
      finalTitle,
      processedContent,
      categoryId || undefined,
    );

    const postUrl = `${process.env.DISCOURSE_URL}/t/${result.topic_slug}/${result.topic_id}`;
    return NextResponse.json({ postUrl, failedImages });
  } catch (e) {
    const message = e instanceof Error ? e.message : '发布失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
