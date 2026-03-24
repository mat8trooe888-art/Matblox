import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ========== ГЛОБАЛЬНЫЕ ДАННЫЕ ==========
let currentUser = null;
let users = JSON.parse(localStorage.getItem('blockverse_users')) || [];
let customGames = JSON.parse(localStorage.getItem('blockverse_games')) || [];
let chatMessages = JSON.parse(localStorage.getItem('blockverse_chat')) || [];
let reports = JSON.parse(localStorage.getItem('blockverse_reports')) || [];

const shopItems = [
    { id: 'skin_gold', name: 'Золотой скин', price: 250 },
    { id: 'pickaxe', name: 'Алмазная кирка', price: 500 },
    { id: 'trail', name: 'Искрящийся след', price: 150 }
];

// Экспортируем нужные функции для редактора
window.currentUser = currentUser;
window.customGames = customGames;
window.saveGames = saveGames;
window.renderMyProjects = renderMyProjects;
window.createGameOnServer = createGameOnServer;
window.addCoins = addCoins;
window.spendCoins = spendCoins;

function updateGlobalRefs() {
    window.currentUser = currentUser;
    window.customGames = customGames;
}

// ========== СОХРАНЕНИЕ ==========
function saveUsers() { localStorage.setItem('blockverse_users', JSON.stringify(users)); updateGlobalRefs(); }
function saveGames() { localStorage.setItem('blockverse_games', JSON.stringify(customGames)); updateGlobalRefs(); }
function saveChat() { localStorage.setItem('blockverse_chat', JSON.stringify(chatMessages.slice(-100))); }
function saveReports() { localStorage.setItem('blockverse_reports', JSON.stringify(reports.slice(-50))); }

// ========== АВТОРИЗАЦИЯ ==========
function initUserData(username) {
    let user = users.find(u => u.username === username);
    if (!user) return null;
    if (user.coins === undefined) user.coins = 500;
    if (user.inventory === undefined) user.inventory = [];
    if (user.friends === undefined) user.friends = [];
    if (user.friendRequests === undefined) user.friendRequests = [];
    if (user.customModel === undefined) user.customModel = null;
    saveUsers();
    return user;
}

function updateUIafterAuth() {
    if (!currentUser) return;
    document.getElementById('usernameDisplay').innerText = currentUser.username + (currentUser.isGuest ? ' (гость)' : '');
    document.getElementById('userCoins').innerText = currentUser.coins;
    renderGamesList();
    renderMyProjects();
    renderShop();
    renderFriendsList();
    renderChat();
    renderReports();
    startChatPolling();
    connectToServer();
}

function addCoins(amount) { if (!currentUser) return; currentUser.coins += amount; if (!currentUser.isGuest) saveUsers(); document.getElementById('userCoins').innerText = currentUser.coins; updateGlobalRefs(); }
function spendCoins(amount) { if (!currentUser) return false; if (currentUser.coins >= amount) { currentUser.coins -= amount; if (!currentUser.isGuest) saveUsers(); document.getElementById('userCoins').innerText = currentUser.coins; updateGlobalRefs(); return true; } return false; }

// ========== МАГАЗИН ==========
function renderShop() {
    const container = document.getElementById('shopItemsList');
    if (!container) return;
    container.innerHTML = '';
    shopItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `<div style="font-size:48px;">${item.id==='skin_gold'?'👑':item.id==='pickaxe'?'⛏️':'✨'}</div><h3>${item.name}</h3><div class="price">${item.price} 🪙</div><button class="btn buy-btn" data-id="${item.id}" data-price="${item.price}">Купить</button>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.buy-btn').forEach(btn => btn.addEventListener('click', () => { const price = parseInt(btn.dataset.price); if (spendCoins(price)) { alert(`Вы купили ${btn.dataset.id}`); renderShop(); } else alert("Недостаточно монет!"); }));
    attachMobileEvents();
}

// ========== ДРУЗЬЯ ==========
function renderFriendsList() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    container.innerHTML = '';
    (currentUser.friends || []).forEach(friend => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `<span>${friend}</span><div class="friend-actions"><button class="removeFriendBtn" data-friend="${friend}">❌</button></div>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.removeFriendBtn').forEach(btn => btn.addEventListener('click', () => { const friend = btn.dataset.friend; currentUser.friends = currentUser.friends.filter(f => f !== friend); saveUsers(); renderFriendsList(); }));
    attachMobileEvents();
}
function addFriend() {
    const friendName = document.getElementById('friendSearch').value.trim();
    if (!friendName || friendName === currentUser.username) return;
    const targetUser = users.find(u => u.username === friendName);
    if (!targetUser) { alert("Пользователь не найден"); return; }
    if (currentUser.friends.includes(friendName)) { alert("Уже в друзьях"); return; }
    if (!targetUser.friendRequests) targetUser.friendRequests = [];
    targetUser.friendRequests.push(currentUser.username);
    saveUsers();
    alert(`Заявка отправлена ${friendName}`);
    document.getElementById('friendSearch').value = '';
}

// ========== ЧАТ ==========
function renderChat() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.innerHTML = '';
    chatMessages.slice(-30).forEach(msg => { const div = document.createElement('div'); div.innerHTML = `<span style="color:#ffaa44;">[${msg.time}]</span> <b>${msg.user}:</b> ${msg.text}`; container.appendChild(div); });
    container.scrollTop = container.scrollHeight;
}
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    const newMsg = { user: currentUser.username, text: text, time: new Date().toLocaleTimeString() };
    chatMessages.push(newMsg);
    saveChat();
    renderChat();
    input.value = '';
}
function startChatPolling() { setInterval(() => { const stored = JSON.parse(localStorage.getItem('blockverse_chat')) || []; if (JSON.stringify(stored) !== JSON.stringify(chatMessages)) { chatMessages = stored; renderChat(); } }, 2000); }

