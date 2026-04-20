'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';

interface User {
  username: string;
  email: string;
  name: string;
  avatar_url: string;
}

interface Article {
  title: string;
  author: string;
  content: string;
  images: { src: string; placeholder: string }[];
  sourceUrl: string;
  platform?: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [mode, setMode] = useState<'original' | 'repost'>('original');
  const [declared, setDeclared] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ postUrl: string; failedImages: number } | null>(null);
  const [error, setError] = useState('');

  // Check auth on mount
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

  // Fetch categories when logged in
  const fetchCategories = useCallback(() => {
    if (!user) return;
    fetch('/api/categories')
      .then((r) => r.json())
      .then((data) => {
        if (data.categories) setCategories(data.categories);
      });
  }, [user]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
    setArticle(null);
    setResult(null);
  }

  async function handleFetch() {
    setError('');
    setArticle(null);
    setResult(null);
    setDeclared(false);
    setMode('original');

    if (!url.trim()) {
      setError('请粘贴文章链接');
      return;
    }

    setFetching(true);
    try {
      const res = await fetch('/api/fetch-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '获取失败');
        return;
      }
      setArticle(data);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setFetching(false);
    }
  }

  async function handlePublish() {
    if (!article || !declared) return;

    setError('');
    setPublishing(true);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          content: article.content,
          images: article.images,
          categoryId: categoryId || undefined,
          sourceUrl: article.sourceUrl,
          platform: article.platform,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '发布失败');
        return;
      }
      setResult(data);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setPublishing(false);
    }
  }

  const previewHtml = useMemo(() => {
    if (!article) return '';
    // Strip image placeholders for preview (they're not real URLs yet)
    const cleaned = article.content.replace(/!\[\]\(__IMG_[^)]+__\)/g, '*(图片)*');
    return marked.parse(cleaned, { async: false }) as string;
  }, [article]);

  if (loading) {
    return (
      <main className="container">
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <span className="spinner spinner-dark" /> 加载中...
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      {/* Header */}
      <div className="header">
        <h1>内容搬运 → 论坛</h1>
        {user && (
          <div className="user-info">
            {user.avatar_url && <img src={user.avatar_url} alt="" />}
            <span>{user.name || user.username}</span>
            <button className="btn-text" onClick={handleLogout}>
              退出
            </button>
          </div>
        )}
      </div>

      {/* Not logged in */}
      {!user && (
        <div className="card login-card">
          <p>登录论坛账号后，即可一键搬运公众号、小红书等平台的内容到论坛。</p>
          <a href="/api/auth" className="btn btn-primary">
            通过论坛账号登录
          </a>
        </div>
      )}

      {/* Logged in — main flow */}
      {user && !result && (
        <>
          {/* URL input */}
          <div className="card">
            <div className="input-row">
              <input
                type="url"
                placeholder="粘贴微信公众号或小红书链接"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                disabled={fetching}
              />
              <button
                className="btn btn-primary"
                onClick={handleFetch}
                disabled={fetching || !url.trim()}
              >
                {fetching && <span className="spinner" />}
                {fetching ? '获取中' : '获取文章'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <div className="error">{error}</div>}

          {/* Article preview */}
          {article && (
            <div className="card">
              <div className="preview-title">{article.title}</div>
              <div className="preview-meta">
                {article.platform === 'xiaohongshu' ? '小红书' : '微信公众号'} ·
                来源：{article.author || '未知'} · 图片 {article.images.length} 张
              </div>
              <div
                className="preview-content markdown-body"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}

          {/* Publish form */}
          {article && (
            <div className="card">
              {categories.length > 0 && (
                <div className="form-group">
                  <label>发布到分类 *</label>
                  <select
                    value={categoryId}
                    onChange={(e) =>
                      setCategoryId(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">请选择分类</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>发布类型</label>
                <div className="mode-selector">
                  <label className={`mode-option ${mode === 'original' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'original'}
                      onChange={() => {
                        setMode('original');
                        setDeclared(false);
                      }}
                    />
                    <strong>原创发布</strong>
                    <span>我自己创作的内容</span>
                  </label>
                  <label className={`mode-option ${mode === 'repost' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'repost'}
                      onChange={() => {
                        setMode('repost');
                        setDeclared(false);
                      }}
                    />
                    <strong>转载搬运</strong>
                    <span>标题自动加【搬运】前缀</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="declare"
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                />
                <span>
                  <label htmlFor="declare">
                    {mode === 'original'
                      ? '我声明此内容为本人原创作品，我拥有版权或已获得合法授权进行发布。'
                      : '我已确认有权在此转载本内容，会注明原始来源、不会侵犯他人权益。'}
                  </label>
                </span>
              </div>

              <button
                className="btn btn-primary btn-block"
                onClick={handlePublish}
                disabled={!declared || publishing || (categories.length > 0 && !categoryId)}
              >
                {publishing && <span className="spinner" />}
                {publishing ? '发布中...' : '发布到论坛'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Success */}
      {result && (
        <div className="card success">
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>发布成功</p>
          {result.failedImages > 0 && (
            <p style={{ color: '#b45309', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              {result.failedImages} 张图片搬运失败，已跳过
            </p>
          )}
          <p>
            <a href={result.postUrl} target="_blank" rel="noopener noreferrer">
              查看帖子
            </a>
          </p>
          <button
            className="btn btn-outline"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              setResult(null);
              setArticle(null);
              setUrl('');
              setDeclared(false);
            }}
          >
            继续搬运
          </button>
        </div>
      )}
    </main>
  );
}
