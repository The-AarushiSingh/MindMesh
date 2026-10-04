const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export const apiRequest = async (path, options = {}, token) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'Request failed');
    error.status = response.status;
    error.code = data.code;
    error.payload = data;
    throw error;
  }

  return data;
};
