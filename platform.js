// platform.js — основная платформа (авторизация, меню, мультиплеер, социальные функции)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Делаем THREE глобальным для редактора (чтобы не загружать повторно)
window.THREE = THREE;

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

// ========== СОХРАНЕНИЕ ==========
function saveUsers() { localStorage.setItem('blockverse_users', JSON.stringify(users)); }
function saveGames() { localStorage.setItem('blockverse_games', JSON.stringify(customGames)); }
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
    renderGamesList();   // получает список с сервера
    renderMyProjects();
    renderShop();
    renderFriendsList();
    renderChat();
    renderReports();
    startChatPolling();
    connectToServer();   // подключаем мультиплеер
}

function addCoins(amount) { if (!currentUser) return; currentUser.coins += amount; if (!currentUser.isGuest) saveUsers(); document.getElementById('userCoins').innerText = currentUser.coins; }
function spendCoins(amount) { if (!currentUser) return false; if (currentUser.coins >= amount) { currentUser.coins -= amount; if (!currentUser.isGuest) saveUsers(); document.getElementById('userCoins').innerText = currentUser.coins; return true; } return false; }

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
let gameCoins = [], gameScore = 0;
let collisionBlocks = [];
let keyState = { w: false, s: false, a: false, d: false, space: false };
let joystickVector = { x: 0, z: 0 }, joystickActive = false;
let cameraDistance = 8;
let moveSpeed = 4;
let mouseSensitivity = 0.005;

function connectToServer() {
    const serverUrl = 'wss://blockverse-server.onrender.com'; // замените на ваш сервер
    ws = new WebSocket(serverUrl);
    ws.onopen = () => {
        console.log('Connected to game server');
        requestGamesList();
    };
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'games_list':
                renderGamesList(data.games);
                break;
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
            case 'error':
                alert(data.message);
                break;
        }
    };
    ws.onerror = (err) => console.error('WebSocket error:', err);
}

function requestGamesList() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_games_list' }));
    }
}

function createGameOnServer(gameName, gameData) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'create_game',
        gameName: gameName,
        author: currentUser.username,
        gameData: gameData
    }));
}

function joinGame(gameId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'join_game', gameId }));
}

function sendPosition(pos) {
    if (ws && ws.readyState === WebSocket.OPEN && currentGameId) {
        ws.send(JSON.stringify({ type: 'update_position', position: pos }));
    }
}

function leaveGame() {
    if (ws && ws.readyState === WebSocket.OPEN && currentGameId) {
        ws.send(JSON.stringify({ type: 'leave_game' }));
    }
    currentGameId = null;
}

function renderGamesList(games) {
    const container = document.getElementById('gamesList');
    if (!container) return;
    container.innerHTML = '';
    if (!games || games.length === 0) {
        container.innerHTML = '<p style="text-align:center; margin:40px;">Нет активных серверов. Создайте новый!</p>';
        attachMobileEvents();
        return;
    }
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
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const gameId = btn.dataset.id;
            joinGame(gameId);
        });
    });
    attachMobileEvents();
}

