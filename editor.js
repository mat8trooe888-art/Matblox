import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as API from './api.js';

let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorObjects = [];
let selectedObjects = [];
let currentTransformMode = 'translate';
let currentShape = 'cube';
let currentColor = '#8B5A2B';
let currentOpacity = 1;
let editorActive = false;
let editorAnimationId = null;

const systemFolders = [
    { id: 'workspace', name: 'Workspace', icon: '🌐' },
    { id: 'lighting', name: 'Lighting', icon: '☀️' },
    { id: 'serverStorage', name: 'ServerStorage', icon: '📦' },
    { id: 'starterGui', name: 'StarterGui', icon: '🖥️' }
];

let animations = [];
let currentAnimation = null;
let isPlaying = false;
let animationStartTime = 0;
let animationRequestId = null;
let recording = false;
let recordedKeyframes = [];
let recordTarget = null;
let recordStartTime = 0;
let timelineCanvas, timelineCtx;
let currentAnimationTime = 0;
let isDraggingTimeline = false;
let currentAnimationDuration = 1;

let guiElements = [];
let npcs = [];
let selectedNpc = null;

function generateId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

function createBlockMesh(shape, size = { x: 0.9, y: 0.9, z: 0.9 }, color = 0x8B5A2B, opacity = 1, type = 'block') {
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
    mesh.scale.set(size.x, size.y, size.z);
    mesh.userData = { type, shape, color: '#' + (typeof color === 'number' ? color.toString(16).padStart(6,'0') : color.slice(1)), opacity, anchor: false, collision: true };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function loadTemplate(templateType) {
    clearEditor();
    if (templateType === 'platformer') {
        const ground = createBlockMesh('cube', { x: 20, y: 1, z: 20 }, 0x6B8E23, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Земля', type: 'block', parentId: 'workspace', threeObject: ground, userData: { type: 'block', shape: 'cube', color: '#6B8E23', opacity: 1, collision: true } });
        for (let i = -3; i <= 3; i++) {
            const plat = createBlockMesh('cube', { x: 2, y: 0.5, z: 2 }, 0xaa8866, 1);
            plat.position.set(i * 2.5, 0.5 + Math.abs(i) * 0.5, 0);
            addObject({ id: generateId(), name: 'Платформа', type: 'block', parentId: 'workspace', threeObject: plat, userData: { type: 'block', shape: 'cube', color: '#aa8866', opacity: 1, collision: true } });
        }
    } else if (templateType === 'racing') {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const road = createBlockMesh('cube', { x: 2, y: 0.2, z: 2 }, 0x555555, 1);
            road.position.set(Math.cos(angle) * 8, -0.3, Math.sin(angle) * 8);
            addObject({ id: generateId(), name: 'Дорога', type: 'block', parentId: 'workspace', threeObject: road, userData: { type: 'block', shape: 'cube', color: '#555555', opacity: 1, collision: true } });
        }
    } else if (templateType === 'rpg') {
        const ground = createBlockMesh('cube', { x: 30, y: 1, z: 30 }, 0x4a7a4a, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Трава', type: 'block', parentId: 'workspace', threeObject: ground, userData: { type: 'block', shape: 'cube', color: '#4a7a4a', opacity: 1, collision: true } });
        const house = createBlockMesh('cube', { x: 3, y: 2, z: 3 }, 0xaa8866, 1);
        house.position.set(5, 0, 5);
        addObject({ id: generateId(), name: 'Дом', type: 'block', parentId: 'workspace', threeObject: house, userData: { type: 'block', shape: 'cube', color: '#aa8866', opacity: 1, collision: true } });
        const tree = createBlockMesh('cylinder', { x: 1, y: 2, z: 1 }, 0x8B5A2B, 1);
        tree.position.set(-4, 0, -4);
        addObject({ id: generateId(), name: 'Дерево', type: 'block', parentId: 'workspace', threeObject: tree, userData: { type: 'block', shape: 'cylinder', color: '#8B5A2B', opacity: 1, collision: true } });
    }
}

function createParticleSystem(config) {
    const geometry = new THREE.BufferGeometry();
    const count = config.count || 100;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        positions[i*3] = 0;
        positions[i*3+1] = 0;
        positions[i*3+2] = 0;
        velocities.push({ x: (Math.random() - 0.5) * (config.spread || 1), y: Math.random() * (config.speedY || 2), z: (Math.random() - 0.5) * (config.spread || 1) });
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: config.color || 0xffaa44, size: config.size || 0.2, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geometry, material);
    points.userData = { type: 'particleSystem', config, velocities, lifetimes: new Array(count).fill(0).map(() => Math.random() * (config.lifetime || 1)), age: 0 };
    return points;
}

function addParticleSystem(config) {
    const ps = createParticleSystem(config);
    const obj = { id: generateId(), name: config.name || 'Система частиц', type: 'particle', parentId: 'workspace', childrenIds: [], threeObject: ps, userData: { config } };
    addObject(obj);
    return obj;
}

function addParticlePreset(type) {
    const presets = {
        fire: { name:'Огонь', count:200, color:0xff6600, size:0.15, speedY:3, spread:0.8, lifetime:0.8 },
        water: { name:'Вода', count:150, color:0x3399ff, size:0.1, speedY:1.5, spread:1.2, lifetime:1.2 },
        air: { name:'Воздух', count:100, color:0xaaccff, size:0.2, speedY:2, spread:2, lifetime:1.5 },
        smoke: { name:'Дым', count:80, color:0x888888, size:0.3, speedY:1.2, spread:1.5, lifetime:2 }
    };
    addParticleSystem(presets[type]);
}

function createNPC(name = "NPC") {
    const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const material = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.6;
    mesh.userData = { type: 'npc', name, behavior: 'idle', speed: 2, dialog: '', parentId: null };
    const obj = { id: generateId(), name, type: 'npc', parentId: 'workspace', childrenIds: [], threeObject: mesh, userData: mesh.userData };
    addObject(obj);
    npcs.push(obj);
    renderNpcList();
    return obj;
}

function renderNpcList() {
    const container = document.getElementById('npcList');
    if (!container) return;
    container.innerHTML = '';
    npcs.forEach(npc => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#2c2f36; padding:4px 8px; margin:2px 0; border-radius:4px; cursor:pointer;';
        div.textContent = npc.userData.name;
        div.onclick = () => selectNPC(npc);
        container.appendChild(div);
    });
}