// ========== МУЛЬТИПЛЕЕР (WebSocket) ==========
let ws = null;
let currentGameId = null;
let myPlayerId = null;
let remotePlayers = new Map();
let gameScene = null, gameCamera = null, gameRenderer = null, gamePlayer = null;
let gameActive = false;
let gameAnimationId = null;
let collisionBlocks = [];
let moveDirection = { x: 0, z: 0 };
let jumpRequest = false;
let moveSpeed = 4;
let controls = null;

// Размеры игрока (куб 0.6 x 0.8)
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 0.8;
const PLAYER_DEPTH = 0.4;
const PLAYER_HALF_WIDTH = PLAYER_WIDTH / 2;
const PLAYER_HALF_HEIGHT = PLAYER_HEIGHT / 2;
const PLAYER_HALF_DEPTH = PLAYER_DEPTH / 2;

// Размеры блока (0.9 x 0.9 x 0.9 после масштабирования)
const BLOCK_HALF_SIZE = 0.45;

function connectToServer() {
    const serverUrl = 'wss://blockverse-server.onrender.com';
    ws = new WebSocket(serverUrl);
    ws.onopen = () => { console.log('Connected to game server'); requestGamesList(); };
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'games_list': renderGamesList(data.games); break;
            case 'game_created':
                alert(`Игра "${data.gameName}" создана! ID: ${data.gameId}`);
                requestGamesList();
                break;
            case 'joined':
                myPlayerId = data.playerId;
                startGameSession(data.gameData, data.gameName);
                break;
            case 'player_joined':
                const newPlayer = createRemotePlayer();
                newPlayer.position.set(data.position.x, data.position.y, data.position.z);
                gameScene.add(newPlayer);
                remotePlayers.set(data.playerId, newPlayer);
                break;
            case 'player_moved':
                const movedPlayer = remotePlayers.get(data.playerId);
                if (movedPlayer) movedPlayer.position.set(data.position.x, data.position.y, data.position.z);
                break;
            case 'player_left':
                const leftPlayer = remotePlayers.get(data.playerId);
                if (leftPlayer) gameScene.remove(leftPlayer);
                remotePlayers.delete(data.playerId);
                break;
            case 'error': alert(data.message); break;
        }
    };
    ws.onerror = (err) => console.error('WebSocket error:', err);
}

function requestGamesList() { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'get_games_list' })); }
function createGameOnServer(gameName, gameData) { if (!ws || ws.readyState !== WebSocket.OPEN) return; ws.send(JSON.stringify({ type: 'create_game', gameName, author: currentUser.username, gameData })); }
function joinGame(gameId) { if (!ws || ws.readyState !== WebSocket.OPEN) return; currentGameId = gameId; ws.send(JSON.stringify({ type: 'join_game', gameId })); }
function sendPosition(pos) { if (ws && ws.readyState === WebSocket.OPEN && currentGameId) ws.send(JSON.stringify({ type: 'update_position', position: pos })); }
function leaveGame() { if (ws && ws.readyState === WebSocket.OPEN && currentGameId) ws.send(JSON.stringify({ type: 'leave_game' })); currentGameId = null; }

