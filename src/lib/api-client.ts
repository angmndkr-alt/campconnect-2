/**
 * CampConnect REST client.
 *
 * Talks to the Node + Postgres API. In dev the Vite server proxies `/api`
 * to `http://localhost:4000`, so no CORS setup is needed; set `VITE_API_URL`
 * to point elsewhere (production) if the API is hosted on another origin.
 */

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const ACCESS_KEY = 'cc.access_token';
const REFRESH_KEY = 'cc.refresh_token';

export type ApiErrorBody = {
  error: { message: string; code: string; details?: Array<{ field: string; message: string }> };
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorBody['error']['details'];

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }

  /** Field-level message from a validation failure, if any. */
  field(name: string): string | undefined {
    return this.details?.find((d) => d.field === name)?.message;
  }
}

export const tokens = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  has(): boolean {
    return Boolean(localStorage.getItem(REFRESH_KEY));
  },
};

/** Broadcast auth changes so React contexts can react immediately. */
const AUTH_EVENT = 'campconnect:auth';
export const onAuthChange = (handler: () => void): (() => void) => {
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
};
const emitAuthChange = () => window.dispatchEvent(new Event(AUTH_EVENT));

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean;
  /** Internal: prevents infinite refresh loops. */
  _retried?: boolean;
};

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the stored refresh token for a new pair. De-duplicates in flight. */
async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokens.refresh;
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        tokens.clear();
        return false;
      }

      const data = await res.json();
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      // Network failure — keep the current tokens and let the caller retry later.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, _retried = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  const access = tokens.access;
  if (!anonymous && access) headers.authorization = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError(0, {
      message: 'Could not reach the server. Check that the API is running.',
      code: 'network_error',
    });
  }

  // One transparent refresh + retry on an expired access token.
  if (res.status === 401 && !anonymous && !_retried && tokens.refresh) {
    const ok = await refreshSession();
    if (ok) return request<T>(path, { ...options, _retried: true });
    tokens.clear();
    emitAuthChange();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed:unknown=null;try{parsed=text?JSON.parse(text):null;}catch{throw new ApiError(res.status,{message:'The server returned an invalid response. Check the API and try again.',code:'invalid_response'});}

  if (!res.ok) {
    const errBody = (parsed as ApiErrorBody | null)?.error;
    if (res.status === 401 && !anonymous) {
      tokens.clear();
      emitAuthChange();
    }
    throw new ApiError(
      res.status,
      errBody ?? { message: 'Something went wrong.', code: 'unknown_error' },
    );
  }

  return parsed as T;
}

export const api = {
  get: <T,>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T,>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T,>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  /** Absolute URL for an API-hosted asset (e.g. a downloaded CSV). */
  absolute: (path: string) => `${API_URL}${path}`,
};

/** Build `/events/x?y=z` style paths without leaking `undefined`. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}