const API_BASE = https://matbloxipi-1.onrender.com'; // замените на реальный URL вашего API

export async function register(username, password) {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function getGames() {
  const res = await fetch(`${API_BASE}/games`);
  return res.json();
}

export async function saveGame(name, author, data, description = '') {
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, author, description, data })
  });
  return res.json();
}

// и так далее для остальных функций...