function renderGamesList(games) {
    const container = document.getElementById('gamesList');
    if (!container) return;
    container.innerHTML = '';
    if (!games || games.length === 0) { container.innerHTML = '<p>Нет активных серверов. Создайте новый!</p>'; attachMobileEvents(); return; }
    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <div class="game-image">🎲</div>
            <div class="game-info">
                <div class="game-title">${game.name}</div>
                <div class="game-author">👤 ${game.author} | 🟢 ${game.players} игроков</div>
                <button class="play-btn" data-id="${game.id}">Играть</button>
            </div>
        `;
        container.appendChild(card);
    });
    document.querySelectorAll('.play-btn').forEach(btn => btn.addEventListener('click', () => { const gameId = btn.dataset.id; joinGame(gameId); }));
    attachMobileEvents();
}

// ========== НОВАЯ КОЛЛИЗИЯ (без спавн-блока) ==========
function checkCollisionAndAdjust(pos, velY, blocks) {
    let newPos = pos.clone();
    let newVelY = velY;
    let onGround = false;

    function getPlayerBox(p) {
        return {
            minX: p.x - PLAYER_HALF_WIDTH,
            maxX: p.x + PLAYER_HALF_WIDTH,
            minY: p.y - PLAYER_HALF_HEIGHT,
            maxY: p.y + PLAYER_HALF_HEIGHT,
            minZ: p.z - PLAYER_HALF_DEPTH,
            maxZ: p.z + PLAYER_HALF_DEPTH
        };
    }

    // Коррекция по X
    let playerBox = getPlayerBox(newPos);
    for (let block of blocks) {
        const bPos = block.position;
        const bScale = block.scale;
        const halfX = BLOCK_HALF_SIZE * bScale.x;
        const halfY = BLOCK_HALF_SIZE * bScale.y;
        const halfZ = BLOCK_HALF_SIZE * bScale.z;
        const blockBox = {
            minX: bPos.x - halfX,
            maxX: bPos.x + halfX,
            minY: bPos.y - halfY,
            maxY: bPos.y + halfY,
            minZ: bPos.z - halfZ,
            maxZ: bPos.z + halfZ
        };
        if (playerBox.maxX > blockBox.minX && playerBox.minX < blockBox.maxX &&
            playerBox.maxY > blockBox.minY && playerBox.minY < blockBox.maxY &&
            playerBox.maxZ > blockBox.minZ && playerBox.minZ < blockBox.maxZ) {
            const overlapLeft = playerBox.maxX - blockBox.minX;
            const overlapRight = blockBox.maxX - playerBox.minX;
            if (overlapLeft > 0 && overlapRight > 0) {
                if (overlapLeft < overlapRight) {
                    newPos.x -= overlapLeft;
                } else {
                    newPos.x += overlapRight;
                }
                playerBox = getPlayerBox(newPos);
            }
        }
    }

    // Коррекция по Z
    playerBox = getPlayerBox(newPos);
    for (let block of blocks) {
        const bPos = block.position;
        const bScale = block.scale;
        const halfX = BLOCK_HALF_SIZE * bScale.x;
        const halfY = BLOCK_HALF_SIZE * bScale.y;
        const halfZ = BLOCK_HALF_SIZE * bScale.z;
        const blockBox = {
            minX: bPos.x - halfX,
            maxX: bPos.x + halfX,
            minY: bPos.y - halfY,
            maxY: bPos.y + halfY,
            minZ: bPos.z - halfZ,
            maxZ: bPos.z + halfZ
        };
        if (playerBox.maxX > blockBox.minX && playerBox.minX < blockBox.maxX &&
            playerBox.maxY > blockBox.minY && playerBox.minY < blockBox.maxY &&
            playerBox.maxZ > blockBox.minZ && playerBox.minZ < blockBox.maxZ) {
            const overlapFront = playerBox.maxZ - blockBox.minZ;
            const overlapBack = blockBox.maxZ - playerBox.minZ;
            if (overlapFront > 0 && overlapBack > 0) {
                if (overlapFront < overlapBack) {
                    newPos.z -= overlapFront;
                } else {
                    newPos.z += overlapBack;
                }
                playerBox = getPlayerBox(newPos);
            }
        }
    }

    // Коррекция по Y с определением земли
    playerBox = getPlayerBox(newPos);
    for (let block of blocks) {
        const bPos = block.position;
        const bScale = block.scale;
        const halfX = BLOCK_HALF_SIZE * bScale.x;
        const halfY = BLOCK_HALF_SIZE * bScale.y;
        const halfZ = BLOCK_HALF_SIZE * bScale.z;
        const blockBox = {
            minX: bPos.x - halfX,
            maxX: bPos.x + halfX,
            minY: bPos.y - halfY,
            maxY: bPos.y + halfY,
            minZ: bPos.z - halfZ,
            maxZ: bPos.z + halfZ
        };
        if (playerBox.maxX > blockBox.minX && playerBox.minX < blockBox.maxX &&
            playerBox.maxZ > blockBox.minZ && playerBox.minZ < blockBox.maxZ) {
            if (newVelY <= 0 && playerBox.minY < blockBox.maxY && playerBox.minY > blockBox.minY - 0.1) {
                const newY = blockBox.maxY + PLAYER_HALF_HEIGHT;
                newPos.y = newY;
                newVelY = 0;
                onGround = true;
            }
            else if (newVelY > 0 && playerBox.maxY > blockBox.minY && playerBox.maxY < blockBox.minY + 0.1) {
                const newY = blockBox.minY - PLAYER_HALF_HEIGHT;
                newPos.y = newY;
                newVelY = 0;
            }
        }
    }
    return { pos: newPos, velY: newVelY, onGround };
}

// Размещение модели на платформе
function placeModelOnPlatform(model, platform) {
    const bbox = new THREE.Box3().setFromObject(model);
    const modelMinY = bbox.min.y;
    const platformTopY = platform.position.y + (BLOCK_HALF_SIZE * platform.scale.y);
    const offsetY = platformTopY - modelMinY;
    model.position.set(platform.position.x, offsetY, platform.position.z);
}

// ========== ИГРОВАЯ СЕССИЯ (мультиплеер) ==========
async function startGameSession(gameData, gameName) {
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.remove('hidden');
    const container = document.getElementById('customGameContainer');
    container.innerHTML = '';

    gameScene = new THREE.Scene();
    gameScene.background = new THREE.Color(0x87CEEB);
    gameScene.fog = new THREE.Fog(0x87CEEB, 30, 60);
    gameCamera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    gameRenderer = new THREE.WebGLRenderer({ antialias: true });
    gameRenderer.setSize(window.innerWidth, window.innerHeight);
    gameRenderer.shadowMap.enabled = true;
    container.appendChild(gameRenderer.domElement);

    const ambient = new THREE.AmbientLight(0x404060);
    gameScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff5d1, 1);
    dirLight.position.set(5,10,7);
    dirLight.castShadow = true;
    gameScene.add(dirLight);
    const pointLight = new THREE.PointLight(0xffaa66, 1, 20);
    pointLight.position.set(0, 3, 0);
    pointLight.castShadow = true;
    gameScene.add(pointLight);

    collisionBlocks = [];

    // Базовая платформа (всегда)
    const platformMesh = createMesh('cube', { x: 20/0.9, y: 1/0.9, z: 20/0.9 }, 0x6B8E23);
    platformMesh.position.set(0, -0.5, 0);
    gameScene.add(platformMesh);
    collisionBlocks.push(platformMesh);

    if (gameData && gameData.blocks) {
        gameData.blocks.forEach(block => {
            const mesh = createMesh(block.shape || 'cube', block.scale, block.color, block.opacity);
            mesh.position.set(block.x, block.y, block.z);
            mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
            mesh.userData = { ...mesh.userData, ...block.userData };
            gameScene.add(mesh);
            collisionBlocks.push(mesh);
        });
    }

    // Простой кубический персонаж
    const playerModel = createDefaultCharacter(0x3a86ff);
    placeModelOnPlatform(playerModel, platformMesh);
    gameScene.add(playerModel);
    gamePlayer = playerModel;

    // Управление с клавиатуры
    const keyState = { w: false, s: false, a: false, d: false };
    const handleKey = (e, val) => {
        if(!gameActive) return;
        switch(e.key) {
            case 'w': keyState.w = val; break;
            case 's': keyState.s = val; break;
            case 'a': keyState.a = val; break;
            case 'd': keyState.d = val; break;
            case ' ': case 'Space': jumpRequest = val; e.preventDefault(); break;
        }
    };
    window.addEventListener('keydown', e=>handleKey(e,true));
    window.addEventListener('keyup', e=>handleKey(e,false));

    // Сенсорный джойстик
    const joystickDiv = document.getElementById('joystick');
    const jumpBtnDiv = document.getElementById('jumpBtn');
    let joystickThumb = joystickDiv?.querySelector('.joystick-thumb');
    if (joystickDiv) {
        joystickDiv.style.display = 'block';
        jumpBtnDiv.style.display = 'flex';
        let joystickCenter = { x: 0, y: 0 };
        let activeTouch = false;
        const updateJoystick = (touch) => {
            if (!activeTouch) return;
            const dx = touch.clientX - joystickCenter.x;
            const dy = touch.clientY - joystickCenter.y;
            const maxDist = 40;
            let dist = Math.hypot(dx, dy);
            if (dist > maxDist) {
                const angle = Math.atan2(dy, dx);
                const nx = Math.cos(angle) * maxDist;
                const ny = Math.sin(angle) * maxDist;
                moveDirection.x = nx / maxDist;
                moveDirection.z = ny / maxDist;
                if (joystickThumb) joystickThumb.style.transform = `translate(${nx}px, ${ny}px)`;
            } else {
                moveDirection.x = dx / maxDist;
                moveDirection.z = dy / maxDist;
                if (joystickThumb) joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
            }
        };
        joystickDiv.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = joystickDiv.getBoundingClientRect();
            joystickCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            activeTouch = true;
            updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (activeTouch) updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchend', () => {
            activeTouch = false;
            moveDirection = { x: 0, z: 0 };
            if (joystickThumb) joystickThumb.style.transform = `translate(0px, 0px)`;
        });
        jumpBtnDiv.addEventListener('touchstart', (e) => { e.preventDefault(); jumpRequest = true; });
        jumpBtnDiv.addEventListener('touchend', () => { jumpRequest = false; });
        jumpBtnDiv.addEventListener('mousedown', () => { jumpRequest = true; });
        jumpBtnDiv.addEventListener('mouseup', () => { jumpRequest = false; });
    }

    controls = new OrbitControls(gameCamera, gameRenderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.target.copy(gamePlayer.position);

    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomInBtn) zoomInBtn.onclick = () => { controls.object.zoom = Math.min(3, controls.object.zoom - 0.2); controls.update(); };
    if (zoomOutBtn) zoomOutBtn.onclick = () => { controls.object.zoom = Math.max(0.5, controls.object.zoom + 0.2); controls.update(); };

    const scoreDiv = document.querySelector('#customGameScreen .custom-game-ui:first-of-type');
    if(scoreDiv) scoreDiv.innerText = 'Счёт: 0';

    let playerVelocityY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let isOnGround = false;
    let lastTime = performance.now()/1000;

    function update() {
        if(!gameActive) return;
        const now = performance.now()/1000;
        const delta = Math.min(0.033, now - lastTime);
        lastTime = now;

        let moveX = 0, moveZ = 0;
        if (keyState.w) moveZ -= 1;
        if (keyState.s) moveZ += 1;
        if (keyState.a) moveX -= 1;
        if (keyState.d) moveX += 1;
        if (moveX !==0 || moveZ !==0) { const len = Math.hypot(moveX, moveZ); moveX/=len; moveZ/=len; }
        if (moveDirection.x !== 0 || moveDirection.z !== 0) {
            moveX = moveDirection.x;
            moveZ = moveDirection.z;
        }

        if (moveX !== 0 || moveZ !== 0) {
            const angle = Math.atan2(moveX, moveZ);
            gamePlayer.rotation.y = angle;
        }

        let speed = moveSpeed * delta;
        let newPos = gamePlayer.position.clone();
        newPos.x += moveX * speed;
        newPos.z += moveZ * speed;

        playerVelocityY -= GRAVITY * delta;
        newPos.y += playerVelocityY * delta;

        const collisionResult = checkCollisionAndAdjust(newPos, playerVelocityY, collisionBlocks);
        newPos = collisionResult.pos;
        playerVelocityY = collisionResult.velY;
        isOnGround = collisionResult.onGround;

        // Защита от падения в бездну
        if (newPos.y < -5) {
            placeModelOnPlatform(gamePlayer, platformMesh);
            newPos.copy(gamePlayer.position);
            playerVelocityY = 0;
            isOnGround = true;
        }

        if (isOnGround && jumpRequest) {
            playerVelocityY = JUMP_FORCE;
            jumpRequest = false;
        }

        gamePlayer.position.copy(newPos);
        sendPosition({ x: gamePlayer.position.x, y: gamePlayer.position.y, z: gamePlayer.position.z });

        controls.target.copy(gamePlayer.position);
        controls.update();
        pointLight.position.set(gamePlayer.position.x, gamePlayer.position.y + 1, gamePlayer.position.z);
    }
    function animate() { if(!gameActive) return; gameAnimationId = requestAnimationFrame(animate); update(); gameRenderer.render(gameScene, gameCamera); }
    gameActive = true;
    animate();

    const exitBtn = document.querySelector('#customGameScreen .exit-game');
    exitBtn.onclick = () => {
        gameActive = false;
        if(gameAnimationId) cancelAnimationFrame(gameAnimationId);
        leaveGame();
        document.getElementById('customGameScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        requestGamesList();
    };
    attachMobileEvents();
}

// ========== ЛОКАЛЬНАЯ ИГРОВАЯ СЕССИЯ ==========
async function startLocalGameSession(gameData, gameName) {
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.remove('hidden');
    const container = document.getElementById('customGameContainer');
    container.innerHTML = '';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 30, 60);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x404060);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff5d1, 1);
    dirLight.position.set(5,10,7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xffaa66, 1, 20);
    pointLight.position.set(0, 3, 0);
    pointLight.castShadow = true;
    scene.add(pointLight);

    const blocks = [];

    const platformMesh = createMesh('cube', { x: 20/0.9, y: 1/0.9, z: 20/0.9 }, 0x6B8E23);
    platformMesh.position.set(0, -0.5, 0);
    scene.add(platformMesh);
    blocks.push(platformMesh);

    if (gameData && gameData.blocks) {
        gameData.blocks.forEach(block => {
            const mesh = createMesh(block.shape || 'cube', block.scale, block.color, block.opacity);
            mesh.position.set(block.x, block.y, block.z);
            mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
            scene.add(mesh);
            blocks.push(mesh);
        });
    }

    const player = createDefaultCharacter(0x3a86ff);
    placeModelOnPlatform(player, platformMesh);
    scene.add(player);

    // Управление
    let localKeyState = { w: false, s: false, a: false, d: false };
    let localMoveDirection = { x: 0, z: 0 };
    let localJumpRequest = false;
    const handleKey = (e, val) => {
        switch(e.key) {
            case 'w': localKeyState.w = val; break;
            case 's': localKeyState.s = val; break;
            case 'a': localKeyState.a = val; break;
            case 'd': localKeyState.d = val; break;
            case ' ': case 'Space': localJumpRequest = val; e.preventDefault(); break;
        }
    };
    window.addEventListener('keydown', e=>handleKey(e,true));
    window.addEventListener('keyup', e=>handleKey(e,false));

    const joystickDiv = document.getElementById('joystick');
    const jumpBtnDiv = document.getElementById('jumpBtn');
    let joystickThumb = joystickDiv?.querySelector('.joystick-thumb');
    if (joystickDiv) {
        joystickDiv.style.display = 'block';
        jumpBtnDiv.style.display = 'flex';
        let joystickCenter = { x: 0, y: 0 };
        let activeTouch = false;
        const updateJoystick = (touch) => {
            if (!activeTouch) return;
            const dx = touch.clientX - joystickCenter.x;
            const dy = touch.clientY - joystickCenter.y;
            const maxDist = 40;
            let dist = Math.hypot(dx, dy);
            if (dist > maxDist) {
                const angle = Math.atan2(dy, dx);
                const nx = Math.cos(angle) * maxDist;
                const ny = Math.sin(angle) * maxDist;
                localMoveDirection.x = nx / maxDist;
                localMoveDirection.z = ny / maxDist;
                if (joystickThumb) joystickThumb.style.transform = `translate(${nx}px, ${ny}px)`;
            } else {
                localMoveDirection.x = dx / maxDist;
                localMoveDirection.z = dy / maxDist;
                if (joystickThumb) joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
            }
        };
        joystickDiv.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = joystickDiv.getBoundingClientRect();
            joystickCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            activeTouch = true;
            updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (activeTouch) updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchend', () => {
            activeTouch = false;
            localMoveDirection = { x: 0, z: 0 };
            if (joystickThumb) joystickThumb.style.transform = `translate(0px, 0px)`;
        });
        jumpBtnDiv.addEventListener('touchstart', (e) => { e.preventDefault(); localJumpRequest = true; });
        jumpBtnDiv.addEventListener('touchend', () => { localJumpRequest = false; });
        jumpBtnDiv.addEventListener('mousedown', () => { localJumpRequest = true; });
        jumpBtnDiv.addEventListener('mouseup', () => { localJumpRequest = false; });
    }

    const localControls = new OrbitControls(camera, renderer.domElement);
    localControls.enableDamping = true;
    localControls.dampingFactor = 0.05;
    localControls.rotateSpeed = 1.0;
    localControls.zoomSpeed = 1.2;
    localControls.enableZoom = true;
    localControls.enablePan = false;
    localControls.target.copy(player.position);

    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomInBtn) zoomInBtn.onclick = () => { localControls.object.zoom = Math.min(3, localControls.object.zoom - 0.2); localControls.update(); };
    if (zoomOutBtn) zoomOutBtn.onclick = () => { localControls.object.zoom = Math.max(0.5, localControls.object.zoom + 0.2); localControls.update(); };

    const scoreDiv = document.querySelector('#customGameScreen .custom-game-ui:first-of-type');
    if(scoreDiv) scoreDiv.innerText = 'Счёт: 0';

    let playerVelocityY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let isOnGround = false;
    let lastTime = performance.now()/1000;
    let localGameActive = true;

    function updateLocal() {
        if(!localGameActive) return;
        const now = performance.now()/1000;
        const delta = Math.min(0.033, now - lastTime);
        lastTime = now;

        let moveX = 0, moveZ = 0;
        if (localKeyState.w) moveZ -= 1;
        if (localKeyState.s) moveZ += 1;
        if (localKeyState.a) moveX -= 1;
        if (localKeyState.d) moveX += 1;
        if (moveX !==0 || moveZ !==0) { const len = Math.hypot(moveX, moveZ); moveX/=len; moveZ/=len; }
        if (localMoveDirection.x !== 0 || localMoveDirection.z !== 0) {
            moveX = localMoveDirection.x;
            moveZ = localMoveDirection.z;
        }

        if (moveX !== 0 || moveZ !== 0) {
            const angle = Math.atan2(moveX, moveZ);
            player.rotation.y = angle;
        }

        let speed = moveSpeed * delta;
        let newPos = player.position.clone();
        newPos.x += moveX * speed;
        newPos.z += moveZ * speed;
        playerVelocityY -= GRAVITY * delta;
        newPos.y += playerVelocityY * delta;

        const collisionResult = checkCollisionAndAdjust(newPos, playerVelocityY, blocks);
        newPos = collisionResult.pos;
        playerVelocityY = collisionResult.velY;
        isOnGround = collisionResult.onGround;

        if (newPos.y < -5) {
            placeModelOnPlatform(player, platformMesh);
            newPos.copy(player.position);
            playerVelocityY = 0;
            isOnGround = true;
        }

        if (isOnGround && localJumpRequest) {
            playerVelocityY = JUMP_FORCE;
            localJumpRequest = false;
        }

        player.position.copy(newPos);

        localControls.target.copy(player.position);
        localControls.update();
        pointLight.position.set(player.position.x, player.position.y + 1, player.position.z);
        renderer.render(scene, camera);
        requestAnimationFrame(updateLocal);
    }
    updateLocal();

    const exitBtn = document.querySelector('#customGameScreen .exit-game');
    exitBtn.onclick = () => {
        localGameActive = false;
        document.getElementById('customGameScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
    };
    attachMobileEvents();
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function createDefaultCharacter(color = 0x3a86ff) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.8,0.4), new THREE.MeshStandardMaterial({ color }));
    body.position.y=0; body.castShadow=true; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4,32,32), new THREE.MeshStandardMaterial({ color:0xffccaa }));
    head.position.y=0.6; head.castShadow=true; group.add(head);
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.12,16,16), new THREE.MeshStandardMaterial({ color:0xffffff }));
    leftEye.position.set(-0.15,0.75,0.4);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.12,16,16), new THREE.MeshStandardMaterial({ color:0xffffff }));
    rightEye.position.set(0.15,0.75,0.4);
    group.add(leftEye,rightEye);
    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.07,16,16), new THREE.MeshStandardMaterial({ color:0x000000 }));
    leftPupil.position.set(-0.15,0.73,0.52);
    const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.07,16,16), new THREE.MeshStandardMaterial({ color:0x000000 }));
    rightPupil.position.set(0.15,0.73,0.52);
    group.add(leftPupil,rightPupil);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.6,0.3), new THREE.MeshStandardMaterial({ color }));
    leftArm.position.set(-0.55,0.3,0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.6,0.3), new THREE.MeshStandardMaterial({ color }));
    rightArm.position.set(0.55,0.3,0);
    group.add(leftArm,rightArm);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.6,0.3), new THREE.MeshStandardMaterial({ color:0x2c5f8a }));
    leftLeg.position.set(-0.25,-0.5,0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.6,0.3), new THREE.MeshStandardMaterial({ color:0x2c5f8a }));
    rightLeg.position.set(0.25,-0.5,0);
    group.add(leftLeg,rightLeg);
    return group;
}

function createRemotePlayer() {
    return createDefaultCharacter(0xffaa44);
}

function createMesh(shape, size = { x: 0.9, y: 0.9, z: 0.9 }, color = 0x8B5A2B, opacity = 1) {
    let geometry;
    switch(shape) {
        case 'sphere': geometry = new THREE.SphereGeometry(0.45, 32, 32); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 32); break;
        case 'cone': geometry = new THREE.ConeGeometry(0.45, 0.9, 32); break;
        default: geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    }
    const material = new THREE.MeshStandardMaterial({ color });
    material.transparent = opacity < 1;
    material.opacity = opacity;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(size.x, size.y, size.z);
    return mesh;
}

// ========== МОИ ПРОЕКТЫ ==========
function renderMyProjects() {
    const container = document.getElementById('myProjectsList');
    if (!container) return;
    container.innerHTML = '';
    const myGames = customGames.filter(g => g.author === currentUser.username);
    if (myGames.length === 0) {
        container.innerHTML = '<p>У вас пока нет созданных игр. Перейдите в конструктор, чтобы создать свою первую игру!</p>';
        attachMobileEvents();
        return;
    }
    myGames.forEach(game => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <div class="game-title">${game.name}</div>
            <div class="game-desc" style="font-size:12px; color:#aaa;">${game.desc || 'Без описания'}</div>
            <div style="margin-top:12px; display:flex; gap:8px;">
                <button class="play-btn-small" data-id="${game.id}" style="background:#ff5722; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">Одиночная игра</button>
                <button class="host-btn-small" data-id="${game.id}" style="background:#4a6e8a; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">🌐 Мультиплеер (создать сервер)</button>
                <button class="edit-btn-small" data-id="${game.id}" style="background:#ffaa44; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">Редактировать</button>
                <button class="delete-btn-small" data-id="${game.id}" style="background:#ff3333; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">Удалить</button>
            </div>
        `;
        container.appendChild(card);
    });
    document.querySelectorAll('.play-btn-small').forEach(btn => btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const game = customGames.find(g => g.id === id);
        if (game) startLocalGameSession(game.data, game.name);
    }));
    document.querySelectorAll('.host-btn-small').forEach(btn => btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const game = customGames.find(g => g.id === id);
        if (game) createGameOnServer(game.name, game.data);
    }));
    document.querySelectorAll('.edit-btn-small').forEach(btn => btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const game = customGames.find(g => g.id === id);
        if (game) {
            const module = await import('./editor.js');
            module.openEditor(game);
        }
    }));
    document.querySelectorAll('.delete-btn-small').forEach(btn => btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        if (confirm('Удалить игру?')) {
            customGames = customGames.filter(g => g.id !== id);
            saveGames();
            renderMyProjects();
        }
    }));
    attachMobileEvents();
}

