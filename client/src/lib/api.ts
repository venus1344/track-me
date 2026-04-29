const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get<T = unknown>(path: string): Promise<T> {
    return fetch(`${BASE}${path}`, {
      credentials: 'include',
    }).then((r) => handleResponse<T>(r));
  },

  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r));
  },

  put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return fetch(`${BASE}${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r));
  },

  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return fetch(`${BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r));
  },

  delete<T = unknown>(path: string): Promise<T> {
    return fetch(`${BASE}${path}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).then((r) => handleResponse<T>(r));
  },

  upload<T = unknown>(path: string, formData: FormData): Promise<T> {
    return fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      // No Content-Type header — browser sets multipart/form-data with boundary
      body: formData,
    }).then((r) => handleResponse<T>(r));
  },
};
