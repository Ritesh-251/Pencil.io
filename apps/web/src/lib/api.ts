const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let refreshInFlight: Promise<string | null> | null = null;
let refreshBlockedUntil = 0;

export class ApiClientError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

export const api = {
  get: async (path: string, options?: RequestInit) => fetchX(path, { ...options, method: 'GET' }),
  post: async (path: string, body?: any, options?: RequestInit) => fetchX(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: async (path: string, body?: any, options?: RequestInit) => fetchX(path, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

function getStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = localStorage.getItem('token');
  if (!token || token === 'undefined' || token === 'null') {
    if (token === 'undefined' || token === 'null') {
      localStorage.removeItem('token');
    }
    return null;
  }

  return token;
}

export async function getAccessToken(options?: { forceRefresh?: boolean }): Promise<string | null> {
  const forceRefresh = options?.forceRefresh ?? false;
  const stored = getStoredToken();

  if (!forceRefresh) {
    return stored;
  }

  const refreshed = await refreshAccessToken();
  return refreshed;
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const now = Date.now();
  if (refreshBlockedUntil > now) {
    console.warn('[api] Skipping token refresh: temporarily rate-limited', {
      retryInMs: refreshBlockedUntil - now,
    });
    return null;
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status === 429) {
        const retryAfterRaw = Number(res.headers.get('retry-after') || '0');
        const retryAfterMs = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
          ? retryAfterRaw * 1000
          : 5000;

        refreshBlockedUntil = Date.now() + retryAfterMs;
        console.warn('[api] Refresh endpoint rate-limited', {
          status: res.status,
          retryAfterMs,
        });
        return null;
      }

      localStorage.removeItem('token');
      return null;
    }

    let data: any = {};
    const text = await res.text();
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {
      // Not JSON
    }

    const newToken = data?.token ?? data?.accessToken;
    if (!newToken || typeof newToken !== 'string') {
      localStorage.removeItem('token');
      return null;
    }

    localStorage.setItem('token', newToken);
    return newToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function shouldTryRefresh(path: string) {
  return !path.startsWith('/api/v1/auth/signin')
    && !path.startsWith('/api/v1/auth/signup')
    && !path.startsWith('/api/v1/auth/refresh');
}

async function fetchX(path: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
  
  if (res.status === 401 && shouldTryRefresh(path)) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Content-Type', 'application/json');
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: retryHeaders,
        credentials: 'include',
      });
    }
  }

  if (res.status === 401) {
    throw new ApiClientError('Unauthorized', 401);
  }

  const text = await res.text();
  let payload: any = {};
  try {
    if (text) payload = JSON.parse(text);
  } catch (e) {
    // Not JSON
  }

  if (!res.ok) {
    throw new ApiClientError(payload.message || `Request failed with status ${res.status}`, res.status, payload);
  }

  return payload;
}