function selectNPC(npc) {
    selectedNpc = npc;
    document.getElementById('npcName').value = npc.userData.name;
    document.getElementById('npcBehavior').value = npc.userData.behavior;
    document.getElementById('npcSpeed').value = npc.userData.speed;
    document.getElementById('npcDialog').value = npc.userData.dialog || '';
}

function saveNPCProperties() {
    if (!selectedNpc) return;
    selectedNpc.userData.name = document.getElementById('npcName').value;
    selectedNpc.userData.behavior = document.getElementById('npcBehavior').value;
    selectedNpc.userData.speed = parseFloat(document.getElementById('npcSpeed').value);
    selectedNpc.userData.dialog = document.getElementById('npcDialog').value;
    selectedNpc.name = selectedNpc.userData.name;
    renderNpcList();
    renderExplorer();
}

function addGUIElement(type, properties) {
    const id = generateId();
    const element = { id, type, name: properties.name || `${type}_${guiElements.length+1}`, x: properties.x || 100, y: properties.y || 100, width: properties.width || 200, height: properties.height || 50, text: properties.text || (type === 'button' ? 'Кнопка' : type === 'panel' ? 'Панель' : 'Текст'), color: properties.color || '#4a6e8a', fontSize: properties.fontSize || 14, action: properties.action || '' };
    guiElements.push(element);
    renderGUIList();
    return element;
}

