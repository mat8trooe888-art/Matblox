import * as THREE from 'three';

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

function saveUsers() { localStorage.setItem('blockverse_users', JSON.stringify(users)); updateGlobalRefs(); }
function saveGames() { localStorage.setItem('blockverse_games', JSON.stringify(customGames)); updateGlobalRefs(); }
function saveChat() { localStorage.setItem('blockverse_chat', JSON.stringify(chatMessages.slice(-100))); }
function saveReports() { localStorage.setItem('blockverse_reports', JSON.stringify(reports.slice(-50))); }

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

// ========== МУЛЬТИПЛЕЕР ==========
let ws = null;
let currentGameId = null;
let myPlayerId = null;
let remotePlayers = new Map();
let gameScene = null, gameCamera = null, gameRenderer = null, gamePlayer = null;
let gameActive = false;
let gameAnimationId = null;
let collisionBlocks = [];
let moveSpeed = 4;
let cameraDistance = 5;

// Размеры игрока (простой куб)
const PLAYER_SIZE = 0.6;
const PLAYER_HEIGHT = 0.8;
const PLAYER_HALF_SIZE = PLAYER_SIZE / 2;
const PLAYER_HALF_HEIGHT = PLAYER_HEIGHT / 2;
const BLOCK_HALF_SIZE = 0.45; // для обычных блоков

function connectToServer() {
    try {
        ws = new WebSocket('wss://blockverse-server.onrender.com');
        ws.onopen = () => { console.log('Connected'); requestGamesList(); };
        ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'games_list') renderGamesList(data.games);
                else if (data.type === 'game_created') { alert(`Игра "${data.gameName}" создана! ID: ${data.gameId}`); requestGamesList(); }
                else if (data.type === 'joined') { myPlayerId = data.playerId; startGameSession(data.gameData, data.gameName); }
                else if (data.type === 'player_joined') { const p = createRemotePlayer(); p.position.set(data.position.x, data.position.y, data.position.z); gameScene.add(p); remotePlayers.set(data.playerId, p); }
                else if (data.type === 'player_moved') { const p = remotePlayers.get(data.playerId); if(p) p.position.set(data.position.x, data.position.y, data.position.z); }
                else if (data.type === 'player_left') { const p = remotePlayers.get(data.playerId); if(p) gameScene.remove(p); remotePlayers.delete(data.playerId); }
                else if (data.type === 'error') alert(data.message);
            } catch(e) { console.warn(e); }
        };
        ws.onerror = () => console.warn('WebSocket error ignored');
    } catch(e) { console.warn('WebSocket failed'); }
}
function requestGamesList() { if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'get_games_list'})); }
function createGameOnServer(name, data) { if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'create_game',gameName:name,author:currentUser.username,gameData:data})); }
function joinGame(id) { if(ws && ws.readyState===WebSocket.OPEN) { currentGameId=id; ws.send(JSON.stringify({type:'join_game',gameId:id})); } else { startLocalGameSession(null,'Локальная'); } }
function sendPosition(p) { if(ws && ws.readyState===WebSocket.OPEN && currentGameId) ws.send(JSON.stringify({type:'update_position',position:p})); }
function leaveGame() { if(ws && ws.readyState===WebSocket.OPEN && currentGameId) ws.send(JSON.stringify({type:'leave_game'})); currentGameId=null; }

function renderGamesList(games) {
    const container = document.getElementById('gamesList');
    if (!container) return;
    container.innerHTML = '';
    if (!games || games.length===0) { container.innerHTML='<p>Нет активных серверов. Создайте новый!</p>'; attachMobileEvents(); return; }
    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `<div class="game-image">🎲</div><div class="game-info"><div class="game-title">${game.name}</div><div class="game-author">👤 ${game.author} | 🟢 ${game.players} игроков</div><button class="play-btn" data-id="${game.id}">Играть</button></div>`;
        container.appendChild(card);
    });
    document.querySelectorAll('.play-btn').forEach(btn => btn.addEventListener('click', () => joinGame(btn.dataset.id)));
    attachMobileEvents();
}

