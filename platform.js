import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as API from './api.js';

let currentUser = null;
let chatPollingInterval = null;
let ws = null;
let currentGameId = null;
let myPlayerId = null;
let remotePlayers = new Map();
let gameScene = null, gameCamera = null, gameRenderer = null, gamePlayer = null;
let gameActive = false;
let gameAnimationId = null;
let collisionBlocks = [];
let moveSpeed = 4;
let effectComposer = null;
let health = 100;
let isDead = false;
let ragdollParts = [];
let inventory = [];
let coins = 0;

const MAP_SIZE = 500;
const PLAYER_SIZE = 0.8;
const PLAYER_HEIGHT = 1.6;
const PLAYER_HALF_SIZE = PLAYER_SIZE / 2;
const PLAYER_HALF_HEIGHT = PLAYER_HEIGHT / 2;

const shopItems = [
    { id: 'skin_gold', name: 'Золотой скин', price: 250 },
    { id: 'pickaxe', name: 'Алмазная кирка', price: 500 },
    { id: 'trail', name: 'Искрящийся след', price: 150 }
];

window.currentUser = currentUser;
window.customGames = [];
window.saveGames = () => {};
window.renderMyProjects = renderMyProjects;
window.createGameOnServer = createGameOnServer;
window.addCoins = addCoins;
window.spendCoins = spendCoins;

// ========== МОБИЛЬНОЕ УПРАВЛЕНИЕ ==========
let joystickActive = false;
let joystickVector = { x: 0, z: 0 };
let mobileJump = false;

function initMobileControls() {
    const joystickContainer = document.getElementById('joystickContainer');
    const joystickThumb = document.getElementById('joystickThumb');
    const jumpBtn = document.getElementById('mobileJumpBtn');
    if (!joystickContainer) return;
    
    let touchId = null;
    const maxDist = 45;
    let centerX = 35, centerY = 35;
    
    const onTouchStart = (e) => {
        e.preventDefault();
        const rect = joystickContainer.getBoundingClientRect();
        const touch = e.touches[0];
        touchId = touch.identifier;
        joystickActive = true;
        centerX = rect.width / 2;
        centerY = rect.height / 2;
        joystickThumb.style.transition = 'none';
        joystickThumb.style.left = (centerX - 25) + 'px';
        joystickThumb.style.top = (centerY - 25) + 'px';
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        updateJoystickPosition(touchX, touchY);
    };
    
    const onTouchMove = (e) => {
        if (!joystickActive) return;
        const rect = joystickContainer.getBoundingClientRect();
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === touchId) {
                const touchX = e.touches[i].clientX - rect.left;
                const touchY = e.touches[i].clientY - rect.top;
                updateJoystickPosition(touchX, touchY);
                break;
            }
        }
    };
    
    const onTouchEnd = () => {
        if (!joystickActive) return;
        joystickActive = false;
        joystickVector = { x: 0, z: 0 };
        joystickThumb.style.transition = '0.1s';
        joystickThumb.style.left = (centerX - 25) + 'px';
        joystickThumb.style.top = (centerY - 25) + 'px';
    };
    
    function updateJoystickPosition(x, y) {
        let dx = x - centerX;
        let dy = y - centerY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) {
            dx = dx * maxDist / dist;
            dy = dy * maxDist / dist;
        }
        joystickThumb.style.left = (centerX + dx - 25) + 'px';
        joystickThumb.style.top = (centerY + dy - 25) + 'px';
        joystickVector = { x: dx / maxDist, z: dy / maxDist };
    }
    
    joystickContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    
    if (jumpBtn) {
        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            mobileJump = true;
            jumpBtn.style.transform = 'scale(0.95)';
        });
        jumpBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            mobileJump = false;
            jumpBtn.style.transform = 'scale(1)';
        });
        jumpBtn.addEventListener('mousedown', () => { 
            mobileJump = true;
            jumpBtn.style.transform = 'scale(0.95)';
        });
        jumpBtn.addEventListener('mouseup', () => { 
            mobileJump = false;
            jumpBtn.style.transform = 'scale(1)';
        });
    }
}

// ========== МУЛЬТИПЛЕЕР (ЛОКАЛЬНЫЙ) ==========
let activeLocalGames = new Map();