// ========== РЕПОРТЫ ==========
function renderReports() {
    const container = document.getElementById('reportsList');
    if (!container) return;
    container.innerHTML = '';
    reports.slice().reverse().forEach(report => {
        const div = document.createElement('div');
        div.style.background = '#1e263a';
        div.style.margin = '8px 0';
        div.style.padding = '8px';
        div.style.borderRadius = '12px';
        div.innerHTML = `<b>${report.user}</b> (${report.time}): ${report.text}`;
        container.appendChild(div);
    });
}

function showReportDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const dialog = document.createElement('div');
    dialog.className = 'report-dialog';
    dialog.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
            <h3>Сообщить о проблеме</h3>
            <button class="close-dialog" style="background:none; border:none; color:white; font-size:20px;">✖</button>
        </div>
        <textarea id="reportText" rows="4" style="width:100%; background:#1a1f2e; border:1px solid #ffaa44; border-radius:12px; padding:8px; color:white;"></textarea>
        <button id="submitReportBtn" class="btn" style="margin-top:12px;">Отправить</button>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
    const close = () => { overlay.remove(); dialog.remove(); };
    dialog.querySelector('.close-dialog').onclick = close;
    overlay.onclick = close;
    dialog.querySelector('#submitReportBtn').onclick = () => {
        const text = dialog.querySelector('#reportText').value.trim();
        if (!text) return;
        reports.push({ user: currentUser.username, text: text, time: new Date().toLocaleString() });
        saveReports();
        renderReports();
        alert('Спасибо! Сообщение отправлено разработчикам.');
        close();
    };
    attachMobileEvents();
}

