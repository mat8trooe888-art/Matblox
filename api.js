const API_BASE = 'https://matbloxipi-1.onrender.com/api'; // ваш реальный API

// Проверка доступности API
let apiAvailable = true;

async function checkAPI() {
    try {
        const res = await fetch(`${API_BASE}/games`, { method: 'HEAD' });
        apiAvailable = res.ok;
    } catch {
        apiAvailable = false;
    }
    console.log('API available:', apiAvailable);
}
checkAPI();

// Вспомогательные функции для localStorage (запасной вариант)
function getLocalUsers() {
    return JSON.parse(localStorage.getItem('blockverse_users')) || [];
}
function saveLocalUsers(users) {
    localStorage.setItem('blockverse_users', JSON.stringify(users));
}
function getLocalGames() {
    return JSON.parse(localStorage.getItem('blockverse_games')) || [];
}
function saveLocalGames(games) {
    localStorage.setItem('blockverse_games', JSON.stringify(games));
}
function getLocalChat() {
    return JSON.parse(localStorage.getItem('blockverse_chat')) || [];
}
function saveLocalChat(chat) {
    localStorage.setItem('blockverse_chat', JSON.stringify(chat.slice(-100)));
}
function getLocalReports() {
    return JSON.parse(localStorage.getItem('blockverse_reports')) || [];
}
function saveLocalReports(reports) {
    localStorage.setItem('blockverse_reports', JSON.stringify(reports.slice(-50)));
}

export async function register(username, password) {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            return await res.json();
        } catch {
            apiAvailable = false;
        }
    }
    // Fallback localStorage
    const users = getLocalUsers();
    if (users.find(u => u.username === username)) {
        return { error: 'User already exists' };
    }
    users.push({ username, password, coins: 500, inventory: [], friends: [], isGuest: false });
    saveLocalUsers(users);
    return { success: true };
}

export async function login(username, password) {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                return { success: true, user: data.user };
            } else {
                return { error: data.error };
            }
        } catch {
            apiAvailable = false;
        }
    }
    // Fallback localStorage
    const users = getLocalUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return { error: 'Invalid credentials' };
    return {
        success: true,
        user: {
            username: user.username,
            coins: user.coins,
            inventory: user.inventory || [],
            friends: user.friends || []
        }
    };
}

export async function getGames() {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/games`);
            return await res.json();
        } catch {
            apiAvailable = false;
        }
    }
    return getLocalGames().map(g => ({
        id: g.id,
        name: g.name,
        author: g.author,
        description: g.desc || ''
    }));
}

export async function saveGame(name, author, data, description = '') {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/games`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, author, description, data })
            });
            return await res.json();
        } catch {
            apiAvailable = false;
        }
    }
    const games = getLocalGames();
    const id = Date.now();
    games.push({ id, name, author, desc: description, data });
    saveLocalGames(games);
    return { id };
}

export async function deleteGame(id, author) {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/games/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ author })
            });
            return await res.json();
        } catch {
            apiAvailable = false;
        }
    }
    let games = getLocalGames();
    games = games.filter(g => !(g.id == id && g.author === author));
    saveLocalGames(games);
    return { success: true };
}

export async function updateCoins(username, coins) {
    if (apiAvailable) {
        try {
            await fetch(`${API_BASE}/updateCoins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, coins })
            });
        } catch {
            apiAvailable = false;
        }
    }
    const users = getLocalUsers();
    const user = users.find(u => u.username === username);
    if (user) {
        user.coins = coins;
        saveLocalUsers(users);
    }
}

export async function sendChatMessage(username, text, time) {
    if (apiAvailable) {
        try {
            await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, text, time })
            });
            return;
        } catch {
            apiAvailable = false;
        }
    }
    const chat = getLocalChat();
    chat.push({ username, text, time });
    saveLocalChat(chat);
}

export async function getChatMessages() {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/chat`);
            return await res.json();
        } catch {
            apiAvailable = false;
        }
    }
    return getLocalChat();
}

export async function sendReport(username, text, time) {
    if (apiAvailable) {
        try {
            await fetch(`${API_BASE}/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, text, time })
            });
            return;
        } catch {
            apiAvailable = false;
        }
    }
    const reports = getLocalReports();
    reports.push({ username, text, time });
    saveLocalReports(reports);
}

export async function getReports() {
    if (apiAvailable) {
        try {
            const res = await fetch(`${API_BASE}/reports`);
            return await res.json();
        } catch {
            apiAvailable = false;
        }
    }
    return getLocalReports();
      }