// ========== ИГРОВАЯ СЕССИЯ (мультиплеер) ==========
function startGameSession(gameData, gameName) {
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
    gameRenderer.setPixelRatio(window.devicePixelRatio);
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
    if (gameData && gameData.blocks) {
        gameData.blocks.forEach(block => {
            const mesh = createMesh(block.shape || 'cube', block.scale, block.color, block.opacity);
            mesh.position.set(block.x, block.y, block.z);
            mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
            gameScene.add(mesh);
            collisionBlocks.push(mesh);
        });
    } else {
        const platform = createMesh('cube', { x: 20/0.9, y: 1/0.9, z: 20/0.9 }, 0x6B8E23);
        platform.position.set(0, -0.5, 0);
        gameScene.add(platform);
        collisionBlocks.push(platform);
    }

    const defaultChar = createDefaultCharacter();
    defaultChar.position.set(0, 1, 0);
    gameScene.add(defaultChar);
    gamePlayer = defaultChar;

    // Управление
    const handleKey = (e, val) => {
        if(!gameActive) return;
        if(e.key==='w') keyState.w=val;
        if(e.key==='s') keyState.s=val;
        if(e.key==='a') keyState.a=val;
        if(e.key==='d') keyState.d=val;
        if(e.key===' ' || e.key==='Space') { keyState.space=val; e.preventDefault(); }
    };
    window.addEventListener('keydown', e=>handleKey(e,true));
    window.addEventListener('keyup', e=>handleKey(e,false));

    const joystickDiv = document.getElementById('joystick');
    const jumpBtnDiv = document.getElementById('jumpBtn');
    const zoomDiv = document.getElementById('cameraZoom');
    let joystickThumb = joystickDiv?.querySelector('.joystick-thumb');
    if (joystickDiv) {
        joystickDiv.style.display = 'block';
        jumpBtnDiv.style.display = 'flex';
        zoomDiv.style.display = 'flex';
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
                joystickVector = { x: nx / maxDist, z: ny / maxDist };
                if (joystickThumb) joystickThumb.style.transform = `translate(${nx}px, ${ny}px)`;
            } else {
                joystickVector = { x: dx / maxDist, z: dy / maxDist };
                if (joystickThumb) joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
            }
        };
        joystickDiv.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = joystickDiv.getBoundingClientRect();
            joystickCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            activeTouch = true;
            joystickActive = true;
            updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (activeTouch) updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchend', () => {
            activeTouch = false;
            joystickActive = false;
            joystickVector = { x: 0, z: 0 };
            if (joystickThumb) joystickThumb.style.transform = `translate(0px, 0px)`;
        });
        jumpBtnDiv.addEventListener('touchstart', (e) => { e.preventDefault(); keyState.space = true; });
        jumpBtnDiv.addEventListener('touchend', () => { keyState.space = false; });
        jumpBtnDiv.addEventListener('mousedown', () => { keyState.space = true; });
        jumpBtnDiv.addEventListener('mouseup', () => { keyState.space = false; });
    }

    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomInBtn) zoomInBtn.onclick = () => { cameraDistance = Math.max(3, cameraDistance - 0.5); };
    if (zoomOutBtn) zoomOutBtn.onclick = () => { cameraDistance = Math.min(15, cameraDistance + 0.5); };
    gameRenderer.domElement.addEventListener('wheel', (e) => {
        cameraDistance += e.deltaY * 0.01;
        cameraDistance = Math.min(Math.max(cameraDistance, 3), 15);
        e.preventDefault();
    });

    const scoreDiv = document.querySelector('#customGameScreen .custom-game-ui:first-of-type');
    if(scoreDiv) scoreDiv.innerText = 'Счёт: 0';
    gameScore = 0;

    let playerVelocityY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let isOnGround = false;

    function checkCollisionAndAdjust(pos, playerSize = { x: 0.4, y: 0.8, z: 0.4 }) {
        let newPos = pos.clone();
        for (let block of collisionBlocks) {
            const bPos = block.position;
            const bScale = block.scale;
            const bHalfSize = { x: 0.45 * bScale.x, y: 0.45 * bScale.y, z: 0.45 * bScale.z };
            if (Math.abs(newPos.x - bPos.x) < playerSize.x + bHalfSize.x &&
                Math.abs(newPos.y - bPos.y) < playerSize.y + bHalfSize.y &&
                Math.abs(newPos.z - bPos.z) < playerSize.z + bHalfSize.z) {
                const dx = newPos.x - bPos.x;
                if (dx > 0) newPos.x = bPos.x + playerSize.x + bHalfSize.x;
                else newPos.x = bPos.x - playerSize.x - bHalfSize.x;
            }
        }
        for (let block of collisionBlocks) {
            const bPos = block.position;
            const bScale = block.scale;
            const bHalfSize = { x: 0.45 * bScale.x, y: 0.45 * bScale.y, z: 0.45 * bScale.z };
            if (Math.abs(newPos.x - bPos.x) < playerSize.x + bHalfSize.x &&
                Math.abs(newPos.y - bPos.y) < playerSize.y + bHalfSize.y &&
                Math.abs(newPos.z - bPos.z) < playerSize.z + bHalfSize.z) {
                const dz = newPos.z - bPos.z;
                if (dz > 0) newPos.z = bPos.z + playerSize.z + bHalfSize.z;
                else newPos.z = bPos.z - playerSize.z - bHalfSize.z;
            }
        }
        let onGround = false;
        for (let block of collisionBlocks) {
            const bPos = block.position;
            const bScale = block.scale;
            const bHalfSize = { x: 0.45 * bScale.x, y: 0.45 * bScale.y, z: 0.45 * bScale.z };
            if (Math.abs(newPos.x - bPos.x) < playerSize.x + bHalfSize.x &&
                Math.abs(newPos.z - bPos.z) < playerSize.z + bHalfSize.z &&
                Math.abs(newPos.y - playerSize.y - (bPos.y + bHalfSize.y)) < 0.1) {
                onGround = true;
                newPos.y = bPos.y + bHalfSize.y + playerSize.y;
            }
        }
        return { pos: newPos, onGround };
    }

    let lastTime = performance.now()/1000;
    function update() {
        if(!gameActive) return;
        const now = performance.now()/1000;
        const delta = Math.min(0.033, now - lastTime);
        lastTime = now;

        let moveX = 0, moveZ = 0;
        if (joystickActive && (joystickVector.x !== 0 || joystickVector.z !== 0)) {
            moveX = joystickVector.x;
            moveZ = joystickVector.z;
        } else {
            if(keyState.w) moveZ -= 1;
            if(keyState.s) moveZ += 1;
            if(keyState.a) moveX -= 1;
            if(keyState.d) moveX += 1;
            if(moveX !==0 || moveZ !==0) { const len = Math.hypot(moveX, moveZ); moveX/=len; moveZ/=len; }
        }
        let speed = moveSpeed * delta;
        let newPos = gamePlayer.position.clone();
        newPos.x += moveX * speed;
        newPos.z += moveZ * speed;
        playerVelocityY -= GRAVITY * delta;
        newPos.y += playerVelocityY * delta;
        const collisionResult = checkCollisionAndAdjust(newPos);
        newPos = collisionResult.pos;
        isOnGround = collisionResult.onGround;
        if (isOnGround && keyState.space) {
            playerVelocityY = JUMP_FORCE;
            isOnGround = false;
            keyState.space = false;
        }
        gamePlayer.position.copy(newPos);

        sendPosition({ x: gamePlayer.position.x, y: gamePlayer.position.y, z: gamePlayer.position.z });

        for(let i=0;i<gameCoins.length;i++) {
            const coin = gameCoins[i];
            if(coin && gamePlayer.position.distanceTo(coin.position) < 0.8) {
                gameScene.remove(coin);
                gameCoins.splice(i,1);
                gameScore++;
                if(scoreDiv) scoreDiv.innerText = `Счёт: ${gameScore}`;
                i--;
            }
        }

        gameCamera.position.x = gamePlayer.position.x;
        gameCamera.position.y = gamePlayer.position.y + 2.5;
        gameCamera.position.z = gamePlayer.position.z + cameraDistance;
        gameCamera.lookAt(gamePlayer.position);
        pointLight.position.set(gamePlayer.position.x, gamePlayer.position.y + 2, gamePlayer.position.z);
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

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ИГРЫ ==========
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
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.8,0.4), new THREE.MeshStandardMaterial({ color:0xffaa44 }));
    body.position.y=0; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4,32,32), new THREE.MeshStandardMaterial({ color:0xffccaa }));
    head.position.y=0.6; group.add(head);
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
    group.castShadow = true;
    return group;
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