// ========== НАДЁЖНАЯ КОЛЛИЗИЯ ==========
function getBlockBox(block) {
    // Если блок создан через createMesh (с масштабом), используем его scale
    if (block.scale) {
        const halfX = BLOCK_HALF_SIZE * block.scale.x;
        const halfY = BLOCK_HALF_SIZE * block.scale.y;
        const halfZ = BLOCK_HALF_SIZE * block.scale.z;
        return {
            minX: block.position.x - halfX,
            maxX: block.position.x + halfX,
            minY: block.position.y - halfY,
            maxY: block.position.y + halfY,
            minZ: block.position.z - halfZ,
            maxZ: block.position.z + halfZ
        };
    }
    // Для обычных кубов (например, платформа) берём размеры из геометрии
    const geom = block.geometry;
    const width = geom.parameters.width;
    const height = geom.parameters.height;
    const depth = geom.parameters.depth;
    return {
        minX: block.position.x - width/2,
        maxX: block.position.x + width/2,
        minY: block.position.y - height/2,
        maxY: block.position.y + height/2,
        minZ: block.position.z - depth/2,
        maxZ: block.position.z + depth/2
    };
}

function resolveCollision(pos, velY, blocks) {
    let newPos = pos.clone();
    let newVelY = velY;
    let onGround = false;

    function getPlayerBox(p) {
        return {
            minX: p.x - PLAYER_HALF_SIZE,
            maxX: p.x + PLAYER_HALF_SIZE,
            minY: p.y - PLAYER_HALF_HEIGHT,
            maxY: p.y + PLAYER_HALF_HEIGHT,
            minZ: p.z - PLAYER_HALF_SIZE,
            maxZ: p.z + PLAYER_HALF_SIZE
        };
    }

    // Коррекция по X
    let playerBox = getPlayerBox(newPos);
    for (let block of blocks) {
        const blockBox = getBlockBox(block);
        if (playerBox.maxX > blockBox.minX && playerBox.minX < blockBox.maxX &&
            playerBox.maxY > blockBox.minY && playerBox.minY < blockBox.maxY &&
            playerBox.maxZ > blockBox.minZ && playerBox.minZ < blockBox.maxZ) {
            const overlapLeft = playerBox.maxX - blockBox.minX;
            const overlapRight = blockBox.maxX - playerBox.minX;
            if (overlapLeft < overlapRight) {
                newPos.x -= overlapLeft;
            } else {
                newPos.x += overlapRight;
            }
            playerBox = getPlayerBox(newPos);
        }
    }

    // Коррекция по Z
    playerBox = getPlayerBox(newPos);
    for (let block of blocks) {
        const blockBox = getBlockBox(block);
        if (playerBox.maxX > blockBox.minX && playerBox.minX < blockBox.maxX &&
            playerBox.maxY > blockBox.minY && playerBox.minY < blockBox.maxY &&
            playerBox.maxZ > blockBox.minZ && playerBox.minZ < blockBox.maxZ) {
            const overlapFront = playerBox.maxZ - blockBox.minZ;
            const overlapBack = blockBox.maxZ - playerBox.minZ;
            if (overlapFront < overlapBack) {
                newPos.z -= overlapFront;
            } else {
                newPos.z += overlapBack;
            }
            playerBox = getPlayerBox(newPos);
        }
    }

    // Коррекция по Y
    playerBox = getPlayerBox(newPos);
    for (let block of blocks) {
        const blockBox = getBlockBox(block);
        if (playerBox.maxX > blockBox.minX && playerBox.minX < blockBox.maxX &&
            playerBox.maxZ > blockBox.minZ && playerBox.minZ < blockBox.maxZ) {
            // Приземление сверху
            if (newVelY <= 0 && playerBox.minY <= blockBox.maxY + 0.05 && playerBox.minY > blockBox.minY - 0.1) {
                const newY = blockBox.maxY + PLAYER_HALF_HEIGHT;
                newPos.y = newY;
                newVelY = 0;
                onGround = true;
            }
            // Удар головой
            else if (newVelY > 0 && playerBox.maxY >= blockBox.minY - 0.05 && playerBox.maxY < blockBox.minY + 0.1) {
                const newY = blockBox.minY - PLAYER_HALF_HEIGHT;
                newPos.y = newY;
                newVelY = 0;
            }
        }
    }
    return { pos: newPos, velY: newVelY, onGround };
}