// ========== НАСТРОЙКИ ==========
function applySettings() { moveSpeed = parseFloat(document.getElementById('moveSpeed').value); }
document.getElementById('mouseSensitivity')?.addEventListener('input', applySettings);
document.getElementById('moveSpeed')?.addEventListener('input', applySettings);
document.getElementById('reportBugBtn')?.addEventListener('click', showReportDialog);
document.getElementById('connectToServerBtn')?.addEventListener('click', () => {
    const serverId = document.getElementById('serverIdInput').value.trim();
    if (!serverId) { alert('Введите ID сервера'); return; }
    joinGame(serverId);
});

// ========== МОБИЛЬНЫЕ СОБЫТИЯ ==========
function attachMobileEvents() {
    const selectors = '.btn, .nav-btn, .play-btn, .buy-btn, .tool-btn, .block-option, .close-dialog, .exit-game, .publish-btn, .exit-editor-btn, .play-btn-small, .edit-btn-small, .delete-btn-small, #createNewGameBtn, #refreshGamesBtn, #earnCoinsBtn, #addFriendBtn, #sendChatBtn, #reportBugBtn, #toggleToolsPanelBtn, #togglePropsPanelBtn, #toggleToolsBtn, #togglePropsBtn, #connectToServerBtn, .host-btn, .host-btn-small';
    document.querySelectorAll(selectors).forEach(el => {
        if (el.hasAttribute('data-touch-fixed')) return;
        el.setAttribute('data-touch-fixed', 'true');
        el.addEventListener('touchstart', (e) => { if (e.defaultPrevented) return; if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return; e.preventDefault(); el.click(); }, { passive: false });
    });
}
setInterval(attachMobileEvents, 1500);
attachMobileEvents();

