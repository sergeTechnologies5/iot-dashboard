/** Thin fetch wrapper for the CueTrack backend (iot-backend, /api/v1/cuetrack). */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''  // '' = same origin, proxied by next.config rewrites (works from phones);
/** 'api' (default) loads everything from the backend; 'local' uses the built-in demo data. */
export const DATA_SOURCE: 'api' | 'local' = process.env.NEXT_PUBLIC_DATA_SOURCE === 'local' ? 'local' : 'api';

const TOKEN_KEY = 'cuetrack_token';
export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY));
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Cannot reach the backend at ${API_URL}`);
  }
  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'Session expired, please sign in again');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const CT = '/api/v1/cuetrack';
export const api = {
  login: (username: string, password: string) =>
    request<{ token: string }>('POST', '/api/v1/auth/authenticate', { username, password }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('POST', '/api/v1/auth/forgot-password', { email }),
  get: <T>(path: string) => request<T>('GET', CT + path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', CT + path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', CT + path, body),
  del: <T>(path: string) => request<T>('DELETE', CT + path),
};