function placeOnPlatform(model, platform) {
    const platformTop = platform.position.y + platform.geometry.parameters.height / 2;
    model.position.set(platform.position.x, platformTop + PLAYER_HALF_HEIGHT, platform.position.z);
}

async function startGameSession(gameData, gameName) {
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.remove('hidden');
    const container = document.getElementById('customGameContainer');
    container.innerHTML = '';

    gameScene = new THREE.Scene();
    gameScene.background = new THREE.Color(0x87CEEB);
    gameScene.fog = new THREE.Fog(0x87CEEB, 30, 60);
    gameCamera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    gameCamera.position.set(0, 2, 5);
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
    pointLight.position.set(0,3,0);
    pointLight.castShadow = true;
    gameScene.add(pointLight);

    collisionBlocks = [];

    // Платформа – простой куб 20x1x20, без масштаба
    const platformGeometry = new THREE.BoxGeometry(20, 1, 20);
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23 });
    const platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
    platformMesh.position.set(0, -0.5, 0);
    platformMesh.receiveShadow = true;
    platformMesh.castShadow = true;
    gameScene.add(platformMesh);
    collisionBlocks.push(platformMesh);

    if (gameData && gameData.blocks) {
        gameData.blocks.forEach(block => {
            const mesh = createMesh(block.shape || 'cube', block.scale, block.color, block.opacity);
            mesh.position.set(block.x, block.y, block.z);
            mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
            mesh.userData = { ...block.userData };
            gameScene.add(mesh);
            collisionBlocks.push(mesh);
        });
    }

    const playerMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff });
    const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_HEIGHT, PLAYER_SIZE), playerMat);
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = true;
    placeOnPlatform(playerMesh, platformMesh);
    gameScene.add(playerMesh);
    gamePlayer = playerMesh;

    const keyState = { w: false, s: false, a: false, d: false };
    let jumpRequest = false;
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

    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    if (zoomIn) zoomIn.onclick = () => { cameraDistance = Math.max(3, cameraDistance - 0.5); };
    if (zoomOut) zoomOut.onclick = () => { cameraDistance = Math.min(8, cameraDistance + 0.5); };

    let velY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let onGround = false;
    let lastTime = performance.now()/1000;

    function update() {
        if(!gameActive) return;
        const now = performance.now()/1000;
        const dt = Math.min(0.033, now - lastTime);
        lastTime = now;

        let mx=0, mz=0;
        if(keyState.w) mz-=1;
        if(keyState.s) mz+=1;
        if(keyState.a) mx-=1;
        if(keyState.d) mx+=1;
        if(mx!==0 || mz!==0) {
            const len = Math.hypot(mx,mz);
            mx /= len;
            mz /= len;
        }

        if(mx!==0 || mz!==0) {
            const angle = Math.atan2(mx, mz);
            gamePlayer.rotation.y = angle;
        }

        let speed = moveSpeed * dt;
        let newPos = gamePlayer.position.clone();
        newPos.x += mx * speed;
        newPos.z += mz * speed;
        velY -= GRAVITY * dt;
        newPos.y += velY * dt;

        const col = resolveCollision(newPos, velY, collisionBlocks);
        newPos = col.pos;
        velY = col.velY;
        onGround = col.onGround;

        if(newPos.y < -5) {
            placeOnPlatform(gamePlayer, platformMesh);
            newPos.copy(gamePlayer.position);
            velY = 0;
            onGround = true;
        }

        if(onGround && jumpRequest) {
            velY = JUMP_FORCE;
            jumpRequest = false;
        }

        gamePlayer.position.copy(newPos);
        sendPosition({x:gamePlayer.position.x, y:gamePlayer.position.y, z:gamePlayer.position.z});

        const targetPos = gamePlayer.position.clone();
        gameCamera.position.x = targetPos.x;
        gameCamera.position.z = targetPos.z + cameraDistance;
        gameCamera.position.y = targetPos.y + 2;
        gameCamera.lookAt(targetPos);
        pointLight.position.set(gamePlayer.position.x, gamePlayer.position.y+1, gamePlayer.position.z);
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

async function startLocalGameSession(gameData, gameName) {
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.remove('hidden');
    const container = document.getElementById('customGameContainer');
    container.innerHTML = '';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB,30,60);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(0,2,5);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x404060);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff5d1,1);
    dirLight.position.set(5,10,7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xffaa66,1,20);
    pointLight.position.set(0,3,0);
    pointLight.castShadow = true;
    scene.add(pointLight);

    const blocks = [];

    const platformGeometry = new THREE.BoxGeometry(20, 1, 20);
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23 });
    const platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
    platformMesh.position.set(0, -0.5, 0);
    platformMesh.receiveShadow = true;
    platformMesh.castShadow = true;
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

    const playerMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff });
    const player = new THREE.Mesh(new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_HEIGHT, PLAYER_SIZE), playerMat);
    player.castShadow = true;
    player.receiveShadow = true;
    placeOnPlatform(player, platformMesh);
    scene.add(player);

    const keyState = { w: false, s: false, a: false, d: false };
    let jumpRequest = false;
    const handleKey = (e, val) => {
        if(e.key==='w') keyState.w=val;
        if(e.key==='s') keyState.s=val;
        if(e.key==='a') keyState.a=val;
        if(e.key==='d') keyState.d=val;
        if(e.key===' '||e.key==='Space') { jumpRequest=val; e.preventDefault(); }
    };
    window.addEventListener('keydown', e=>handleKey(e,true));
    window.addEventListener('keyup', e=>handleKey(e,false));

    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    let cameraDistanceLocal = 5;
    if (zoomIn) zoomIn.onclick = () => { cameraDistanceLocal = Math.max(3, cameraDistanceLocal - 0.5); };
    if (zoomOut) zoomOut.onclick = () => { cameraDistanceLocal = Math.min(8, cameraDistanceLocal + 0.5); };

    let velY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let onGround = false;
    let lastTime = performance.now()/1000;
    let localActive = true;

    function updateLocal() {
        if(!localActive) return;
        const now = performance.now()/1000;
        const dt = Math.min(0.033, now - lastTime);
        lastTime = now;

        let mx=0, mz=0;
        if(keyState.w) mz-=1;
        if(keyState.s) mz+=1;
        if(keyState.a) mx-=1;
        if(keyState.d) mx+=1;
        if(mx!==0 || mz!==0) {
            const len = Math.hypot(mx,mz);
            mx /= len;
            mz /= len;
        }

        if(mx!==0 || mz!==0) {
            const angle = Math.atan2(mx, mz);
            player.rotation.y = angle;
        }

        let speed = moveSpeed * dt;
        let newPos = player.position.clone();
        newPos.x += mx * speed;
        newPos.z += mz * speed;
        velY -= GRAVITY * dt;
        newPos.y += velY * dt;

        const col = resolveCollision(newPos, velY, blocks);
        newPos = col.pos;
        velY = col.velY;
        onGround = col.onGround;

        if(newPos.y < -5) {
            placeOnPlatform(player, platformMesh);
            newPos.copy(player.position);
            velY = 0;
            onGround = true;
        }

        if(onGround && jumpRequest) {
            velY = JUMP_FORCE;
            jumpRequest = false;
        }

        player.position.copy(newPos);

        const targetPos = player.position.clone();
        camera.position.x = targetPos.x;
        camera.position.z = targetPos.z + cameraDistanceLocal;
        camera.position.y = targetPos.y + 2;
        camera.lookAt(targetPos);
        pointLight.position.set(player.position.x, player.position.y+1, player.position.z);
        renderer.render(scene, camera);
        requestAnimationFrame(updateLocal);
    }
    updateLocal();

    const exitBtn = document.querySelector('#customGameScreen .exit-game');
    exitBtn.onclick = () => {
        localActive = false;
        document.getElementById('customGameScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
    };
    attachMobileEvents();
}

