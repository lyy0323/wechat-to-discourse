import { ParsedArticle } from './wechat-parser';
import { fetchWithTimeout, makePlaceholder } from './utils';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const NOTE_ID_RE = /\/(?:explore|discovery\/item)\/([a-f0-9]{24})/;

interface XHSImage {
  url?: string;
  infoList?: { imageScene?: string; url?: string }[];
  width?: number;
  height?: number;
}

interface XHSUser {
  nickName?: string;
  userId?: string;
  avatar?: string;
}

interface XHSNote {
  title?: string;
  desc?: string;
  type?: string;
  user?: XHSUser;
  imageList?: XHSImage[];
  interactInfo?: { likedCount?: string; collectedCount?: string };
}

export function isXiaohongshuUrl(url: string): boolean {
  return (
    url.includes('xiaohongshu.com') ||
    url.includes('xhslink.com')
  );
}

export async function parseXiaohongshuNote(url: string): Promise<ParsedArticle> {
  // Follow redirects (share links → final URL)
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': MOBILE_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: 'https://www.xiaohongshu.com/',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`获取笔记失败 (HTTP ${res.status})`);
  }

  const finalUrl = res.url;
  if (finalUrl.includes('/404')) {
    throw new Error('小红书拒绝了请求（被风控或笔记已删除）');
  }

  const noteId = extractNoteId(finalUrl) || extractNoteId(url);
  if (!noteId) {
    throw new Error('无法从链接中提取笔记 ID，请确认是有效的小红书链接');
  }

  const html = await res.text();
  const state = extractInitialState(html);
  return parseNote(state, noteId, finalUrl);
}

function extractNoteId(url: string): string | null {
  const m = NOTE_ID_RE.exec(url);
  return m ? m[1] : null;
}

function extractInitialState(html: string): Record<string, unknown> {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]+?)(?:<\/script>)/);
  if (!m) {
    throw new Error('页面中找不到 __INITIAL_STATE__，可能是页面结构变更或需要登录');
  }
  let raw = m[1].trim().replace(/;$/, '');
  raw = raw.replace(/\bundefined\b/g, 'null');
  return JSON.parse(raw);
}

function parseNote(
  state: Record<string, unknown>,
  noteId: string,
  sourceUrl: string,
): ParsedArticle {
  // Try discovery/item structure first
  let nd: XHSNote | undefined =
    (state.noteData as { data?: { noteData?: XHSNote } } | undefined)?.data?.noteData;

  // Fallback: explore page structure
  if (!nd) {
    const noteMap =
      (state.note as { noteDetailMap?: Record<string, { note?: XHSNote }> } | undefined)
        ?.noteDetailMap;
    nd = noteMap?.[noteId]?.note;
  }

  if (!nd) {
    throw new Error('无法在页面状态中找到笔记数据');
  }

  const user = nd.user || {};
  const rawDesc = nd.desc || '';

  // Extract topic tags: "#tagname[话题]#"
  const tags = Array.from(rawDesc.matchAll(/#([^#\[]+)\[话题\]#/g)).map((m) => m[1]);
  const cleanDesc = rawDesc.replace(/#[^#]+\[话题\]#/g, '').trim();

  // Collect image URLs
  const images: { src: string; placeholder: string }[] = [];
  (nd.imageList || []).forEach((img, i) => {
    let src = img.url || '';
    if (!src && img.infoList) {
      const h5 = img.infoList.find((x) => x.imageScene === 'H5_DTL');
      src = h5?.url || img.infoList[0]?.url || '';
    }
    if (src) {
      const placeholder = makePlaceholder();
      images.push({ src, placeholder });
    }
  });

  // Build markdown content: description + image placeholders + tags
  const contentParts: string[] = [];
  if (cleanDesc) contentParts.push(cleanDesc);
  if (images.length > 0) {
    contentParts.push(images.map((img) => `![](${img.placeholder})`).join('\n\n'));
  }
  if (tags.length > 0) {
    contentParts.push(tags.map((t) => `#${t}`).join(' '));
  }

  return {
    title: nd.title || cleanDesc.slice(0, 30) || '小红书笔记',
    author: user.nickName || '',
    content: contentParts.join('\n\n'),
    images,
    sourceUrl,
  };
}
