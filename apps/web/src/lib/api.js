/**
 * API client — all requests go through here.
 * Handles credentials, content-type, and 401 redirect automatically.
 */

const BASE_URL = '/api';

// Track if we've already redirected to prevent redirect loops
let redirecting = false;

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
    // Only redirect if we're not already on the login page
    // and not already redirecting — prevents loops
    if (!redirecting && !window.location.pathname.includes('/login')) {
      redirecting = true;
      window.location.href = '/login';
    }
    throw new Error('Session expired');
  }

  // Reset redirect flag on successful request
  redirecting = false;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

export const api = {
  get:    (path)           => request(path, { method: 'GET' }),
  post:   (path, body)     => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)     => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  (path, body)     => request(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path)           => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST',   body: formData }),
};