function createLocalGame(name, data) {
    const gameId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    activeLocalGames.set(gameId, { 
        id: gameId, 
        name: name, 
        author: currentUser?.username || 'Гость', 
        players: 1, 
        gameData: data 
    });
    alert(`Игра "${name}" создана локально! ID: ${gameId}`);
    renderLocalGamesList();
    return gameId;
}

function renderLocalGamesList() {
    const container = document.getElementById('gamesList');
    if (!container) return;
    const games = Array.from(activeLocalGames.values());
    container.innerHTML = '';
    if (!games.length) { 
        container.innerHTML = '<p>Нет активных серверов. Создайте новый!</p>'; 
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
            const game = activeLocalGames.get(gameId);
            if (game) startLocalGameSession(game.gameData, game.name);
            else alert('Игра не найдена');
        });
    });
    attachMobileEvents();
}

function createGameOnServer(name, data) {
    createLocalGame(name, data);
}

function joinGame(id) {
    const game = activeLocalGames.get(id);
    if (game) startLocalGameSession(game.gameData, game.name);
    else alert('Сервер не найден');
}

function connectToServer() {
    renderLocalGamesList();
}

// ========== КОЛЛИЗИЯ ==========
function getBlockBoundingBox(block) {
    let halfX, halfY, halfZ;
    if (block.geometry) {
        if (block.geometry.parameters.width) {
            halfX = block.geometry.parameters.width / 2;
            halfY = block.geometry.parameters.height / 2;
            halfZ = block.geometry.parameters.depth / 2;
        } else {
            halfX = (block.scale?.x || 1) * 0.45;
            halfY = (block.scale?.y || 1) * 0.45;
            halfZ = (block.scale?.z || 1) * 0.45;
        }
    } else {
        halfX = (block.scale?.x || 1) * 0.45;
        halfY = (block.scale?.y || 1) * 0.45;
        halfZ = (block.scale?.z || 1) * 0.45;
    }
    return { 
        minX: block.position.x - halfX, 
        maxX: block.position.x + halfX, 
        minY: block.position.y - halfY, 
        maxY: block.position.y + halfY, 
        minZ: block.position.z - halfZ, 
        maxZ: block.position.z + halfZ 
    };
}

function getPlayerBoundingBox(pos) {
    return { 
        minX: pos.x - PLAYER_HALF_SIZE, 
        maxX: pos.x + PLAYER_HALF_SIZE, 
        minY: pos.y - PLAYER_HALF_HEIGHT, 
        maxY: pos.y + PLAYER_HALF_HEIGHT, 
        minZ: pos.z - PLAYER_HALF_SIZE, 
        maxZ: pos.z + PLAYER_HALF_SIZE 
    };
}

function intersectBoxes(a, b) {
    return a.maxX > b.minX && a.minX < b.maxX && 
           a.maxY > b.minY && a.minY < b.maxY && 
           a.maxZ > b.minZ && a.minZ < b.maxZ;
}

