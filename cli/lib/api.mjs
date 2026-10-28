const BASE_URL = process.env.MKT_API_URL || 'https://marketingskills.directory/wp-json/mkt/v1';
const TIMEOUT  = 30_000;

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mkt-skills-cli/1.3.1' },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCatalog() {
  const res = await request('/catalog');
  if (!res.ok) throw new Error(`Failed to fetch catalog (HTTP ${res.status})`);
  return res.json();
}

export async function fetchSets() {
  const res = await request('/sets');
  if (!res.ok) throw new Error(`Failed to fetch sets (HTTP ${res.status})`);
  return res.json();
}

export async function fetchSet(slug) {
  const res = await request(`/sets/${encodeURIComponent(slug)}`);

  if (res.status === 404) {
    const data = await res.json();
    throw Object.assign(new Error(data.message), { code: 'NOT_FOUND' });
  }

  if (!res.ok) throw new Error(`Failed to fetch set (HTTP ${res.status})`);
  return res.json();
}

export async function fetchSearch(query, limit = 5) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await request(`/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch search results (HTTP ${res.status})`);
  return res.json();
}

export async function fetchInstall(slug, code) {
  const path = `/install/${encodeURIComponent(slug)}` + (code ? `?code=${encodeURIComponent(code)}` : '');
  const res = await request(path);

  if (res.status === 403) {
    const data = await res.json();
    const err = new Error(data.message);
    err.code = 'PREMIUM';
    err.url = data.purchase_url;
    throw err;
  }

  if (res.status === 404) {
    const data = await res.json();
    throw Object.assign(new Error(data.message), { code: 'NOT_FOUND' });
  }

  if (!res.ok) throw new Error(`Install failed (HTTP ${res.status})`);
  return res.json();
}
