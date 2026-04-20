import crypto from 'crypto';

const DEFAULT_TIMEOUT = 30_000;

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchInit } = init || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchInit, signal: controller.signal });
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout / 1000}s): ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[::1\])/i;

export function validateExternalUrl(url: string, allowedHosts: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('链接格式不正确');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http/https 链接');
  }
  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    throw new Error('不允许访问内网地址');
  }
  if (allowedHosts.length > 0 && !allowedHosts.some((h) => parsed.hostname.endsWith(h))) {
    throw new Error(`暂不支持该平台，目前仅支持: ${allowedHosts.join(', ')}`);
  }
  return parsed;
}

export function makePlaceholder(): string {
  return `__IMG_${crypto.randomUUID()}__`;
}