// ========== МОИ ПРОЕКТЫ (локальное сохранение) ==========
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
                <button class="play-btn-small" data-id="${game.id}" style="background:#ff5722; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">Играть</button>
                <button class="edit-btn-small" data-id="${game.id}" style="background:#ffaa44; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">Редактировать</button>
                <button class="delete-btn-small" data-id="${game.id}" style="background:#ff3333; border:none; padding:4px 12px; border-radius:20px; cursor:pointer;">Удалить</button>
            </div>
        `;
        container.appendChild(card);
    });
    document.querySelectorAll('.play-btn-small').forEach(btn => btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const game = customGames.find(g => g.id === id);
        if (game) {
            // Запускаем локальную игру (без WebSocket)
            startLocalGameSession(game.data, game.name);
        }
    }));
    document.querySelectorAll('.edit-btn-small').forEach(btn => btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const game = customGames.find(g => g.id === id);
        if (game) {
            // Динамически загружаем редактор
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
            renderGamesList(); // если нужно обновить список серверных игр, но серверные не затрагиваем
        }
    }));
    attachMobileEvents();
}

// Локальная игровая сессия (без сервера) — копия startGameSession без отправки позиции
function startLocalGameSession(gameData, gameName) {
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
    renderer.setPixelRatio(window.devicePixelRatio);
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
    if (gameData && gameData.blocks) {
        gameData.blocks.forEach(block => {
            const mesh = createMesh(block.shape || 'cube', block.scale, block.color, block.opacity);
            mesh.position.set(block.x, block.y, block.z);
            mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
            scene.add(mesh);
            blocks.push(mesh);
        });
    } else {
        const platform = createMesh('cube', { x: 20/0.9, y: 1/0.9, z: 20/0.9 }, 0x6B8E23);
        platform.position.set(0, -0.5, 0);
        scene.add(platform);
        blocks.push(platform);
    }

    const player = createDefaultCharacter();
    player.position.set(0, 1, 0);
    scene.add(player);

    // Управление (аналогично мультиплееру)
    let localKeyState = { w: false, s: false, a: false, d: false, space: false };
    let localJoystickVector = { x: 0, z: 0 }, localJoystickActive = false;
    let localCameraDistance = 8;
    let localMoveSpeed = moveSpeed;

    const handleKey = (e, val) => {
        if(e.key==='w') localKeyState.w=val;
        if(e.key==='s') localKeyState.s=val;
        if(e.key==='a') localKeyState.a=val;
        if(e.key==='d') localKeyState.d=val;
        if(e.key===' ' || e.key==='Space') { localKeyState.space=val; e.preventDefault(); }
    };
    window.addEventListener('keydown', e=>handleKey(e,true));
    window.addEventListener('keyup', e=>handleKey(e,false));

    const joystickDiv = document.getElementById('joystick');
    const jumpBtnDiv = document.getElementById('jumpBtn');
    const zoomDiv = document.getElementById('cameraZoom');
    let joystickThumb = joystickDiv?.querySelector('.joystick-thumb');
    if (joystickDiv) {
        joystickDiv.style.display = 'block';
        jumpBtnDiv.style.display = 'flex';
        zoomDiv.style.display = 'flex';
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
                localJoystickVector = { x: nx / maxDist, z: ny / maxDist };
                if (joystickThumb) joystickThumb.style.transform = `translate(${nx}px, ${ny}px)`;
            } else {
                localJoystickVector = { x: dx / maxDist, z: dy / maxDist };
                if (joystickThumb) joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
            }
        };
        joystickDiv.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = joystickDiv.getBoundingClientRect();
            joystickCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            activeTouch = true;
            localJoystickActive = true;
            updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (activeTouch) updateJoystick(e.touches[0]);
        });
        joystickDiv.addEventListener('touchend', () => {
            activeTouch = false;
            localJoystickActive = false;
            localJoystickVector = { x: 0, z: 0 };
            if (joystickThumb) joystickThumb.style.transform = `translate(0px, 0px)`;
        });
        jumpBtnDiv.addEventListener('touchstart', (e) => { e.preventDefault(); localKeyState.space = true; });
        jumpBtnDiv.addEventListener('touchend', () => { localKeyState.space = false; });
        jumpBtnDiv.addEventListener('mousedown', () => { localKeyState.space = true; });
        jumpBtnDiv.addEventListener('mouseup', () => { localKeyState.space = false; });
    }

    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomInBtn) zoomInBtn.onclick = () => { localCameraDistance = Math.max(3, localCameraDistance - 0.5); };
    if (zoomOutBtn) zoomOutBtn.onclick = () => { localCameraDistance = Math.min(15, localCameraDistance + 0.5); };
    renderer.domElement.addEventListener('wheel', (e) => {
        localCameraDistance += e.deltaY * 0.01;
        localCameraDistance = Math.min(Math.max(localCameraDistance, 3), 15);
        e.preventDefault();
    });

    const scoreDiv = document.querySelector('#customGameScreen .custom-game-ui:first-of-type');
    if(scoreDiv) scoreDiv.innerText = 'Счёт: 0';
    let localScore = 0;
    let localCoins = [];

    let playerVelocityY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let isOnGround = false;

    function checkCollisionAndAdjust(pos, playerSize = { x: 0.4, y: 0.8, z: 0.4 }) {
        let newPos = pos.clone();
        for (let block of blocks) {
            const bPos = block.position;
            const bScale = block.scale;
            const bHalfSize = { x: 0.45 * bScale.x, y: 0.45 * bScale.y, z: 0.45 * bScale.z };
            if (Math.abs(newPos.x - bPos.x) < playerSize.x + bHalfSize.x &&
                Math.abs(newPos.y - bPos.y) < playerSize.y + bHalfSize.y &&
                Math.abs(newPos.z - bPos.z) < playerSize.z + bHalfSize.z) {
                const dx = newPos.x - bPos.x;
                if (dx > 0) newPos.x = bPos.x + playerSize.x + bHalfSize.x;
                else newPos.x = bPos.x - playerSize.x - bHalfSize.x;
            }
        }
        for (let block of blocks) {
            const bPos = block.position;
            const bScale = block.scale;
            const bHalfSize = { x: 0.45 * bScale.x, y: 0.45 * bScale.y, z: 0.45 * bScale.z };
            if (Math.abs(newPos.x - bPos.x) < playerSize.x + bHalfSize.x &&
                Math.abs(newPos.y - bPos.y) < playerSize.y + bHalfSize.y &&
                Math.abs(newPos.z - bPos.z) < playerSize.z + bHalfSize.z) {
                const dz = newPos.z - bPos.z;
                if (dz > 0) newPos.z = bPos.z + playerSize.z + bHalfSize.z;
                else newPos.z = bPos.z - playerSize.z - bHalfSize.z;
            }
        }
        let onGround = false;
        for (let block of blocks) {
            const bPos = block.position;
            const bScale = block.scale;
            const bHalfSize = { x: 0.45 * bScale.x, y: 0.45 * bScale.y, z: 0.45 * bScale.z };
            if (Math.abs(newPos.x - bPos.x) < playerSize.x + bHalfSize.x &&
                Math.abs(newPos.z - bPos.z) < playerSize.z + bHalfSize.z &&
                Math.abs(newPos.y - playerSize.y - (bPos.y + bHalfSize.y)) < 0.1) {
                onGround = true;
                newPos.y = bPos.y + bHalfSize.y + playerSize.y;
            }
        }
        return { pos: newPos, onGround };
    }

    let lastTime = performance.now()/1000;
    let localGameActive = true;
    function updateLocal() {
        if(!localGameActive) return;
        const now = performance.now()/1000;
        const delta = Math.min(0.033, now - lastTime);
        lastTime = now;

        let moveX = 0, moveZ = 0;
        if (localJoystickActive && (localJoystickVector.x !== 0 || localJoystickVector.z !== 0)) {
            moveX = localJoystickVector.x;
            moveZ = localJoystickVector.z;
        } else {
            if(localKeyState.w) moveZ -= 1;
            if(localKeyState.s) moveZ += 1;
            if(localKeyState.a) moveX -= 1;
            if(localKeyState.d) moveX += 1;
            if(moveX !==0 || moveZ !==0) { const len = Math.hypot(moveX, moveZ); moveX/=len; moveZ/=len; }
        }
        let speed = localMoveSpeed * delta;
        let newPos = player.position.clone();
        newPos.x += moveX * speed;
        newPos.z += moveZ * speed;
        playerVelocityY -= GRAVITY * delta;
        newPos.y += playerVelocityY * delta;
        const collisionResult = checkCollisionAndAdjust(newPos);
        newPos = collisionResult.pos;
        isOnGround = collisionResult.onGround;
        if (isOnGround && localKeyState.space) {
            playerVelocityY = JUMP_FORCE;
            isOnGround = false;
            localKeyState.space = false;
        }
        player.position.copy(newPos);

        camera.position.x = player.position.x;
        camera.position.y = player.position.y + 2.5;
        camera.position.z = player.position.z + localCameraDistance;
        camera.lookAt(player.position);
        pointLight.position.set(player.position.x, player.position.y + 2, player.position.z);
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
function applySettings() {
    mouseSensitivity = parseFloat(document.getElementById('mouseSensitivity').value);
    moveSpeed = parseFloat(document.getElementById('moveSpeed').value);
}
document.getElementById('mouseSensitivity').addEventListener('input', applySettings);
document.getElementById('moveSpeed').addEventListener('input', applySettings);
document.getElementById('reportBugBtn').onclick = showReportDialog;

// ========== СОЗДАНИЕ ИГРЫ (с сервером) ==========
document.getElementById('createNewGameBtn').onclick = () => {
    const gameName = document.getElementById('newGameName').value.trim();
    if (!gameName) { alert('Введите название игры'); return; }
    const gameData = { blocks: [] };
    createGameOnServer(gameName, gameData);
    document.getElementById('newGameName').value = '';
};
document.getElementById('refreshGamesBtn').onclick = () => requestGamesList();

// ========== МОБИЛЬНАЯ ОПТИМИЗАЦИЯ ==========
function attachMobileEvents() {
    const selectors = '.btn, .nav-btn, .play-btn, .buy-btn, .tool-btn, .block-option, .close-dialog, .exit-game, .publish-btn, .play-btn-small, .edit-btn-small, .delete-btn-small, #createNewGameBtn, #refreshGamesBtn, #earnCoinsBtn, #addFriendBtn, #sendChatBtn, #reportBugBtn, #applyLightBtn, #applyPropsBtn, #applyScriptBtn, #duplicateBtn, #addCubeBtn, #resetScale, .coord-group button, #modeMove, #modeRotate, #modeScale, #shapeCube, #shapeSphere, #shapeCylinder, #shapeCone, #shapeWedge';
    document.querySelectorAll(selectors).forEach(el => {
        if (el.hasAttribute('data-touch-fixed')) return;
        el.setAttribute('data-touch-fixed', 'true');
        el.addEventListener('touchstart', (e) => {
            if (e.defaultPrevented) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
            e.preventDefault();
            el.click();
        }, { passive: false });
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
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainMenuScreen').classList.remove('hidden');
    updateUIafterAuth();
}
function guestLogin() {
    const guestName = "Guest_" + Math.floor(Math.random()*10000);
    currentUser = { username:guestName, coins:300, inventory:[], isGuest:true, friends:[], friendRequests:[], customModel:null };
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainMenuScreen').classList.remove('hidden');
    updateUIafterAuth();
    alert("Вы вошли как гость. Монеты и игры не сохранятся.");
}
function logout() {
    if (gameActive) {
        gameActive = false;
        if (gameAnimationId) cancelAnimationFrame(gameAnimationId);
        leaveGame();
    }
    currentUser = null;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    showLogin();
}

// Привязка элементов
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
    // Динамически загружаем редактор
    const module = await import('./editor.js');
    module.openEditor(null);
};
document.getElementById('earnCoinsBtn').onclick = () => addCoins(100);
document.getElementById('addFriendBtn').onclick = addFriend;
document.getElementById('sendChatBtn').onclick = sendChatMessage;
document.getElementById('chatInput').addEventListener('keypress', e=>{ if(e.key==='Enter') sendChatMessage(); });

if(users.length===0) { users.push({ username:"demo", password:"123", coins:800, inventory:[], isGuest:false, friends:[], friendRequests:[], customModel:null }); saveUsers(); }
showLogin();