function collide(dt, pos, velY, blocks) {
    let newPos = pos.clone();
    let newVelY = velY;
    let onGround = false;
    
    newPos.y += newVelY * dt;
    let playerBox = getPlayerBoundingBox(newPos);
    for (let block of blocks) {
        if (block.userData?.collision === false) continue;
        const blockBox = getBlockBoundingBox(block);
        if (playerBox.minX < blockBox.maxX && playerBox.maxX > blockBox.minX &&
            playerBox.minZ < blockBox.maxZ && playerBox.maxZ > blockBox.minZ) {
            if (newVelY <= 0 && playerBox.minY <= blockBox.maxY + 0.1 && playerBox.minY > blockBox.maxY - 0.2) {
                newPos.y = blockBox.maxY + PLAYER_HALF_HEIGHT;
                newVelY = 0;
                onGround = true;
            } else if (newVelY > 0 && playerBox.maxY >= blockBox.minY - 0.1 && playerBox.maxY < blockBox.minY + 0.2) {
                newPos.y = blockBox.minY - PLAYER_HALF_HEIGHT;
                newVelY = 0;
            }
        }
    }
    
    playerBox = getPlayerBoundingBox(newPos);
    for (let block of blocks) {
        if (block.userData?.collision === false) continue;
        const blockBox = getBlockBoundingBox(block);
        if (intersectBoxes(playerBox, blockBox)) {
            const overlapLeft = playerBox.maxX - blockBox.minX;
            const overlapRight = blockBox.maxX - playerBox.minX;
            if (overlapLeft < overlapRight) newPos.x -= overlapLeft;
            else newPos.x += overlapRight;
            playerBox = getPlayerBoundingBox(newPos);
        }
    }
    
    playerBox = getPlayerBoundingBox(newPos);
    for (let block of blocks) {
        if (block.userData?.collision === false) continue;
        const blockBox = getBlockBoundingBox(block);
        if (intersectBoxes(playerBox, blockBox)) {
            const overlapFront = playerBox.maxZ - blockBox.minZ;
            const overlapBack = blockBox.maxZ - playerBox.minZ;
            if (overlapFront < overlapBack) newPos.z -= overlapFront;
            else newPos.z += overlapBack;
            playerBox = getPlayerBoundingBox(newPos);
        }
    }
    
    playerBox = getPlayerBoundingBox(newPos);
    for (let block of blocks) {
        if (block.userData?.collision === false) continue;
        const blockBox = getBlockBoundingBox(block);
        if (playerBox.minX < blockBox.maxX && playerBox.maxX > blockBox.minX &&
            playerBox.minZ < blockBox.maxZ && playerBox.maxZ > blockBox.minZ) {
            if (Math.abs(playerBox.minY - blockBox.maxY) < 0.1 && newVelY <= 0) {
                onGround = true;
                newVelY = 0;
                newPos.y = blockBox.maxY + PLAYER_HALF_HEIGHT;
                break;
            }
        }
    }
    return { pos: newPos, velY: newVelY, onGround };
}

function placeOnPlatform(model, platform) {
    const platformTop = platform.position.y + platform.geometry.parameters.height / 2;
    model.position.set(platform.position.x, platformTop + PLAYER_HALF_HEIGHT, platform.position.z);
}

function createMesh(shape, size, color, opacity) {
    let sx = 0.9, sy = 0.9, sz = 0.9;
    if (size) {
        if (typeof size === 'number') { sx = sy = sz = size; }
        else if (typeof size.x === 'number') { sx = size.x; sy = size.y !== undefined ? size.y : size.x; sz = size.z !== undefined ? size.z : size.x; }
    }
    let geometry;
    switch(shape) {
        case 'sphere': geometry = new THREE.SphereGeometry(0.45, 32, 32); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 32); break;
        case 'cone': geometry = new THREE.ConeGeometry(0.45, 0.9, 32); break;
        default: geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    }
    const material = new THREE.MeshStandardMaterial({ color: typeof color === 'string' ? parseInt(color.slice(1), 16) : color });
    material.transparent = opacity < 1;
    material.opacity = opacity;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(sx, sy, sz);
    return mesh;
}

function getBlockPosition(block) {
    if (block.position && typeof block.position.x === 'number') return block.position;
    if (typeof block.x === 'number') return { x: block.x, y: block.y, z: block.z };
    return { x: 0, y: 0, z: 0 };
}
function getBlockRotation(block) {
    if (block.rotation && typeof block.rotation.x === 'number') return block.rotation;
    if (typeof block.rx === 'number') return { x: block.rx, y: block.ry, z: block.rz };
    return { x: 0, y: 0, z: 0 };
}
function getBlockScale(block) {
    if (block.scale && typeof block.scale.x === 'number') return block.scale;
    if (typeof block.sx === 'number') return { x: block.sx, y: block.sy, z: block.sz };
    if (typeof block.scale === 'number') return { x: block.scale, y: block.scale, z: block.scale };
    return { x: 1, y: 1, z: 1 };
}

function takeDamage(amount) {
    if (isDead) return;
    health -= amount;
    document.getElementById('healthValue').innerText = health;
    if (health <= 0) { health = 0; die(); }
}

function die() {
    isDead = true;
    if (gamePlayer) {
        gamePlayer.visible = false;
        const positions = [[0,0,0],[0.3,0.2,0],[-0.3,0.2,0],[0,0.5,0]];
        ragdollParts.forEach(p => gameScene.remove(p));
        ragdollParts = [];
        positions.forEach(pos => {
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4), new THREE.MeshStandardMaterial({ color: 0xaa5555 }));
            box.position.copy(gamePlayer.position);
            box.position.x += pos[0];
            box.position.y += pos[1];
            box.position.z += pos[2];
            gameScene.add(box);
            ragdollParts.push(box);
        });
        setTimeout(() => { respawn(); }, 3000);
    }
}

