let ws = null;
let currentGameId = null;
let myPlayerId = null;
let remotePlayers = new Map();

export function connectToServer() {
    try {
        ws = new WebSocket('wss://matrix-5uvi.onrender.com'); // используем готовый сигнальный сервер
        ws.onopen = () => { console.log('Connected to signal server'); requestGamesList(); };
        ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                switch (data.type) {
                    case 'games_list':
                        if (window.onGamesList) window.onGamesList(data.games);
                        break;
                    case 'game_created':
                        alert(`Игра "${data.gameName}" создана! ID: ${data.gameId}`);
                        requestGamesList();
                        break;
                    case 'joined':
                        myPlayerId = data.playerId;
                        if (window.onGameJoined) window.onGameJoined(data.gameData, data.gameName);
                        break;
                    case 'player_joined':
                        if (window.onPlayerJoined) window.onPlayerJoined(data.playerId, data.position);
                        break;
                    case 'player_moved':
                        if (window.onPlayerMoved) window.onPlayerMoved(data.playerId, data.position);
                        break;
                    case 'player_left':
                        if (window.onPlayerLeft) window.onPlayerLeft(data.playerId);
                        break;
                    case 'error':
                        alert(data.message);
                        break;
                }
            } catch(e) { console.warn('Message parse error', e); }
        };
        ws.onerror = () => console.warn('WebSocket error');
    } catch(e) { console.warn('WebSocket connection failed', e); }
}

export function requestGamesList() {
    if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'get_games_list' }));
}

export function createGameOnServer(name, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'create_game', gameName: name, author: window.currentUser?.username, gameData: data }));
    }
}

export function joinGame(id) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        currentGameId = id;
        ws.send(JSON.stringify({ type: 'join_game', gameId: id }));
    } else {
        if (window.startLocalGameSession) window.startLocalGameSession(null, 'Локальная');
    }
}

export function sendPosition(position) {
    if (ws && ws.readyState === WebSocket.OPEN && currentGameId)
        ws.send(JSON.stringify({ type: 'update_position', position }));
}

export function leaveGame() {
    if (ws && ws.readyState === WebSocket.OPEN && currentGameId)
        ws.send(JSON.stringify({ type: 'leave_game' }));
    currentGameId = null;
}

// Экспортируем также переменные для доступа из platform.js
export { ws, currentGameId, myPlayerId, remotePlayers };