function renderGUIList() {
    const container = document.getElementById('guiElementsList');
    if (!container) return;
    container.innerHTML = '';
    guiElements.forEach(el => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#2c2f36; margin:4px 0; padding:4px 8px; border-radius:8px; display:flex; justify-content:space-between;';
        div.innerHTML = `<span>${el.type === 'button' ? '🔘' : el.type === 'panel' ? '📦' : '📝'} ${el.name}</span><div><button class="editGuiBtn" data-id="${el.id}">✎</button><button class="deleteGuiBtn" data-id="${el.id}">🗑</button></div>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.editGuiBtn').forEach(btn => btn.addEventListener('click', () => { const id = btn.dataset.id; const el = guiElements.find(g => g.id === id); if (el) editGUIElement(el); }));
    document.querySelectorAll('.deleteGuiBtn').forEach(btn => btn.addEventListener('click', () => { const id = btn.dataset.id; guiElements = guiElements.filter(g => g.id !== id); renderGUIList(); updateGUIPreview(); }));
    updateGUIPreview();
}

function editGUIElement(el) {
    const newName = prompt('Название', el.name);
    if (newName) el.name = newName;
    const newX = prompt('X', el.x);
    if (newX !== null) el.x = parseInt(newX);
    const newY = prompt('Y', el.y);
    if (newY !== null) el.y = parseInt(newY);
    const newText = prompt('Текст', el.text);
    if (newText !== null) el.text = newText;
    renderGUIList();
}

function updateGUIPreview() {
    const container = document.getElementById('guiPreview');
    if (!container) return;
    container.innerHTML = '';
    guiElements.forEach(el => {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.left = el.x + 'px';
        div.style.top = el.y + 'px';
        div.style.width = el.width + 'px';
        div.style.height = el.height + 'px';
        div.style.backgroundColor = el.color;
        div.style.color = 'white';
        div.style.borderRadius = '8px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.fontSize = el.fontSize + 'px';
        div.style.cursor = el.type === 'button' ? 'pointer' : 'default';
        div.style.zIndex = '100';
        div.textContent = el.text;
        if (el.type === 'button') {
            div.addEventListener('click', () => { if (el.action) try { new Function('game', 'player', 'world', el.action)(null, null, null); } catch(e) {} alert(`Нажата кнопка: ${el.name}`); });
        }
        container.appendChild(div);
    });
}

function createAnimation(name) {
    const id = generateId();
    const anim = { id, name, duration: 1, tracks: [] };
    animations.push(anim);
    updateAnimationSelect();
    return anim;
}

function addKeyframe(animationId, targetId, property, time, value) {
    const anim = animations.find(a => a.id === animationId);
    if (!anim) return;
    let track = anim.tracks.find(t => t.targetId === targetId && t.property === property);
    if (!track) { track = { targetId, property, keyframes: [] }; anim.tracks.push(track); }
    track.keyframes.push({ time, value });
    track.keyframes.sort((a,b) => a.time - b.time);
    if (time > anim.duration) anim.duration = time;
    drawTimeline();
}

function getInterpolatedValue(keyframes, time) {
    if (!keyframes.length) return null;
    if (time <= keyframes[0].time) return keyframes[0].value;
    if (time >= keyframes[keyframes.length-1].time) return keyframes[keyframes.length-1].value;
    for (let i=0; i<keyframes.length-1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i+1].time) {
            const t = (time - keyframes[i].time) / (keyframes[i+1].time - keyframes[i].time);
            if (typeof keyframes[i].value === 'number') return keyframes[i].value + (keyframes[i+1].value - keyframes[i].value) * t;
            if (keyframes[i].value instanceof THREE.Vector3) return keyframes[i].value.clone().lerp(keyframes[i+1].value, t);
        }
    }
    return null;
}

function applyAnimation(anim, time) {
    if (!anim) return;
    for (let track of anim.tracks) {
        const targetObj = editorObjects.find(o => o.id === track.targetId);
        if (!targetObj || !targetObj.threeObject) continue;
        const value = getInterpolatedValue(track.keyframes, time);
        if (value === null) continue;
        switch(track.property) {
            case 'position': targetObj.threeObject.position.copy(value); break;
            case 'rotation': targetObj.threeObject.rotation.copy(value); break;
            case 'scale': targetObj.threeObject.scale.copy(value); break;
        }
    }
}

function playAnimation(animId) {
    if (isPlaying) stopAnimation();
    currentAnimation = animations.find(a => a.id === animId);
    if (!currentAnimation) return;
    currentAnimationDuration = currentAnimation.duration;
    document.getElementById('animationDuration').innerText = currentAnimationDuration.toFixed(2);
    isPlaying = true;
    animationStartTime = performance.now() / 1000 - currentAnimationTime;
    function animateLoop() {
        if (!isPlaying) return;
        const now = performance.now() / 1000;
        let t = (now - animationStartTime) % currentAnimation.duration;
        setAnimationTime(t);
        animationRequestId = requestAnimationFrame(animateLoop);
    }
    animateLoop();
}

function stopAnimation() {
    if (animationRequestId) cancelAnimationFrame(animationRequestId);
    isPlaying = false;
    currentAnimation = null;
}

function setAnimationTime(time) {
    if (!currentAnimation) return;
    currentAnimationTime = Math.min(time, currentAnimation.duration);
    document.getElementById('currentTime').innerText = currentAnimationTime.toFixed(2);
    applyAnimation(currentAnimation, currentAnimationTime);
    drawTimeline();
}

function drawTimeline() {
    if (!timelineCtx) return;
    timelineCtx.clearRect(0,0,timelineCanvas.width,timelineCanvas.height);
    timelineCtx.strokeStyle = '#666';
    for (let i=0;i<=10;i++) { let x = i * timelineCanvas.width / 10; timelineCtx.beginPath(); timelineCtx.moveTo(x,0); timelineCtx.lineTo(x,timelineCanvas.height); timelineCtx.stroke(); }
    if (currentAnimation) {
        for (let track of currentAnimation.tracks) {
            for (let kf of track.keyframes) {
                let x = (kf.time / currentAnimation.duration) * timelineCanvas.width;
                timelineCtx.fillStyle = '#ffaa44';
                timelineCtx.fillRect(x-2,0,4,timelineCanvas.height);
            }
        }
        let currentX = (currentAnimationTime / currentAnimation.duration) * timelineCanvas.width;
        timelineCtx.fillStyle = '#ff5722';
        timelineCtx.fillRect(currentX-1,0,2,timelineCanvas.height);
    }
}

function initTimeline() {
    timelineCanvas = document.getElementById('timelineCanvas');
    timelineCtx = timelineCanvas.getContext('2d');
    timelineCanvas.addEventListener('mousedown', (e) => { let rect = timelineCanvas.getBoundingClientRect(); let x = e.clientX - rect.left; let time = (x / timelineCanvas.width) * currentAnimationDuration; setAnimationTime(time); isDraggingTimeline = true; });
    window.addEventListener('mouseup', () => { isDraggingTimeline = false; });
    window.addEventListener('mousemove', (e) => { if (isDraggingTimeline && currentAnimation) { let rect = timelineCanvas.getBoundingClientRect(); let x = Math.min(Math.max(e.clientX - rect.left,0),timelineCanvas.width); let time = (x / timelineCanvas.width) * currentAnimationDuration; setAnimationTime(time); } });
}

function updateAnimationSelect() {
    const select = document.getElementById('animationSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Выберите анимацию --</option>';
    animations.forEach(anim => { let opt = document.createElement('option'); opt.value = anim.id; opt.textContent = anim.name; select.appendChild(opt); });
}

function addObject(obj) {
    editorObjects.push(obj);
    if (obj.threeObject) editorScene.add(obj.threeObject);
    renderExplorer();
    return obj;
}

function deleteObject(obj) {
    if (confirm(`Удалить ${obj.name}?`)) {
        if (obj.threeObject) obj.threeObject.parent?.remove(obj.threeObject);
        const idx = editorObjects.findIndex(o => o.id === obj.id);
        if (idx !== -1) editorObjects.splice(idx,1);
        if (selectedObjects.includes(obj)) {
            selectedObjects = selectedObjects.filter(o => o !== obj);
            if (selectedObjects.length === 1) transformControls.attach(selectedObjects[0].threeObject);
            else if (selectedObjects.length === 0) transformControls.detach();
        }
        if (obj.type === 'npc') { npcs = npcs.filter(n => n.id !== obj.id); renderNpcList(); }
        renderExplorer();
        updatePropertiesPanel();
    }
}

function duplicateObject(obj) {
    if (!obj.threeObject) return;
    const cloneMesh = obj.threeObject.clone();
    cloneMesh.position.x += 1;
    const newObj = { id: generateId(), name: `${obj.name} (копия)`, type: obj.type, parentId: obj.parentId, childrenIds: [], threeObject: cloneMesh, userData: { ...obj.userData } };
    addObject(newObj);
    selectObject(newObj);
}

function renameObject(obj) {
    const newName = prompt('Новое имя', obj.name);
    if (newName) { obj.name = newName; if (obj.type === 'npc') obj.userData.name = newName; renderExplorer(); updatePropertiesPanel(); }
}

function addDefaultBlock() {
    const color = parseInt(currentColor.slice(1),16);
    const mesh = createBlockMesh(currentShape, { x:0.9, y:0.9, z:0.9 }, color, currentOpacity, 'block');
    mesh.position.set(0,1,0);
    const obj = { id: generateId(), name: `Блок (${currentShape})`, type: 'block', parentId: 'workspace', childrenIds: [], threeObject: mesh, userData: { type: 'block', shape: currentShape, color: currentColor, opacity: currentOpacity, anchor: false, collision: true } };
    addObject(obj);
    selectObject(obj);
}

function groupSelected() {
    if (selectedObjects.length < 2) return;
    const groupId = generateId();
    const groupObj = { id: groupId, name: 'Группа', type: 'group', parentId: 'workspace', childrenIds: [], threeObject: new THREE.Group() };
    selectedObjects.forEach(obj => {
        const idx = editorObjects.findIndex(o => o.id === obj.id);
        if (idx !== -1) { editorObjects[idx].parentId = groupId; groupObj.childrenIds.push(obj.id); groupObj.threeObject.add(obj.threeObject); }
    });
    addObject(groupObj);
    clearSelection();
    selectObject(groupObj);
}

function selectObject(obj, addToSelection = false) {
    if (!obj) return;
    if (!addToSelection) clearSelection();
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        if (obj.threeObject && !obj.userData.originalMaterial && obj.threeObject.material) {
            obj.userData.originalMaterial = obj.threeObject.material;
            let newMat = obj.threeObject.material.clone();
            newMat.emissive = new THREE.Color(0x444444);
            obj.threeObject.material = newMat;
        }
        if (selectedObjects.length === 1) transformControls.attach(obj.threeObject);
    }
    updatePropertiesPanel();
    updateSelectedInExplorer();
}

function clearSelection() {
    selectedObjects.forEach(obj => {
        if (obj.userData.originalMaterial && obj.threeObject.material) {
            obj.threeObject.material = obj.userData.originalMaterial;
            delete obj.userData.originalMaterial;
        }
    });
    selectedObjects = [];
    if (transformControls.object) transformControls.detach();
    updatePropertiesPanel();
    updateSelectedInExplorer();
}

function updateSelectedInExplorer() {
    document.querySelectorAll('.explorer-item').forEach(el => {
        el.classList.remove('selected');
        if (selectedObjects.some(obj => obj.id === el.dataset.id)) el.classList.add('selected');
    });
}

function renderExplorer() {
    const container = document.getElementById('explorerTree');
    if (!container) return;
    const roots = editorObjects.filter(obj => !obj.parentId);
    container.innerHTML = '';
    roots.forEach(obj => renderExplorerItem(obj, container));
}

function renderExplorerItem(obj, parentElement) {
    const div = document.createElement('div');
    div.className = 'explorer-item';
    div.dataset.id = obj.id;
    if (selectedObjects.includes(obj)) div.classList.add('selected');
    let icon = obj.icon || (obj.type === 'folder' ? '📁' : obj.type === 'npc' ? '👤' : obj.type === 'particle' ? '✨' : '🧱');
    div.innerHTML = `<span class="icon">${icon}</span><span class="name">${escapeHtml(obj.name)}</span><span class="controls"><button class="renameBtn">✎</button><button class="deleteBtn">🗑</button><button class="duplicateBtn">📋</button></span>`;
    if (obj.childrenIds && obj.childrenIds.length) {
        let childrenContainer = document.createElement('div');
        childrenContainer.className = 'explorer-children';
        obj.childrenIds.forEach(childId => {
            let child = editorObjects.find(o => o.id === childId);
            if (child) renderExplorerItem(child, childrenContainer);
        });
        div.appendChild(childrenContainer);
    }
    parentElement.appendChild(div);
    div.addEventListener('click', (e) => { e.stopPropagation(); selectObject(obj, e.ctrlKey); });
    div.querySelector('.renameBtn')?.addEventListener('click', (e) => { e.stopPropagation(); renameObject(obj); });
    div.querySelector('.deleteBtn')?.addEventListener('click', (e) => { e.stopPropagation(); deleteObject(obj); });
    div.querySelector('.duplicateBtn')?.addEventListener('click', (e) => { e.stopPropagation(); duplicateObject(obj); });
}

function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

function updatePropertiesPanel() {
    const container = document.getElementById('propertiesContent');
    if (!container) return;
    if (selectedObjects.length === 0) { container.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>'; return; }
    const obj = selectedObjects[0];
    if (obj.type === 'particle') {
        const cfg = obj.userData.config;
        container.innerHTML = `<div class="prop-group"><label>Имя</label><input id="propName" value="${escapeHtml(obj.name)}"></div><div class="prop-group"><label>Количество</label><input id="propCount" type="number" value="${cfg.count}"></div><div class="prop-group"><label>Цвет</label><input id="propColor" type="color" value="${'#'+cfg.color.toString(16).padStart(6,'0')}"></div><div class="prop-group"><label>Размер</label><input id="propSize" type="number" step="0.05" value="${cfg.size}"></div><div class="prop-group"><label>Скорость Y</label><input id="propSpeedY" type="number" step="0.5" value="${cfg.speedY}"></div><div class="prop-group"><label>Разброс</label><input id="propSpread" type="number" step="0.5" value="${cfg.spread}"></div><div class="prop-group"><label>Время жизни</label><input id="propLifetime" type="number" step="0.5" value="${cfg.lifetime}"></div><button id="applyParticleBtn">Применить</button>`;
        document.getElementById('propName')?.addEventListener('change', e => { obj.name = e.target.value; renderExplorer(); });
        document.getElementById('applyParticleBtn')?.addEventListener('click', () => {
            let newCfg = { count: parseInt(document.getElementById('propCount').value), color: parseInt(document.getElementById('propColor').value.slice(1),16), size: parseFloat(document.getElementById('propSize').value), speedY: parseFloat(document.getElementById('propSpeedY').value), spread: parseFloat(document.getElementById('propSpread').value), lifetime: parseFloat(document.getElementById('propLifetime').value) };
            let newPs = createParticleSystem(newCfg);
            editorScene.remove(obj.threeObject);
            obj.threeObject = newPs;
            obj.userData.config = newCfg;
            editorScene.add(newPs);
            if (selectedObjects.includes(obj)) transformControls.detach();
            selectObject(obj);
            renderExplorer();
        });
        return;
    }
    container.innerHTML = `
        <div class="prop-group"><label>Имя</label><input id="propName" value="${escapeHtml(obj.name)}"></div>
        <div class="prop-group"><label>Позиция X</label><input id="propPosX" type="number" step="0.1" value="${obj.threeObject.position.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Y</label><input id="propPosY" type="number" step="0.1" value="${obj.threeObject.position.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Z</label><input id="propPosZ" type="number" step="0.1" value="${obj.threeObject.position.z.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб X</label><input id="propScaleX" type="number" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Y</label><input id="propScaleY" type="number" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Z</label><input id="propScaleZ" type="number" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.z.toFixed(2)}"></div>
        ${obj.type === 'block' ? `<div class="prop-group"><label>Цвет</label><input id="propColor" type="color" value="${obj.userData.color}"></div><div class="prop-group"><label>Прозрачность</label><input id="propOpacity" type="range" min="0" max="1" step="0.01" value="${obj.userData.opacity}"></div><div class="prop-group"><label>Anchor</label><input id="propAnchor" type="checkbox" ${obj.userData.anchor ? 'checked' : ''}></div><div class="prop-group"><label>Collision</label><input id="propCollision" type="checkbox" ${obj.userData.collision ? 'checked' : ''}></div>` : ''}
        <button id="applyPropsBtn">Применить</button>
    `;
    document.getElementById('propName')?.addEventListener('change', e => { obj.name = e.target.value; renderExplorer(); });
    document.getElementById('propPosX')?.addEventListener('change', applyProps);
    document.getElementById('propPosY')?.addEventListener('change', applyProps);
    document.getElementById('propPosZ')?.addEventListener('change', applyProps);
    document.getElementById('propScaleX')?.addEventListener('change', applyProps);
    document.getElementById('propScaleY')?.addEventListener('change', applyProps);
    document.getElementById('propScaleZ')?.addEventListener('change', applyProps);
    if (obj.type === 'block') {
        document.getElementById('propColor')?.addEventListener('change', e => { obj.userData.color = e.target.value; obj.threeObject.material.color.set(e.target.value); });
        document.getElementById('propOpacity')?.addEventListener('input', e => { let val = parseFloat(e.target.value); obj.userData.opacity = val; obj.threeObject.material.transparent = val < 1; obj.threeObject.material.opacity = val; });
        document.getElementById('propAnchor')?.addEventListener('change', e => { obj.userData.anchor = e.target.checked; });
        document.getElementById('propCollision')?.addEventListener('change', e => { obj.userData.collision = e.target.checked; });
    }
    document.getElementById('applyPropsBtn')?.addEventListener('click', applyProps);
}

function applyProps() {
    if (selectedObjects.length === 0) return;
    const obj = selectedObjects[0];
    if (!obj.threeObject) return;
    obj.threeObject.position.set(parseFloat(document.getElementById('propPosX').value), parseFloat(document.getElementById('propPosY').value), parseFloat(document.getElementById('propPosZ').value));
    obj.threeObject.scale.set(parseFloat(document.getElementById('propScaleX').value), parseFloat(document.getElementById('propScaleY').value), parseFloat(document.getElementById('propScaleZ').value));
    renderExplorer();
}

async function saveGameLocal() {
    if (!window.currentUser) { alert('Не авторизован'); return; }
    const gameName = prompt('Название игры');
    if (!gameName) return;
    const gameData = { blocks: editorObjects.filter(o => !systemFolders.some(f => f.id === o.id)).map(obj => serializeObject(obj)), animations, gui: guiElements };
    const result = await API.saveGame(gameName, window.currentUser.username, gameData);
    if (result.id) alert('Сохранено');
    else alert('Ошибка');
}

function serializeObject(obj) {
    if (!obj.threeObject) return null;
    return {
        type: obj.type, id: obj.id, name: obj.name,
        position: { x: obj.threeObject.position.x, y: obj.threeObject.position.y, z: obj.threeObject.position.z },
        rotation: { x: obj.threeObject.rotation.x, y: obj.threeObject.rotation.y, z: obj.threeObject.rotation.z },
        scale: { x: obj.threeObject.scale.x, y: obj.threeObject.scale.y, z: obj.threeObject.scale.z },
        userData: obj.userData
    };
}

function deserializeObject(data) {
    const mesh = createBlockMesh(data.userData.shape || 'cube', data.scale, data.userData.color, data.userData.opacity, 'block');
    mesh.position.copy(data.position);
    mesh.rotation.copy(data.rotation);
    mesh.scale.copy(data.scale);
    mesh.userData = data.userData;
    return { id: data.id, name: data.name, type: data.type, parentId: 'workspace', childrenIds: [], threeObject: mesh, userData: data.userData };
}

function loadGameIntoEditor(gameData) {
    clearEditor();
    if (gameData.blocks) gameData.blocks.forEach(blockData => { let obj = deserializeObject(blockData); if (obj) addObject(obj); });
    if (gameData.animations) animations = gameData.animations;
    if (gameData.gui) guiElements = gameData.gui;
    selectObject(null);
}

function clearEditor() {
    const nonSystem = editorObjects.filter(o => !systemFolders.some(f => f.id === o.id));
    nonSystem.forEach(obj => { if (obj.threeObject) editorScene.remove(obj.threeObject); });
    editorObjects = editorObjects.filter(o => systemFolders.some(f => f.id === o.id));
    selectedObjects = [];
    animations = [];
    guiElements = [];
    npcs = [];
    if (transformControls.object) transformControls.detach();
    renderExplorer();
    updatePropertiesPanel();
    renderNpcList();
    renderGUIList();
}

function createSystemFolders() {
    for (let folder of systemFolders) {
        if (!editorObjects.find(o => o.id === folder.id)) {
            editorObjects.push({ id: folder.id, name: folder.name, type: 'folder', icon: folder.icon, parentId: null, childrenIds: [], threeObject: null });
        }
    }
}

function initEditor() {
    if (editorActive) return;
    const container = document.getElementById('editorCanvasContainer');
    container.innerHTML = '';
    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x111122);
    editorScene.fog = new THREE.FogExp2(0x111122, 0.008);
    editorCamera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000);
    editorCamera.position.set(15, 12, 15);
    editorRenderer = new THREE.WebGLRenderer({ antialias: true });
    editorRenderer.setSize(container.clientWidth, container.clientHeight);
    editorRenderer.shadowMap.enabled = true;
    container.appendChild(editorRenderer.domElement);
    editorControls = new OrbitControls(editorCamera, editorRenderer.domElement);
    editorControls.enableDamping = true;
    transformControls = new TransformControls(editorCamera, editorRenderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => { editorControls.enabled = !event.value; });
    transformControls.addEventListener('objectChange', () => { if (selectedObjects.length) updatePropertiesPanel(); });
    editorScene.add(transformControls);

    const ambient = new THREE.AmbientLight(0x404060);
    editorScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff5d1, 1.2);
    dirLight.position.set(5,10,7);
    dirLight.castShadow = true;
    editorScene.add(dirLight);
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2,3,4);
    editorScene.add(fillLight);
    const gridHelper = new THREE.GridHelper(50, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);

    createSystemFolders();
    loadTemplate('empty');

    document.getElementById('modeMoveBtn').onclick = () => { transformControls.setMode('translate'); currentTransformMode='translate'; document.getElementById('modeMoveBtn').classList.add('active'); document.getElementById('modeRotateBtn').classList.remove('active'); document.getElementById('modeScaleBtn').classList.remove('active'); };
    document.getElementById('modeRotateBtn').onclick = () => { transformControls.setMode('rotate'); currentTransformMode='rotate'; document.getElementById('modeRotateBtn').classList.add('active'); document.getElementById('modeMoveBtn').classList.remove('active'); document.getElementById('modeScaleBtn').classList.remove('active'); };
    document.getElementById('modeScaleBtn').onclick = () => { transformControls.setMode('scale'); currentTransformMode='scale'; document.getElementById('modeScaleBtn').classList.add('active'); document.getElementById('modeMoveBtn').classList.remove('active'); document.getElementById('modeRotateBtn').classList.remove('active'); };
    document.getElementById('addCubeBtn').onclick = addDefaultBlock;
    document.getElementById('deleteBtn').onclick = () => { if (selectedObjects.length) deleteObject(selectedObjects[0]); else alert('Выберите объект'); };
    document.getElementById('duplicateBtn').onclick = () => { if (selectedObjects.length) duplicateObject(selectedObjects[0]); else alert('Выберите объект'); };
    document.getElementById('groupBtn').onclick = groupSelected;
    document.getElementById('saveGameBtn').onclick = saveGameLocal;
    document.getElementById('exitEditorBtn').onclick = () => {
        document.getElementById('editorScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        if (editorActive) { editorActive = false; cancelAnimationFrame(editorAnimationId); }
    };

    document.querySelectorAll('.block-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.block-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const type = opt.dataset.type;
            if (type === 'wood') currentColor = '#8B5A2B';
            else if (type === 'stone') currentColor = '#808080';
            else if (type === 'concrete') currentColor = '#B0B0B0';
            else if (type === 'dirt') currentColor = '#6B4C3B';
            document.getElementById('blockColorPicker').value = currentColor;
        });
    });
    document.querySelector('.block-option').classList.add('selected');
    document.getElementById('blockColorPicker')?.addEventListener('change', e => { currentColor = e.target.value; });

    document.getElementById('addParticleBtn')?.addEventListener('click', () => addParticleSystem({ name:'Новая система', count:100, color:0xffaa44, size:0.2, speedY:2, spread:1, lifetime:1 }));
    document.getElementById('vfxFireBtn')?.addEventListener('click', () => addParticlePreset('fire'));
    document.getElementById('vfxWaterBtn')?.addEventListener('click', () => addParticlePreset('water'));
    document.getElementById('vfxAirBtn')?.addEventListener('click', () => addParticlePreset('air'));
    document.getElementById('vfxSmokeBtn')?.addEventListener('click', () => addParticlePreset('smoke'));

    document.getElementById('newAnimationBtn')?.addEventListener('click', () => { let name = prompt('Название анимации', 'Анимация '+(animations.length+1)); if (name) createAnimation(name); });
    document.getElementById('recordAnimationBtn')?.addEventListener('click', () => { if (!selectedObjects.length) { alert('Выберите объект'); return; } recording = true; recordTarget = selectedObjects[0]; recordedKeyframes = []; recordStartTime = performance.now()/1000; alert('Запись начата'); });
    document.getElementById('playAnimationBtn')?.addEventListener('click', () => { let select = document.getElementById('animationSelect'); let animId = select.value; if (!animId) { alert('Выберите анимацию'); return; } playAnimation(animId); });
    document.getElementById('stopAnimationBtn')?.addEventListener('click', () => { if (recording) { recording = false; if (recordTarget && recordedKeyframes.length) { let animName = prompt('Название анимации', 'Запись '+new Date().toLocaleTimeString()); if (animName) { let newAnim = createAnimation(animName); let framesByProp = {}; recordedKeyframes.forEach(kf => { if (!framesByProp[kf.property]) framesByProp[kf.property] = []; framesByProp[kf.property].push({ time: kf.time, value: kf.value }); }); for (let prop in framesByProp) { newAnim.tracks.push({ targetId: recordTarget.id, property: prop, keyframes: framesByProp[prop] }); } updateAnimationSelect(); } } recordedKeyframes = []; recordTarget = null; } else { stopAnimation(); } });
    transformControls.addEventListener('objectChange', () => { if (recording && recordTarget && transformControls.object === recordTarget.threeObject) { let pos = recordTarget.threeObject.position.clone(); let rot = recordTarget.threeObject.rotation.clone(); let scale = recordTarget.threeObject.scale.clone(); recordProperty('position', pos); recordProperty('rotation', rot); recordProperty('scale', scale); } });
    function recordProperty(property, value) { if (!recording || !recordTarget) return; let time = performance.now()/1000 - recordStartTime; recordedKeyframes.push({ time, property, value: value.clone ? value.clone() : value }); }
    initTimeline();

    document.getElementById('addButtonBtn')?.addEventListener('click', () => addGUIElement('button', { name:'Кнопка', text:'Кнопка', x:100, y:100, width:120, height:40, action:'alert("Hello")' }));
    document.getElementById('addPanelBtn')?.addEventListener('click', () => addGUIElement('panel', { name:'Панель', text:'Панель', x:100, y:200, width:200, height:150 }));
    document.getElementById('addTextBtn')?.addEventListener('click', () => addGUIElement('text', { name:'Текст', text:'Привет!', x:100, y:300, width:200, height:30, fontSize:14 }));

    document.getElementById('createNpcBtn')?.addEventListener('click', () => createNPC());
    document.getElementById('importModelBtn')?.addEventListener('click', () => alert('Импорт GLTF в разработке'));
    document.getElementById('saveNpcBtn')?.addEventListener('click', saveNPCProperties);

    document.getElementById('skyColor')?.addEventListener('change', (e) => { editorScene.background = new THREE.Color(e.target.value); });
    document.getElementById('sunIntensity')?.addEventListener('change', (e) => { dirLight.intensity = parseFloat(e.target.value); });
    document.getElementById('animateSkyBtn')?.addEventListener('click', () => { let t=0; setInterval(() => { t = (t+0.02)%1; editorScene.background = new THREE.Color().setHSL(0.6 + t*0.2, 0.8, 0.5); }, 100); });

    const tabs = document.querySelectorAll('.tab');
    const subpanels = {
        blocks: document.getElementById('subpanelBlocks'),
        vfx: document.getElementById('subpanelVfx'),
        animations: document.getElementById('subpanelAnimations'),
        scripts: document.getElementById('subpanelScripts'),
        gui: document.getElementById('subpanelGui'),
        npc: document.getElementById('subpanelNpc'),
        lighting: document.getElementById('subpanelLighting')
    };
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            Object.values(subpanels).forEach(p => p.classList.remove('active'));
            if (subpanels[tabId]) subpanels[tabId].classList.add('active');
        });
    });

    document.getElementById('applyScriptBtn')?.addEventListener('click', () => { if (!selectedObjects.length) { alert('Выберите объект'); return; } let script = document.getElementById('blockScriptEditor').value; selectedObjects[0].userData.script = script; alert('Скрипт сохранён'); });

    function animateEditor() { if (!editorActive) return; editorAnimationId = requestAnimationFrame(animateEditor); editorControls.update(); editorRenderer.render(editorScene, editorCamera); }
    editorActive = true; animateEditor();
    window.addEventListener('resize', () => { editorCamera.aspect = container.clientWidth / container.clientHeight; editorCamera.updateProjectionMatrix(); editorRenderer.setSize(container.clientWidth, container.clientHeight); });
}

export function openEditor() {
    document.getElementById('mainMenuScreen').classList.add('hidden');
    const templateScreen = document.getElementById('templateScreen');
    templateScreen.classList.remove('hidden');
    const templates = document.querySelectorAll('.template-card');
    templates.forEach(card => {
        card.onclick = () => {
            const template = card.dataset.template;
            templateScreen.classList.add('hidden');
            document.getElementById('editorScreen').classList.remove('hidden');
            initEditor();
            loadTemplate(template);
        };
    });
    document.getElementById('cancelTemplateBtn').onclick = () => {
        templateScreen.classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
    };
                                                       }