function respawn() {
    health = 100;
    isDead = false;
    document.getElementById('healthValue').innerText = health;
    ragdollParts.forEach(p => gameScene.remove(p));
    ragdollParts = [];
    gamePlayer.visible = true;
    placeOnPlatform(gamePlayer, platformMesh);
}

let platformMesh;

async function startGameSession(gameData, gameName) {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'flex';
    await new Promise(r => setTimeout(r, 100));
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('customGameScreen').classList.remove('hidden');
    const mobileControls = document.getElementById('mobileControls');
    if (mobileControls) mobileControls.style.display = 'block';
    const container = document.getElementById('customGameContainer');
    container.innerHTML = '';

    gameScene = new THREE.Scene();
    gameScene.background = new THREE.Color(0x0a1030);
    gameScene.fog = new THREE.FogExp2(0x0a1030, 0.002);
    gameCamera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    gameCamera.position.set(0, 2, 5);
    gameRenderer = new THREE.WebGLRenderer({ antialias: true });
    gameRenderer.setSize(window.innerWidth, window.innerHeight);
    gameRenderer.shadowMap.enabled = true;
    container.appendChild(gameRenderer.domElement);

    effectComposer = new EffectComposer(gameRenderer);
    effectComposer.addPass(new RenderPass(gameScene, gameCamera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1;
    bloomPass.strength = 0.6;
    effectComposer.addPass(bloomPass);

    const ambient = new THREE.AmbientLight(0x404060);
    gameScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff5d1, 1.2);
    dirLight.position.set(5,10,7);
    dirLight.castShadow = true;
    gameScene.add(dirLight);
    const pointLight = new THREE.PointLight(0xffaa66, 0.8, 20);
    pointLight.position.set(0,3,0);
    gameScene.add(pointLight);

    collisionBlocks = [];
    const platformGeometry = new THREE.BoxGeometry(MAP_SIZE, 1, MAP_SIZE);
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x6B8E23, roughness: 0.7 });
    platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
    platformMesh.position.set(0, -0.5, 0);
    platformMesh.receiveShadow = true;
    gameScene.add(platformMesh);
    collisionBlocks.push(platformMesh);

    if (gameData && gameData.blocks) {
        gameData.blocks.forEach(block => {
            const pos = getBlockPosition(block);
            const rot = getBlockRotation(block);
            const scale = getBlockScale(block);
            const mesh = createMesh(block.shape || 'cube', scale, block.color, block.opacity);
            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.rotation.set(rot.x, rot.y, rot.z);
            mesh.userData = block.userData || { collision: true };
            gameScene.add(mesh);
            collisionBlocks.push(mesh);
        });
    }

    const playerMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff });
    const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_HEIGHT, PLAYER_SIZE), playerMat);
    playerMesh.castShadow = true;
    placeOnPlatform(playerMesh, platformMesh);
    gameScene.add(playerMesh);
    gamePlayer = playerMesh;

    const keyState = { w: false, s: false, a: false, d: false };
    let jumpRequest = false;
    const handleKey = (e, val) => {
        if(!gameActive || isDead) return;
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

    let velY = 0;
    const GRAVITY = 15;
    const JUMP_FORCE = 7;
    let onGround = false;
    let lastTime = performance.now() / 1000;

    function update() {
        if(!gameActive || isDead) return;
        const now = performance.now() / 1000;
        let dt = Math.min(0.033, now - lastTime);
        if (dt <= 0) dt = 0.016;
        lastTime = now;
        let mx = (keyState.d ? 1 : 0) - (keyState.a ? 1 : 0);
        let mz = (keyState.s ? 1 : 0) - (keyState.w ? 1 : 0);
        if (joystickActive) { mx += joystickVector.x; mz += joystickVector.z; }
        const len = Math.hypot(mx, mz);
        if (len > 1) { mx /= len; mz /= len; }
        if (mx !== 0 || mz !== 0) gamePlayer.rotation.y = Math.atan2(mx, mz);
        let speed = moveSpeed * dt;
        let newPos = gamePlayer.position.clone();
        newPos.x += mx * speed;
        newPos.z += mz * speed;
        velY -= GRAVITY * dt;
        newPos.y += velY * dt;
        const collisionResult = collide(dt, newPos, velY, collisionBlocks);
        newPos = collisionResult.pos;
        velY = collisionResult.velY;
        onGround = collisionResult.onGround;
        if(newPos.y < -5) { placeOnPlatform(gamePlayer, platformMesh); newPos.copy(gamePlayer.position); velY = 0; onGround = true; }
        let shouldJump = jumpRequest || mobileJump;
        if(onGround && shouldJump) { velY = JUMP_FORCE; jumpRequest = false; mobileJump = false; }
        gamePlayer.position.copy(newPos);
        const targetPos = gamePlayer.position.clone();
        gameCamera.position.x = targetPos.x;
        gameCamera.position.z = targetPos.z + 5;
        gameCamera.position.y = targetPos.y + 2;
        gameCamera.lookAt(targetPos);
        pointLight.position.set(gamePlayer.position.x, gamePlayer.position.y+1, gamePlayer.position.z);
    }

    function animate() { if(!gameActive) return; gameAnimationId = requestAnimationFrame(animate); update(); effectComposer.render(); }
    gameActive = true;
    animate();
    if (loadingScreen) loadingScreen.style.display = 'none';

    const exitBtn = document.querySelector('#customGameScreen .exit-game');
    if (exitBtn) exitBtn.onclick = () => {
        gameActive = false;
        if(gameAnimationId) cancelAnimationFrame(gameAnimationId);
        document.getElementById('customGameScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        if (mobileControls) mobileControls.style.display = 'none';
        renderLocalGamesList();
    };
    attachMobileEvents();
}

async function startLocalGameSession(gameData, gameName) { 
    await startGameSession(gameData, gameName); 
}

// ========== UI ФУНКЦИИ ==========
async function renderGamesList() {
    renderLocalGamesList();
}

async function renderMyProjects() {
    if (!currentUser) return;
    const container = document.getElementById('myProjectsList');
    if (!container) return;
    try {
        const allGames = await API.getGames();
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
                <div class="game-title">${game.name}</div>
                <div class="game-desc" style="font-size:12px;color:#aaa;">${game.description || 'Без описания'}</div>
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
        
        // ПРИВЯЗКА ОБРАБОТЧИКОВ ДЛЯ КНОПОК
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
    }
}

// Обработчики кнопок
async function handlePlayClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    try {
        const allGames = await API.getGames();
        const game = allGames.find(g => g.id === id);
        if (game && game.data) {
            startLocalGameSession(JSON.parse(game.data), game.name);
        } else {
            alert('Ошибка загрузки игры');
        }
    } catch(err) {
        console.error('Play error:', err);
        alert('Ошибка при запуске игры');
    }
}