// ========== АВТОРИЗАЦИЯ ==========
function showLogin() { document.getElementById('loginForm').style.display='block'; document.getElementById('registerForm').style.display='none'; document.getElementById('authMessage').innerText=''; }
function showRegister() { document.getElementById('loginForm').style.display='none'; document.getElementById('registerForm').style.display='block'; document.getElementById('authMessage').innerText=''; }
function registerUser() {
    const u = document.getElementById('regUsername').value.trim(), p = document.getElementById('regPassword').value.trim();
    if (!u||!p) { alert("Введите имя и пароль"); return; }
    if (users.find(us=>us.username===u)) { alert("Пользователь уже существует"); return; }
    users.push({ username:u, password:p, coins:500, inventory:[], isGuest:false, friends:[], friendRequests:[], customModel:null });
    saveUsers();
    alert("Аккаунт создан! Войдите.");
    showLogin();
}
function loginUser() {
    const u = document.getElementById('loginUsername').value.trim(), p = document.getElementById('loginPassword').value.trim();
    const user = users.find(us=>us.username===u && us.password===p);
    if (!user) { document.getElementById('authMessage').innerText = "Неверные данные"; return; }
    currentUser = user;
    initUserData(currentUser.username);
    localStorage.setItem('blockverse_current_user', JSON.stringify({ username: currentUser.username, isGuest: currentUser.isGuest }));
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainMenuScreen').classList.remove('hidden');
    updateUIafterAuth();
}
function guestLogin() {
    const guestName = "Guest_" + Math.floor(Math.random()*10000);
    currentUser = { username:guestName, coins:300, inventory:[], isGuest:true, friends:[], friendRequests:[], customModel:null };
    localStorage.setItem('blockverse_current_user', JSON.stringify({ username: guestName, isGuest: true }));
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainMenuScreen').classList.remove('hidden');
    updateUIafterAuth();
    alert("Вы вошли как гость. Монеты и игры не сохранятся.");
}
function logout() {
    if (gameActive) { gameActive = false; if (gameAnimationId) cancelAnimationFrame(gameAnimationId); }
    if (ws) ws.close();
    currentUser = null;
    localStorage.removeItem('blockverse_current_user');
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    showLogin();
    updateGlobalRefs();
}

