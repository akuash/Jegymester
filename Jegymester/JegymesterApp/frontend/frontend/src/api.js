const API_BASE = '/api';

export function getSavedAuth() {
  try {
    const raw = localStorage.getItem('jegymester_auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  localStorage.setItem('jegymester_auth', JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem('jegymester_auth');
}

export function getRole(auth) {
  return auth?.user?.role?.name || '';
}

export function isAdmin(auth) {
  return getRole(auth) === 'adminisztrator';
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.detail?.json?.[0] ||
      data?.detail ||
      data?.error ||
      `HTTP hiba: ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data;
}

export async function apiRequest(path, options = {}, token = null) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  return parseResponse(response);
}

export function login(email, password) {
  return apiRequest('/user/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function registerUser(payload) {
  return apiRequest('/user/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMe(token) {
  return apiRequest('/user/me', {}, token);
}
