const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const defaultHeaders = {
  'Content-Type': 'application/json'
};

function buildUrl(path) {
  if (!API_BASE_URL || path.startsWith('http')) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const builtUrl = buildUrl(path);
  try {
    const response = await fetch(builtUrl, {
      credentials: 'include',
      ...options
    });
    const data = await parseJson(response);
    if (!response.ok) {
      const error = new Error(data?.error || data?.message || 'Request failed');
      error.status = response.status;
      error.payload = data;
      error.code = data?.code;
      throw error;
    }
    return data;
  } catch (error) {
    // Network errors (backend unreachable, CORS issues, etc.)
    if (error instanceof TypeError || error.message === 'Failed to fetch') {
      const networkError = new Error(
        'Unable to connect to server. Please check your internet connection or try again later.'
      );
      networkError.status = 0;
      networkError.code = 'NETWORK_ERROR';
      networkError.isNetworkError = true;
      throw networkError;
    }
    // Re-throw other errors (HTTP errors, etc.)
    throw error;
  }
}

export async function apiGet(path, options = {}) {
  return request(path, {
    method: 'GET',
    ...options
  });
}

export async function apiPost(path, body = {}, options = {}) {
  return request(path, {
    method: 'POST',
    headers: {
      ...defaultHeaders,
      ...options.headers
    },
    body: JSON.stringify(body),
    ...options
  });
}

export async function apiDelete(path, options = {}) {
  return request(path, {
    method: 'DELETE',
    ...options
  });
}

export function withQuery(path, params = {}) {
  const url = new URL(buildUrl(path), window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  return url.pathname + url.search;
}