function createRemotePlayer() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffaa44 });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_HEIGHT, PLAYER_SIZE), mat);
    cube.castShadow = true;
    cube.receiveShadow = true;
    return cube;
}

function createMesh(shape, size, color, opacity) {
    let geo;
    switch(shape) {
        case 'sphere': geo = new THREE.SphereGeometry(0.45,32,32); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(0.45,0.45,0.9,32); break;
        case 'cone': geo = new THREE.ConeGeometry(0.45,0.9,32); break;
        default: geo = new THREE.BoxGeometry(0.9,0.9,0.9);
    }
    const mat = new THREE.MeshStandardMaterial({color});
    mat.transparent = opacity<1;
    mat.opacity = opacity;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(size.x, size.y, size.z);
    return mesh;
}

function renderMyProjects() {
    const container = document.getElementById('myProjectsList');
    if (!container) return;
    container.innerHTML = '';
    const myGames = customGames.filter(g => g.author === currentUser.username);
    if(myGames.length===0) { container.innerHTML='<p>У вас пока нет созданных игр. Перейдите в конструктор, чтобы создать свою первую игру!</p>'; attachMobileEvents(); return; }
    myGames.forEach(game => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `<div class="game-title">${game.name}</div><div class="game-desc" style="font-size:12px;color:#aaa;">${game.desc||'Без описания'}</div><div style="margin-top:12px;display:flex;gap:8px;"><button class="play-btn-small" data-id="${game.id}" style="background:#ff5722;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Одиночная игра</button><button class="host-btn-small" data-id="${game.id}" style="background:#4a6e8a;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">🌐 Мультиплеер (создать сервер)</button><button class="edit-btn-small" data-id="${game.id}" style="background:#ffaa44;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Редактировать</button><button class="delete-btn-small" data-id="${game.id}" style="background:#ff3333;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Удалить</button></div>`;
        container.appendChild(card);
    });
    document.querySelectorAll('.play-btn-small').forEach(btn => btn.addEventListener('click', async () => { const id = parseInt(btn.dataset.id); const game = customGames.find(g=>g.id===id); if(game) startLocalGameSession(game.data, game.name); }));
    document.querySelectorAll('.host-btn-small').forEach(btn => btn.addEventListener('click', async () => { const id = parseInt(btn.dataset.id); const game = customGames.find(g=>g.id===id); if(game) createGameOnServer(game.name, game.data); }));
    document.querySelectorAll('.edit-btn-small').forEach(btn => btn.addEventListener('click', async () => { const id = parseInt(btn.dataset.id); const game = customGames.find(g=>g.id===id); if(game) { const mod = await import('./editor.js'); mod.openEditor(game); } }));
    document.querySelectorAll('.delete-btn-small').forEach(btn => btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id); if(confirm('Удалить игру?')) { customGames = customGames.filter(g=>g.id!==id); saveGames(); renderMyProjects(); } }));
    attachMobileEvents();
}