// ========== ПРИВЯЗКА ЭЛЕМЕНТОВ ==========
document.getElementById('showLoginBtn').onclick = showLogin;
document.getElementById('showRegisterBtn').onclick = showRegister;
document.getElementById('doLoginBtn').onclick = loginUser;
document.getElementById('doRegisterBtn').onclick = registerUser;
document.getElementById('guestLoginBtn').onclick = guestLogin;
document.getElementById('guestRegisterBtn').onclick = guestLogin;
document.getElementById('logoutBtn').onclick = logout;
document.getElementById('showGamesBtn').onclick = () => { document.getElementById('gamesPanel').style.display='block'; document.getElementById('myProjectsPanel').style.display='none'; document.getElementById('shopPanel').style.display='none'; document.getElementById('socialPanel').style.display='none'; document.getElementById('settingsPanel').style.display='none'; requestGamesList(); };
document.getElementById('showMyProjectsBtn').onclick = () => { document.getElementById('gamesPanel').style.display='none'; document.getElementById('myProjectsPanel').style.display='block'; document.getElementById('shopPanel').style.display='none'; document.getElementById('socialPanel').style.display='none'; document.getElementById('settingsPanel').style.display='none'; renderMyProjects(); };
document.getElementById('showShopBtn').onclick = () => { document.getElementById('gamesPanel').style.display='none'; document.getElementById('myProjectsPanel').style.display='none'; document.getElementById('shopPanel').style.display='block'; document.getElementById('socialPanel').style.display='none'; document.getElementById('settingsPanel').style.display='none'; renderShop(); };
document.getElementById('showSocialBtn').onclick = () => { document.getElementById('gamesPanel').style.display='none'; document.getElementById('myProjectsPanel').style.display='none'; document.getElementById('shopPanel').style.display='none'; document.getElementById('socialPanel').style.display='block'; document.getElementById('settingsPanel').style.display='none'; renderFriendsList(); renderChat(); };
document.getElementById('showSettingsBtn').onclick = () => { document.getElementById('gamesPanel').style.display='none'; document.getElementById('myProjectsPanel').style.display='none'; document.getElementById('shopPanel').style.display='none'; document.getElementById('socialPanel').style.display='none'; document.getElementById('settingsPanel').style.display='block'; };
document.getElementById('createGameBtn').onclick = async () => {
    const module = await import('./editor.js');
    module.openEditor(null);
};
document.getElementById('earnCoinsBtn').onclick = () => addCoins(100);
document.getElementById('addFriendBtn').onclick = addFriend;
document.getElementById('sendChatBtn').onclick = sendChatMessage;
document.getElementById('chatInput').addEventListener('keypress', e=>{ if(e.key==='Enter') sendChatMessage(); });

if(users.length===0) { users.push({ username:"demo", password:"123", coins:800, inventory:[], isGuest:false, friends:[], friendRequests:[], customModel:null }); saveUsers(); }

const savedUser = localStorage.getItem('blockverse_current_user');
if (savedUser) {
    const userData = JSON.parse(savedUser);
    if (userData.isGuest) {
        currentUser = { username: userData.username, coins:300, inventory:[], isGuest:true, friends:[], friendRequests:[], customModel:null };
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        updateUIafterAuth();
    } else {
        const user = users.find(u => u.username === userData.username);
        if (user) {
            currentUser = user;
            initUserData(currentUser.username);
            document.getElementById('authScreen').classList.add('hidden');
            document.getElementById('mainMenuScreen').classList.remove('hidden');
            updateUIafterAuth();
        } else {
            showLogin();
        }
    }
} else {
    showLogin();
        }
