/**
 * API client — all requests go through here.
 * Handles credentials, content-type, and 401 redirect automatically.
 */

const BASE_URL = '/api';

async function request(path, options = {}) {
  const headers = { ...options.headers };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  get:    (path)          => request(path, { method: 'GET' }),
  post:   (path, body)    => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)    => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  (path, body)    => request(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path)          => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST',  body: formData }),
};
