import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { fetchWithTimeout, makePlaceholder } from './utils';

export interface ParsedArticle {
  title: string;
  author: string;
  content: string;
  images: { src: string; placeholder: string }[];
  sourceUrl: string;
}

export async function parseWechatArticle(url: string): Promise<ParsedArticle> {
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`获取文章失败 (HTTP ${res.status})，文章可能已被删除或需要登录查看`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title =
    $('#activity-name').text().trim() ||
    $('h1.rich_media_title').text().trim() ||
    $('h2.rich_media_title').text().trim();

  if (!title) {
    throw new Error('无法解析文章标题，请确认链接是否为有效的微信公众号文章');
  }

  const author =
    $('#js_name').text().trim() ||
    $('.rich_media_meta_text').first().text().trim() ||
    '';

  const $content = $('#js_content');

  // Fix images: data-src → src (WeChat lazy loading)
  $content.find('img').each((_, el) => {
    const dataSrc = $(el).attr('data-src');
    if (dataSrc) {
      $(el).attr('src', dataSrc);
    }
  });

  // Filter out decorative images (small icons, thin dividers).
  // WeChat exposes original size via data-w + data-ratio attributes.
  const MIN_WIDTH = 200;
  const MIN_HEIGHT = 80;
  $content.find('img').each((_, el) => {
    const dataW = parseInt($(el).attr('data-w') || '0', 10);
    const dataRatio = parseFloat($(el).attr('data-ratio') || '0');
    const calcHeight = dataW * dataRatio;

    const tooSmall = dataW > 0 && dataW < MIN_WIDTH;
    const tooShort = dataW > 0 && dataRatio > 0 && calcHeight < MIN_HEIGHT;
    const extremeRatio = dataRatio > 0 && (dataRatio < 0.05 || dataRatio > 20);

    if (tooSmall || tooShort || extremeRatio) {
      $(el).remove();
    }
  });

  // Collect remaining content image URLs and replace with UUID placeholders
  const images: { src: string; placeholder: string }[] = [];
  $content.find('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && (src.includes('mmbiz.qpic.cn') || src.includes('mmbiz.qlogo.cn'))) {
      const placeholder = makePlaceholder();
      images.push({ src, placeholder });
      $(el).attr('src', placeholder);
    }
  });

  // Remove non-transferable media elements
  $content.find('mpvoice, mpvideosnap, qqmusic, mp-miniprogram, mp-common-product').remove();

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  turndown.addRule('skipEmptyParagraphs', {
    filter: (node) =>
      node.nodeName === 'P' &&
      !node.textContent?.trim() &&
      !node.querySelector('img'),
    replacement: () => '',
  });

  turndown.addRule('flattenSection', {
    filter: 'section',
    replacement: (content) => content,
  });

  turndown.addRule('flattenSpan', {
    filter: (node) => node.nodeName === 'SPAN' && !node.querySelector('img'),
    replacement: (content) => content,
  });

  const contentHtml = $content.html();
  if (!contentHtml) {
    throw new Error('文章内容为空');
  }

  const markdown = turndown
    .turndown(contentHtml)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, author, content: markdown, images, sourceUrl: url };
}

export async function downloadImage(
  url: string,
): Promise<{ buffer: Buffer; filename: string }> {
  let referer = 'https://mp.weixin.qq.com/';
  if (url.includes('xhscdn.com') || url.includes('xiaohongshu.com')) {
    referer = 'https://www.xiaohongshu.com/';
  }

  const res = await fetchWithTimeout(url, {
    headers: { Referer: referer },
    timeout: 60_000,
  });

  if (!res.ok) {
    throw new Error(`图片下载失败: ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('gif')
      ? 'gif'
      : contentType.includes('webp')
        ? 'webp'
        : 'jpeg';

  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    buffer,
    filename: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`,
  };
}