async function handleHostClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    try {
        const allGames = await API.getGames();
        const game = allGames.find(g => g.id === id);
        if (game && game.data) {
            createLocalGame(game.name, JSON.parse(game.data));
        } else {
            alert('Ошибка загрузки игры');
        }
    } catch(err) {
        console.error('Host error:', err);
        alert('Ошибка при создании сервера');
    }
}

async function handleEditClick(e) {
    const btn = e.currentTarget;
    const id = parseInt(btn.dataset.id);
    try {
        const allGames = await API.getGames();
        const game = allGames.find(g => g.id === id);
        if (game) {
            const mod = await import('./editor.js');
            if (mod.openEditor) mod.openEditor(game);
            else console.error('openEditor not found');
        }
    } catch(err) {
        console.error('Edit error:', err);
        alert('Ошибка при открытии редактора');
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

function renderShop() {
    if (!currentUser) return;
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
    if (!currentUser) return;
    const container = document.getElementById('friendsList');
    if (!container) return;
    container.innerHTML = '';
    (currentUser.friends || []).forEach(friend => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `<span>${friend}</span><div class="friend-actions"><button class="removeFriendBtn" data-friend="${friend}">❌</button></div>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.removeFriendBtn').forEach(btn => btn.addEventListener('click', () => { const friend = btn.dataset.friend; currentUser.friends = currentUser.friends.filter(f => f !== friend); renderFriendsList(); }));
    attachMobileEvents();
}

function addFriend() {
    if (!currentUser) return;
    const friendName = document.getElementById('friendSearch').value.trim();
    if (!friendName || friendName === currentUser.username) return;
    if (currentUser.friends.includes(friendName)) { alert("Уже в друзьях"); return; }
    currentUser.friends.push(friendName);
    renderFriendsList();
    document.getElementById('friendSearch').value = '';
    alert(`Друг ${friendName} добавлен`);
}

async function renderChat() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    try {
        const messages = await API.getChatMessages();
        container.innerHTML = '';
        messages.forEach(msg => { 
            const div = document.createElement('div'); 
            div.innerHTML = `<span style="color:#ffaa44;">[${msg.time}]</span> <b>${msg.username}:</b> ${msg.text}`; 
            container.appendChild(div); 
        });
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error('renderChat error:', e);
    }
}

async function sendChatMessage() {
    if (!currentUser) return;
    const text = document.getElementById('chatInput').value.trim();
    if (!text) return;
    await API.sendChatMessage(currentUser.username, text, new Date().toLocaleTimeString());
    document.getElementById('chatInput').value = '';
    renderChat();
}

function startChatPolling() {
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    chatPollingInterval = setInterval(() => { renderChat(); }, 3000);
}

async function renderReports() {
    const container = document.getElementById('reportsList');
    if (!container) return;
    try {
        const reportsData = await API.getReports();
        container.innerHTML = '';
        reportsData.forEach(r => { 
            const div = document.createElement('div'); 
            div.style.background = 'rgba(30,38,58,0.8)'; 
            div.style.margin = '8px 0'; 
            div.style.padding = '8px'; 
            div.style.borderRadius = '12px'; 
            div.innerHTML = `<b>${r.username}</b> (${r.time}): ${r.text}`; 
            container.appendChild(div); 
        });
    } catch (e) {
        console.error('renderReports error:', e);
    }
}

async function showReportDialog() {
    if (!currentUser) return;
    const text = prompt('Опишите проблему:');
    if (!text) return;
    await API.sendReport(currentUser.username, text, new Date().toLocaleString());
    alert('Спасибо за отчёт!');
    renderReports();
}

function applySettings() { 
    moveSpeed = parseFloat(document.getElementById('moveSpeed').value); 
}

function addCoins(amount) { 
    if (!currentUser) return; 
    coins += amount; 
    document.getElementById('coinValue').innerText = coins; 
}

function spendCoins(amount) { 
    if (coins >= amount) { 
        coins -= amount; 
        document.getElementById('coinValue').innerText = coins; 
        return true; 
    } 
    return false; 
}

async function updateUIafterAuth() {
    if (!currentUser) return;
    document.getElementById('usernameDisplay').innerText = currentUser.username + (currentUser.isGuest ? ' (гость)' : '');
    document.getElementById('userCoins').innerText = currentUser.coins;
    coins = currentUser.coins;
    document.getElementById('coinValue').innerText = coins;
    await renderGamesList();
    await renderMyProjects();
    renderShop();
    renderFriendsList();
    await renderChat();
    await renderReports();
    startChatPolling();
    connectToServer();
}

function logout() {
    if(gameActive) { gameActive=false; if(gameAnimationId) cancelAnimationFrame(gameAnimationId); }
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    currentUser = null;
    window.currentUser = null;
    sessionStorage.removeItem('blockverse_session');
    window.location.href = 'login.html';
}

function attachMobileEvents() {
    const sel = '.btn, .nav-btn, .play-btn, .buy-btn, .tool-btn, .block-option, .exit-game, .play-btn-small, .edit-btn-small, .delete-btn-small, .host-btn-small, #earnCoinsBtn, #addFriendBtn, #sendChatBtn, #reportBugBtn, #connectToServerBtn';
    document.querySelectorAll(sel).forEach(el => {
        if(el.hasAttribute('data-touch-fixed')) return;
        el.setAttribute('data-touch-fixed','true');
        el.addEventListener('touchstart', (e) => { 
            if(e.defaultPrevented) return; 
            if(el.tagName==='INPUT'||el.tagName==='TEXTAREA') return; 
            e.preventDefault(); 
            el.click(); 
        }, { passive:false });
    });
}

setInterval(attachMobileEvents,1500);
attachMobileEvents();

// ========== НАВИГАЦИЯ ==========
document.getElementById('showGamesBtn').onclick = () => { 
    document.getElementById('gamesPanel').style.display='block'; 
    document.getElementById('myProjectsPanel').style.display='none'; 
    document.getElementById('shopPanel').style.display='none'; 
    document.getElementById('socialPanel').style.display='none'; 
    document.getElementById('settingsPanel').style.display='none'; 
    renderGamesList(); 
};
document.getElementById('showMyProjectsBtn').onclick = () => { 
    document.getElementById('gamesPanel').style.display='none'; 
    document.getElementById('myProjectsPanel').style.display='block'; 
    document.getElementById('shopPanel').style.display='none'; 
    document.getElementById('socialPanel').style.display='none'; 
    document.getElementById('settingsPanel').style.display='none'; 
    renderMyProjects(); 
};
document.getElementById('showShopBtn').onclick = () => { 
    document.getElementById('gamesPanel').style.display='none'; 
    document.getElementById('myProjectsPanel').style.display='none'; 
    document.getElementById('shopPanel').style.display='block'; 
    document.getElementById('socialPanel').style.display='none'; 
    document.getElementById('settingsPanel').style.display='none'; 
    renderShop(); 
};
document.getElementById('showSocialBtn').onclick = () => { 
    document.getElementById('gamesPanel').style.display='none'; 
    document.getElementById('myProjectsPanel').style.display='none'; 
    document.getElementById('shopPanel').style.display='none'; 
    document.getElementById('socialPanel').style.display='block'; 
    document.getElementById('settingsPanel').style.display='none'; 
    renderFriendsList(); 
    renderChat(); 
};
document.getElementById('showSettingsBtn').onclick = () => { 
    document.getElementById('gamesPanel').style.display='none'; 
    document.getElementById('myProjectsPanel').style.display='none'; 
    document.getElementById('shopPanel').style.display='none'; 
    document.getElementById('socialPanel').style.display='none'; 
    document.getElementById('settingsPanel').style.display='block'; 
};
document.getElementById('createGameBtn').onclick = async () => { 
    try {
        const mod = await import('./editor.js'); 
        if (mod.openEditor) mod.openEditor();
        else console.error('openEditor not found in editor.js');
    } catch(e) {
        console.error('Error loading editor:', e);
        alert('Ошибка загрузки конструктора');
    }
};
document.getElementById('earnCoinsBtn').onclick = () => addCoins(100);
document.getElementById('addFriendBtn').onclick = addFriend;
document.getElementById('sendChatBtn').onclick = sendChatMessage;
document.getElementById('chatInput').addEventListener('keypress', e=>{ if(e.key==='Enter') sendChatMessage(); });
document.getElementById('logoutBtn').onclick = logout;
document.getElementById('moveSpeed')?.addEventListener('input', applySettings);
document.getElementById('reportBugBtn')?.addEventListener('click', showReportDialog);
document.getElementById('connectToServerBtn')?.addEventListener('click', () => { 
    const sid = document.getElementById('serverIdInput').value.trim(); 
    if(sid) joinGame(sid); 
    else alert('Введите ID сервера'); 
});

// ========== ИНИЦИАЛИЗАЦИЯ СЕССИИ ==========
initMobileControls();

const session = sessionStorage.getItem('blockverse_session');
if (session && session !== 'undefined' && session !== 'null') {
    try {
        const data = JSON.parse(session);
        if (data && data.username) {
            currentUser = { 
                username: data.username, 
                coins: data.coins || 0, 
                inventory: data.inventory || [], 
                friends: data.friends || [], 
                isGuest: data.isGuest || false 
            };
            window.currentUser = currentUser;
            document.getElementById('mainMenuScreen').classList.remove('hidden');
            updateUIafterAuth();
        } else {
            sessionStorage.removeItem('blockverse_session');
            window.location.href = 'login.html';
        }
    } catch (e) {
        console.error('Session parse error:', e);
        sessionStorage.removeItem('blockverse_session');
        window.location.href = 'login.html';
    }
} else { 
    window.location.href = 'login.html'; 
    }
