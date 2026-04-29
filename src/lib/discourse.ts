const DISCOURSE_URL = () => process.env.DISCOURSE_URL!;
const API_KEY = () => process.env.DISCOURSE_API_KEY!;

export async function discourseAPI(
  path: string,
  options: {
    method?: string;
    username: string;
    body?: Record<string, unknown>;
    formData?: FormData;
  },
) {
  // Api-Key MUST stay in headers — Discourse uses it to identify API
  // requests and bypass CSRF. Username goes in query params because
  // HTTP headers reject non-ASCII characters (Chinese usernames etc.)
  const url = new URL(`${DISCOURSE_URL()}${path}`);
  url.searchParams.set('api_username', options.username);

  const headers: Record<string, string> = {
    'Api-Key': API_KEY(),
  };

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers,
  };

  if (options.formData) {
    fetchOptions.body = options.formData;
  } else if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discourse API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function uploadImage(
  username: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<{ url: string; short_url: string; width: number; height: number }> {
  const formData = new FormData();
  formData.append('type', 'composer');
  formData.append('file', new Blob([new Uint8Array(imageBuffer)]), filename);

  return discourseAPI('/uploads.json', {
    method: 'POST',
    username,
    formData,
  });
}

export async function createPost(
  username: string,
  title: string,
  raw: string,
  categoryId?: number,
) {
  const body: Record<string, unknown> = { title, raw };
  if (categoryId) body.category = categoryId;
  return discourseAPI('/posts.json', { method: 'POST', username, body });
}

export async function getCategories(username: string) {
  return discourseAPI('/categories.json', { username });
}
