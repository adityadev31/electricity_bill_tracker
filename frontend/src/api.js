const BASE = import.meta.env.VITE_API_URL || '/api';
const KEY = 'cm4302_admin_token';

export const token = {
  get: () => sessionStorage.getItem(KEY),
  set: (t) => sessionStorage.setItem(KEY, t),
  clear: () => sessionStorage.removeItem(KEY),
};

async function request(path, options = {}) {
  const t = token.get();
  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && t && path !== '/admin/login') token.clear(); // session expired
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) });

export const api = {
  status: () => request('/status'),
  bills: () => request('/bills'),
  addBill: (body) => post('/bills', body),
  addBaseline: (readings) => post('/baseline', { readings }),
  login: (pin) => post('/admin/login', { pin }),
  setMode: (mode) => post('/admin/mode', { mode }),
  unlock: () => post('/admin/unlock'),
  relock: () => request('/admin/unlock', { method: 'DELETE' }),
  setRate: (rate) => post('/admin/rate', { rate }),
  cancelRate: () => request('/admin/rate', { method: 'DELETE' }),
  changePin: (currentPin, newPin) => post('/admin/change-pin', { currentPin, newPin }),
  resetLast: (month) => post('/admin/reset-last', { month }),
  resetTest: () => post('/admin/reset-test'),
};