function renderReports() {
    const container = document.getElementById('reportsList');
    if(!container) return;
    container.innerHTML = '';
    reports.slice().reverse().forEach(r => { const div = document.createElement('div'); div.style.background='#1e263a'; div.style.margin='8px 0'; div.style.padding='8px'; div.style.borderRadius='12px'; div.innerHTML = `<b>${r.user}</b> (${r.time}): ${r.text}`; container.appendChild(div); });
}
function showReportDialog() {
    const ov = document.createElement('div'); ov.className='overlay';
    const diag = document.createElement('div'); diag.className='report-dialog';
    diag.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:12px;"><h3>Сообщить о проблеме</h3><button class="close-dialog" style="background:none;border:none;color:white;font-size:20px;">✖</button></div><textarea id="reportText" rows="4" style="width:100%;background:#1a1f2e;border:1px solid #ffaa44;border-radius:12px;padding:8px;color:white;"></textarea><button id="submitReportBtn" class="btn" style="margin-top:12px;">Отправить</button>`;
    document.body.appendChild(ov); document.body.appendChild(diag);
    const close = () => { ov.remove(); diag.remove(); };
    diag.querySelector('.close-dialog').onclick = close;
    ov.onclick = close;
    diag.querySelector('#submitReportBtn').onclick = () => {
        const text = diag.querySelector('#reportText').value.trim();
        if(!text) return;
        reports.push({ user: currentUser.username, text, time: new Date().toLocaleString() });
        saveReports(); renderReports(); alert('Спасибо!'); close();
    };
    attachMobileEvents();
}
function applySettings() { moveSpeed = parseFloat(document.getElementById('moveSpeed').value); }
document.getElementById('mouseSensitivity')?.addEventListener('input', applySettings);
document.getElementById('moveSpeed')?.addEventListener('input', applySettings);
document.getElementById('reportBugBtn')?.addEventListener('click', showReportDialog);
document.getElementById('connectToServerBtn')?.addEventListener('click', () => { const sid = document.getElementById('serverIdInput').value.trim(); if(sid) joinGame(sid); else alert('Введите ID'); });

