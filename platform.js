// ========== ОБРАБОТЧИКИ КНОПОК ==========
async function handlePlayClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    console.log('Play button clicked for game ID:', id);
    try {
        const allGames = await API.getGames();
        console.log('All games:', allGames);
        const game = allGames.find(g => g.id === id);
        if (game && game.data) {
            console.log('Game data found:', game.data);
            let gameData;
            try {
                // Пробуем распарсить data, если это строка
                if (typeof game.data === 'string') {
                    gameData = JSON.parse(game.data);
                } else {
                    gameData = game.data;
                }
            } catch(parseErr) {
                console.error('JSON parse error:', parseErr);
                alert('Ошибка: повреждённые данные игры');
                return;
            }
            startLocalGameSession(gameData, game.name);
        } else {
            console.error('Game not found or no data:', game);
            alert('Ошибка: игра не найдена или данные повреждены');
        }
    } catch(err) {
        console.error('Play error:', err);
        alert('Ошибка при запуске игры: ' + err.message);
    }
}

async function handleHostClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    console.log('Host button clicked for game ID:', id);
    try {
        const allGames = await API.getGames();
        const game = allGames.find(g => g.id === id);
        if (game && game.data) {
            let gameData;
            try {
                if (typeof game.data === 'string') {
                    gameData = JSON.parse(game.data);
                } else {
                    gameData = game.data;
                }
            } catch(parseErr) {
                console.error('JSON parse error:', parseErr);
                alert('Ошибка: повреждённые данные игры');
                return;
            }
            createLocalGame(game.name, gameData);
        } else {
            alert('Ошибка: игра не найдена');
        }
    } catch(err) {
        console.error('Host error:', err);
        alert('Ошибка при создании сервера: ' + err.message);
    }
}

async function renderMyProjects() {
    if (!currentUser) return;
    const container = document.getElementById('myProjectsList');
    if (!container) return;
    try {
        const allGames = await API.getGames();
        console.log('All games loaded:', allGames);
        const myGames = allGames.filter(g => g.author === currentUser.username);
        container.innerHTML = '';
        if (!myGames.length) { 
            container.innerHTML = '<p>У вас пока нет созданных игр. Перейдите в конструктор!</p>'; 
            attachMobileEvents(); 
            return; 
        }
        myGames.forEach(game => {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.innerHTML = `
                <div class="game-title">${escapeHtml(game.name)}</div>
                <div class="game-desc" style="font-size:12px;color:#aaa;">${escapeHtml(game.description || 'Без описания')}</div>
                <div style="margin-top:12px;display:flex;gap:8px;">
                    <button class="play-btn-small" data-id="${game.id}" style="background:#ff5722;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Одиночная игра</button>
                    <button class="host-btn-small" data-id="${game.id}" style="background:#4a6e8a;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">🌐 Создать сервер</button>
                    <button class="edit-btn-small" data-id="${game.id}" style="background:#ffaa44;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Редактировать</button>
                    <button class="delete-btn-small" data-id="${game.id}" style="background:#ff3333;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Удалить</button>
                </div>
            `;
            container.appendChild(card);
        });
        attachMobileEvents();
        
        // Привязка обработчиков
        document.querySelectorAll('.play-btn-small').forEach(btn => {
            btn.removeEventListener('click', handlePlayClick);
            btn.addEventListener('click', handlePlayClick);
        });
        document.querySelectorAll('.host-btn-small').forEach(btn => {
            btn.removeEventListener('click', handleHostClick);
            btn.addEventListener('click', handleHostClick);
        });
        document.querySelectorAll('.edit-btn-small').forEach(btn => {
            btn.removeEventListener('click', handleEditClick);
            btn.addEventListener('click', handleEditClick);
        });
        document.querySelectorAll('.delete-btn-small').forEach(btn => {
            btn.removeEventListener('click', handleDeleteClick);
            btn.addEventListener('click', handleDeleteClick);
        });
        
    } catch (e) {
        console.error('renderMyProjects error:', e);
        container.innerHTML = '<p>Ошибка загрузки проектов</p>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function handleEditClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    console.log('Edit button clicked for game ID:', id);
    try {
        const allGames = await API.getGames();
        const game = allGames.find(g => g.id === id);
        if (game) {
            const mod = await import('./editor.js');
            if (mod.openEditor) {
                mod.openEditor(game);
            } else {
                console.error('openEditor not found');
                alert('Ошибка загрузки редактора');
            }
        } else {
            alert('Игра не найдена');
        }
    } catch(err) {
        console.error('Edit error:', err);
        alert('Ошибка при открытии редактора: ' + err.message);
    }
}

async function handleDeleteClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    if (confirm('Удалить игру?')) {
        try {
            await API.deleteGame(id, currentUser.username);
            renderMyProjects();
        } catch(err) {
            console.error('Delete error:', err);
            alert('Ошибка при удалении');
        }
    }
}
