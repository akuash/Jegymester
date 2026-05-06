const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'jegymester_auth';

function joinUrl(base, path) {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${safePath}`;
}

function flattenMessages(value) {
  if (!value) return [];

  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenMessages);

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      const nested = flattenMessages(item);
      return nested.length ? nested.map((message) => `${key}: ${message}`) : [];
    });
  }

  return [String(value)];
}

function getErrorMessage(data, status) {
  const details = flattenMessages(data?.detail);
  const messages = flattenMessages(data?.message || data?.error);
  const combined = [...messages, ...details].filter(Boolean);

  if (combined.length > 0) {
    return combined.join(' | ');
  }

  if (status === 401) {
    return 'Unauthorized: hiányzik, lejárt vagy hibás a Bearer JWT token.';
  }

  if (status === 403) {
    return 'Forbidden: nincs jogosultságod ehhez a művelethez.';
  }

  return `HTTP hiba: ${status}`;
}

export function getSavedAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.token && parsed?.access_token) {
      return {
        token: parsed.access_token,
        tokenType: parsed.token_type || 'Bearer',
        expiresIn: parsed.expires_in,
        user: parsed.user,
      };
    }

    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getRole(auth) {
  const role = auth?.user?.role;
  if (typeof role === 'string') return role;
  return role?.name || '';
}

export function isAdmin(auth) {
  return getRole(auth) === 'adminisztrator';
}

export function isCashier(auth) {
  return getRole(auth) === 'penztaros';
}

export function isNormalUser(auth) {
  return getRole(auth) === 'felhasznalo';
}

export function getCurrentUserId(auth) {
  const id = auth?.user?.id;
  return id === undefined || id === null ? null : Number(id);
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
    const error = new Error(getErrorMessage(data, response.status));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function apiRequest(path, options = {}, token = undefined) {
  const savedToken = getSavedAuth()?.token;
  const finalToken = token !== undefined ? token : savedToken;
  const hasBody = options.body !== undefined && options.body !== null;
  const body = hasBody && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body;

  const headers = {
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(joinUrl(API_BASE, path), {
    ...options,
    body,
    headers,
  });

  return parseResponse(response);
}

export function login(email, password) {
  return apiRequest(
    '/user/login',
    {
      method: 'POST',
      body: { email: email.trim(), password },
    },
    null
  );
}

export function registerUser(payload) {
  return apiRequest(
    '/user/register',
    {
      method: 'POST',
      body: payload,
    },
    null
  );
}

export function getMe(token) {
  return apiRequest('/user/me', {}, token);
}

export async function safeRequest(path, options = {}, token = undefined) {
  try {
    const data = await apiRequest(path, options, token);
    return { ok: true, data, error: '' };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error.message || 'Ismeretlen hiba történt.',
      status: error.status,
    };
  }
}