function attachMobileEvents() {
    const sel = '.btn, .nav-btn, .play-btn, .buy-btn, .tool-btn, .block-option, .close-dialog, .exit-game, .publish-btn, .exit-editor-btn, .play-btn-small, .edit-btn-small, .delete-btn-small, #createNewGameBtn, #refreshGamesBtn, #earnCoinsBtn, #addFriendBtn, #sendChatBtn, #reportBugBtn, #toggleToolsPanelBtn, #togglePropsPanelBtn, #toggleToolsBtn, #togglePropsBtn, #connectToServerBtn, .host-btn, .host-btn-small';
    document.querySelectorAll(sel).forEach(el => {
        if(el.hasAttribute('data-touch-fixed')) return;
        el.setAttribute('data-touch-fixed','true');
        el.addEventListener('touchstart', (e) => { if(e.defaultPrevented) return; if(el.tagName==='INPUT'||el.tagName==='TEXTAREA') return; e.preventDefault(); el.click(); }, { passive:false });
    });
}
setInterval(attachMobileEvents,1500);
attachMobileEvents();

function showLogin() { document.getElementById('loginForm').style.display='block'; document.getElementById('registerForm').style.display='none'; document.getElementById('authMessage').innerText=''; }
function showRegister() { document.getElementById('loginForm').style.display='none'; document.getElementById('registerForm').style.display='block'; document.getElementById('authMessage').innerText=''; }
function registerUser() {
    const u = document.getElementById('regUsername').value.trim(), p = document.getElementById('regPassword').value.trim();
    if(!u||!p) { alert("Введите имя и пароль"); return; }
    if(users.find(us=>us.username===u)) { alert("Пользователь уже существует"); return; }
    users.push({ username:u, password:p, coins:500, inventory:[], isGuest:false, friends:[], friendRequests:[], customModel:null });
    saveUsers(); alert("Аккаунт создан! Войдите."); showLogin();
}
function loginUser() {
    const u = document.getElementById('loginUsername').value.trim(), p = document.getElementById('loginPassword').value.trim();
    const user = users.find(us=>us.username===u && us.password===p);
    if(!user) { document.getElementById('authMessage').innerText = "Неверные данные"; return; }
    currentUser = user; initUserData(currentUser.username);
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
    if(gameActive) { gameActive=false; if(gameAnimationId) cancelAnimationFrame(gameAnimationId); }
    if(ws) ws.close();
    currentUser = null;
    localStorage.removeItem('blockverse_current_user');
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    showLogin(); updateGlobalRefs();
}

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
document.getElementById('createGameBtn').onclick = async () => { const mod = await import('./editor.js'); mod.openEditor(null); };
document.getElementById('earnCoinsBtn').onclick = () => addCoins(100);
document.getElementById('addFriendBtn').onclick = addFriend;
document.getElementById('sendChatBtn').onclick = sendChatMessage;
document.getElementById('chatInput').addEventListener('keypress', e=>{ if(e.key==='Enter') sendChatMessage(); });

if(users.length===0) { users.push({ username:"demo", password:"123", coins:800, inventory:[], isGuest:false, friends:[], friendRequests:[], customModel:null }); saveUsers(); }
const savedUser = localStorage.getItem('blockverse_current_user');
if(savedUser) {
    const ud = JSON.parse(savedUser);
    if(ud.isGuest) {
        currentUser = { username: ud.username, coins:300, inventory:[], isGuest:true, friends:[], friendRequests:[], customModel:null };
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        updateUIafterAuth();
    } else {
        const user = users.find(u=>u.username===ud.username);
        if(user) {
            currentUser = user;
            initUserData(currentUser.username);
            document.getElementById('authScreen').classList.add('hidden');
            document.getElementById('mainMenuScreen').classList.remove('hidden');
            updateUIafterAuth();
        } else showLogin();
    }
} else showLogin();
