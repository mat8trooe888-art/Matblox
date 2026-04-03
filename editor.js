import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
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

let folders = ['Workspace', 'Lighting', 'ServerStorage', 'StarterGui'];

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
let currentGameId = null; // ID редактируемой игры

function generateId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

function createBlockMesh(shape, size = { x: 0.9, y: 0.9, z: 0.9 }, color = 0x8B5A2B, opacity = 1) {
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
    mesh.userData = { shape, color: '#' + (typeof color === 'number' ? color.toString(16).padStart(6,'0') : color.slice(1)), opacity, collision: true };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function loadTemplate(templateType) {
    clearEditor();
    if (templateType === 'platformer') {
        const ground = createBlockMesh('cube', { x: 30, y: 1, z: 30 }, 0x6B8E23, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Ground', type: 'block', parentId: 'Workspace', threeObject: ground, userData: { collision: true } });
        for (let i = -3; i <= 3; i++) {
            const plat = createBlockMesh('cube', { x: 2, y: 0.5, z: 2 }, 0xaa8866, 1);
            plat.position.set(i * 2.5, 0.5 + Math.abs(i) * 0.5, 0);
            addObject({ id: generateId(), name: `Platform_${i}`, type: 'block', parentId: 'Workspace', threeObject: plat, userData: { collision: true } });
        }
        const spawn = createBlockMesh('cube', { x: 1, y: 0.5, z: 1 }, 0xff3333, 1);
        spawn.position.set(0, 0.5, 0);
        addObject({ id: generateId(), name: 'Spawn', type: 'block', parentId: 'Workspace', threeObject: spawn, userData: { collision: true } });
    } else if (templateType === 'racing') {
        const ground = createBlockMesh('cube', { x: 50, y: 1, z: 50 }, 0x555555, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Track', type: 'block', parentId: 'Workspace', threeObject: ground, userData: { collision: true } });
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const road = createBlockMesh('cube', { x: 2, y: 0.2, z: 2 }, 0xaaaaaa, 1);
            road.position.set(Math.cos(angle) * 12, -0.3, Math.sin(angle) * 12);
            addObject({ id: generateId(), name: `Road_${i}`, type: 'block', parentId: 'Workspace', threeObject: road, userData: { collision: true } });
        }
    } else if (templateType === 'rpg') {
        const ground = createBlockMesh('cube', { x: 40, y: 1, z: 40 }, 0x4a7a4a, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Grass', type: 'block', parentId: 'Workspace', threeObject: ground, userData: { collision: true } });
        const house = createBlockMesh('cube', { x: 3, y: 2, z: 3 }, 0xaa8866, 1);
        house.position.set(6, 0, 6);
        addObject({ id: generateId(), name: 'House', type: 'block', parentId: 'Workspace', threeObject: house, userData: { collision: true } });
        const tree = createBlockMesh('cylinder', { x: 1, y: 2, z: 1 }, 0x8B5A2B, 1);
        tree.position.set(-5, 0, -5);
        addObject({ id: generateId(), name: 'Tree', type: 'block', parentId: 'Workspace', threeObject: tree, userData: { collision: true } });
        const spawn = createBlockMesh('cube', { x: 1, y: 0.5, z: 1 }, 0xff3333, 1);
        spawn.position.set(0, 0.5, 0);
        addObject({ id: generateId(), name: 'Spawn', type: 'block', parentId: 'Workspace', threeObject: spawn, userData: { collision: true } });
    }
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
        if (idx !== -1) editorObjects.splice(idx, 1);
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
    const color = parseInt(currentColor.slice(1), 16);
    const mesh = createBlockMesh(currentShape, { x: 0.9, y: 0.9, z: 0.9 }, color, currentOpacity);
    mesh.position.set(0, 1, 0);
    const obj = { id: generateId(), name: `Block_${currentShape}`, type: 'block', parentId: 'Workspace', childrenIds: [], threeObject: mesh, userData: { shape: currentShape, color: currentColor, opacity: currentOpacity, collision: true } };
    addObject(obj);
    selectObject(obj);
}

function groupSelected() {
    if (selectedObjects.length < 2) return;
    const groupId = generateId();
    const groupObj = { id: groupId, name: 'Group', type: 'group', parentId: 'Workspace', childrenIds: [], threeObject: new THREE.Group() };
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
    let icon = obj.type === 'folder' ? '📁' : obj.type === 'npc' ? '👤' : obj.type === 'group' ? '📦' : '🧱';
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
    if (obj.type === 'npc') {
        container.innerHTML = `
            <div class="prop-group"><label>Имя</label><input id="propName" value="${escapeHtml(obj.name)}"></div>
            <div class="prop-group"><label>Поведение</label><select id="propBehavior"><option value="idle">Стоять</option><option value="patrol">Патруль</option><option value="follow">Следовать</option></select></div>
            <div class="prop-group"><label>Скорость</label><input id="propSpeed" type="number" value="${obj.userData.speed || 2}" step="0.5"></div>
            <div class="prop-group"><label>Диалог</label><textarea id="propDialog" rows="2">${obj.userData.dialog || ''}</textarea></div>
            <button id="applyNpcBtn">Применить</button>
        `;
        document.getElementById('propBehavior').value = obj.userData.behavior || 'idle';
        document.getElementById('applyNpcBtn')?.addEventListener('click', () => {
            obj.userData.behavior = document.getElementById('propBehavior').value;
            obj.userData.speed = parseFloat(document.getElementById('propSpeed').value);
            obj.userData.dialog = document.getElementById('propDialog').value;
            if (obj.type === 'npc') { obj.userData.name = document.getElementById('propName').value; obj.name = obj.userData.name; renderNpcList(); }
            renderExplorer();
        });
        document.getElementById('propName')?.addEventListener('change', e => { obj.name = e.target.value; if (obj.type === 'npc') obj.userData.name = e.target.value; renderExplorer(); });
        return;
    }
    if (!obj.threeObject) return;
    container.innerHTML = `
        <div class="prop-group"><label>Имя</label><input id="propName" value="${escapeHtml(obj.name)}"></div>
        <div class="prop-group"><label>Позиция X</label><input id="propPosX" type="number" step="0.1" value="${obj.threeObject.position.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Y</label><input id="propPosY" type="number" step="0.1" value="${obj.threeObject.position.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Z</label><input id="propPosZ" type="number" step="0.1" value="${obj.threeObject.position.z.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб X</label><input id="propScaleX" type="number" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Y</label><input id="propScaleY" type="number" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Z</label><input id="propScaleZ" type="number" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.z.toFixed(2)}"></div>
        ${obj.type === 'block' ? `<div class="prop-group"><label>Цвет</label><input id="propColor" type="color" value="${obj.userData.color}"></div><div class="prop-group"><label>Collision</label><input id="propCollision" type="checkbox" ${obj.userData.collision ? 'checked' : ''}></div>` : ''}
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

function createNPC(name = "NPC") {
    const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const material = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.6;
    mesh.userData = { name, behavior: 'idle', speed: 2, dialog: '' };
    const obj = { id: generateId(), name, type: 'npc', parentId: 'Workspace', childrenIds: [], threeObject: mesh, userData: mesh.userData };
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
    const element = { id, type, name: properties.name, x: properties.x || 100, y: properties.y || 100, width: properties.width || 200, height: properties.height || 50, text: properties.text, color: properties.color || '#4a6e8a', fontSize: properties.fontSize || 14, action: properties.action || '' };
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
        div.style.cssText = 'background:#2c2f36; margin:4px 0; padding:4px 8px; border-radius:4px; display:flex; justify-content:space-between;';
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
        div.style.borderRadius = '4px';
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

function createParticleSystem(config) {
    const geometry = new THREE.BufferGeometry();
    const count = config.count || 100;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i*3] = 0; positions[i*3+1] = 0; positions[i*3+2] = 0;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: config.color || 0xffaa44, size: config.size || 0.2, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geometry, material);
    return points;
}

function addParticleSystem(config) {
    const ps = createParticleSystem(config);
    const obj = { id: generateId(), name: config.name, type: 'particle', parentId: 'Workspace', childrenIds: [], threeObject: ps, userData: { config } };
    addObject(obj);
    return obj;
}

function addParticlePreset(type) {
    const presets = {
        fire: { name:'Fire', count:200, color:0xff6600, size:0.15 },
        water: { name:'Water', count:150, color:0x3399ff, size:0.1 },
        air: { name:'Air', count:100, color:0xaaccff, size:0.2 },
        smoke: { name:'Smoke', count:80, color:0x888888, size:0.3 }
    };
    addParticleSystem(presets[type]);
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
    select.innerHTML = '<option value="">-- Анимация --</option>';
    animations.forEach(anim => { let opt = document.createElement('option'); opt.value = anim.id; opt.textContent = anim.name; select.appendChild(opt); });
}

// ========== СОХРАНЕНИЕ И ПУБЛИКАЦИЯ ==========
async function saveGame(isPublished = false) {
    if (!window.currentUser) { alert('Вы не авторизованы'); return; }
    
    const gameName = prompt('Название игры:', currentGameId ? 'Моя игра' : 'Новая игра');
    if (!gameName) return;
    
    const description = prompt('Описание игры (необязательно):', '');
    
    const gameData = {
        blocks: editorObjects.filter(obj => obj.type !== 'folder' && obj.threeObject).map(obj => serializeObject(obj)),
        animations: animations,
        gui: guiElements,
        npcs: npcs.map(npc => ({
            name: npc.userData.name,
            behavior: npc.userData.behavior,
            speed: npc.userData.speed,
            dialog: npc.userData.dialog,
            position: { x: npc.threeObject.position.x, y: npc.threeObject.position.y, z: npc.threeObject.position.z }
        }))
    };
    
    let result;
    if (currentGameId && !isPublished) {
        // Обновляем существующую игру
        result = await API.updateGame(currentGameId, gameName, description, gameData);
    } else {
        // Создаём новую игру
        result = await API.saveGame(gameName, window.currentUser.username, gameData, description);
        if (result.id) currentGameId = result.id;
    }
    
    if (result.success || result.id) {
        alert(isPublished ? 'Игра опубликована!' : 'Игра сохранена!');
        if (window.renderMyProjects) window.renderMyProjects();
        if (window.renderGamesList) window.renderGamesList();
    } else {
        alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
    }
}

function serializeObject(obj) {
    if (!obj.threeObject) return null;
    return {
        type: obj.type, id: obj.id, name: obj.name, parentId: obj.parentId,
        position: { x: obj.threeObject.position.x, y: obj.threeObject.position.y, z: obj.threeObject.position.z },
        rotation: { x: obj.threeObject.rotation.x, y: obj.threeObject.rotation.y, z: obj.threeObject.rotation.z },
        scale: { x: obj.threeObject.scale.x, y: obj.threeObject.scale.y, z: obj.threeObject.scale.z },
        userData: obj.userData
    };
}

function deserializeObject(data) {
    if (data.type === 'npc') {
        const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
        const material = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(data.position);
        mesh.rotation.copy(data.rotation);
        mesh.scale.copy(data.scale);
        mesh.userData = data.userData;
        return { id: data.id, name: data.name, type: 'npc', parentId: data.parentId, childrenIds: [], threeObject: mesh, userData: data.userData };
    }
    const mesh = createBlockMesh(data.userData.shape || 'cube', data.scale, data.userData.color, data.userData.opacity);
    mesh.position.copy(data.position);
    mesh.rotation.copy(data.rotation);
    mesh.scale.copy(data.scale);
    mesh.userData = data.userData;
    return { id: data.id, name: data.name, type: data.type || 'block', parentId: data.parentId, childrenIds: [], threeObject: mesh, userData: data.userData };
}

function loadGameIntoEditor(gameData) {
    clearEditor();
    if (gameData.blocks) {
        gameData.blocks.forEach(blockData => {
            if (blockData && blockData.type !== 'folder') {
                let obj = deserializeObject(blockData);
                if (obj) addObject(obj);
            }
        });
    }
    if (gameData.animations) animations = gameData.animations;
    if (gameData.gui) guiElements = gameData.gui;
    if (gameData.npcs) {
        gameData.npcs.forEach(npcData => {
            const npc = createNPC(npcData.name);
            npc.userData.behavior = npcData.behavior;
            npc.userData.speed = npcData.speed;
            npc.userData.dialog = npcData.dialog;
            npc.threeObject.position.copy(npcData.position);
        });
    }
    selectObject(null);
    updateAnimationSelect();
    renderGUIList();
    renderNpcList();
}

function clearEditor() {
    editorObjects.forEach(obj => { if (obj.threeObject) editorScene.remove(obj.threeObject); });
    editorObjects = [];
    selectedObjects = [];
    animations = [];
    guiElements = [];
    npcs = [];
    if (transformControls.object) transformControls.detach();
    // Создаём папки
    folders.forEach(f => {
        editorObjects.push({ id: f, name: f, type: 'folder', parentId: null, childrenIds: [], threeObject: null });
    });
    renderExplorer();
    updatePropertiesPanel();
    renderNpcList();
    renderGUIList();
}

function initEditor() {
    if (editorActive) return;
    const container = document.getElementById('editorCanvasContainer');
    container.innerHTML = '';
    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x1a1d24);
    editorScene.fog = new THREE.FogExp2(0x1a1d24, 0.008);
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
    const gridHelper = new THREE.GridHelper(100, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);

    clearEditor();

    document.getElementById('modeMoveBtn').onclick = () => { transformControls.setMode('translate'); document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active')); document.getElementById('modeMoveBtn').classList.add('active'); };
    document.getElementById('modeRotateBtn').onclick = () => { transformControls.setMode('rotate'); document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active')); document.getElementById('modeRotateBtn').classList.add('active'); };
    document.getElementById('modeScaleBtn').onclick = () => { transformControls.setMode('scale'); document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active')); document.getElementById('modeScaleBtn').classList.add('active'); };
    document.getElementById('addCubeBtn').onclick = addDefaultBlock;
    document.getElementById('deleteBtn').onclick = () => { if (selectedObjects.length) deleteObject(selectedObjects[0]); else alert('Выберите объект'); };
    document.getElementById('duplicateBtn').onclick = () => { if (selectedObjects.length) duplicateObject(selectedObjects[0]); else alert('Выберите объект'); };
    document.getElementById('groupBtn').onclick = groupSelected;
    document.getElementById('saveGameBtn').onclick = () => saveGame(false);
    document.getElementById('publishGameBtn').onclick = () => saveGame(true);
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
    document.getElementById('blockColorPicker').value = currentColor;

    document.getElementById('addParticleBtn').onclick = () => addParticleSystem({ name:'Particles', count:100, color:0xffaa44, size:0.2 });
    document.getElementById('vfxFireBtn').onclick = () => addParticlePreset('fire');
    document.getElementById('vfxWaterBtn').onclick = () => addParticlePreset('water');
    document.getElementById('vfxAirBtn').onclick = () => addParticlePreset('air');
    document.getElementById('vfxSmokeBtn').onclick = () => addParticlePreset('smoke');

    document.getElementById('newAnimationBtn').onclick = () => { let name = prompt('Название анимации'); if (name) createAnimation(name); };
    document.getElementById('recordAnimationBtn').onclick = () => { if (!selectedObjects.length) { alert('Выберите объект'); return; } recording = true; recordTarget = selectedObjects[0]; recordedKeyframes = []; recordStartTime = performance.now()/1000; alert('Запись начата'); };
    document.getElementById('playAnimationBtn').onclick = () => { let select = document.getElementById('animationSelect'); let animId = select.value; if (!animId) { alert('Выберите анимацию'); return; } playAnimation(animId); };
    document.getElementById('stopAnimationBtn').onclick = () => { if (recording) { recording = false; if (recordTarget && recordedKeyframes.length) { let animName = prompt('Название анимации', 'Animation'); if (animName) { let newAnim = createAnimation(animName); let framesByProp = {}; recordedKeyframes.forEach(kf => { if (!framesByProp[kf.property]) framesByProp[kf.property] = []; framesByProp[kf.property].push({ time: kf.time, value: kf.value }); }); for (let prop in framesByProp) { newAnim.tracks.push({ targetId: recordTarget.id, property: prop, keyframes: framesByProp[prop] }); } updateAnimationSelect(); } } recordedKeyframes = []; recordTarget = null; } else { stopAnimation(); } };
    transformControls.addEventListener('objectChange', () => { if (recording && recordTarget && transformControls.object === recordTarget.threeObject) { let pos = recordTarget.threeObject.position.clone(); let rot = recordTarget.threeObject.rotation.clone(); let scale = recordTarget.threeObject.scale.clone(); recordProperty('position', pos); recordProperty('rotation', rot); recordProperty('scale', scale); } });
    function recordProperty(property, value) { if (!recording || !recordTarget) return; let time = performance.now()/1000 - recordStartTime; recordedKeyframes.push({ time, property, value: value.clone ? value.clone() : value }); }
    initTimeline();

    document.getElementById('addButtonBtn').onclick = () => addGUIElement('button', { name:'Button', text:'Click', x:100, y:100, width:120, height:40, action:'alert("Hello")' });
    document.getElementById('addPanelBtn').onclick = () => addGUIElement('panel', { name:'Panel', text:'Panel', x:100, y:200, width:200, height:150 });
    document.getElementById('addTextBtn').onclick = () => addGUIElement('text', { name:'Text', text:'Hello', x:100, y:300, width:200, height:30, fontSize:14 });

    document.getElementById('createNpcBtn').onclick = () => createNPC();
    document.getElementById('saveNpcBtn').onclick = saveNPCProperties;
    document.getElementById('applyScriptBtn').onclick = () => { if (!selectedObjects.length) { alert('Выберите объект'); return; } let script = document.getElementById('blockScriptEditor').value; selectedObjects[0].userData.script = script; alert('Скрипт сохранён'); };

    const bottomTabs = document.querySelectorAll('.bottom-tab');
    const tabContents = {
        blocks: document.getElementById('blocksTab'),
        vfx: document.getElementById('vfxTab'),
        animations: document.getElementById('animationsTab'),
        scripts: document.getElementById('scriptsTab'),
        gui: document.getElementById('guiTab'),
        npc: document.getElementById('npcTab')
    };
    bottomTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            bottomTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            Object.values(tabContents).forEach(content => content.classList.add('hidden'));
            if (tabContents[tabId]) tabContents[tabId].classList.remove('hidden');
        });
    });

    function animateEditor() { if (!editorActive) return; editorAnimationId = requestAnimationFrame(animateEditor); editorControls.update(); editorRenderer.render(editorScene, editorCamera); }
    editorActive = true; animateEditor();
    window.addEventListener('resize', () => { editorCamera.aspect = container.clientWidth / container.clientHeight; editorCamera.updateProjectionMatrix(); editorRenderer.setSize(container.clientWidth, container.clientHeight); });
}

export function openEditor(gameToEdit = null) {
    currentGameId = gameToEdit?.id || null;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    const template = prompt('Выберите шаблон: empty, platformer, racing, rpg', 'empty');
    document.getElementById('editorScreen').classList.remove('hidden');
    initEditor();
    if (gameToEdit && gameToEdit.data) {
        loadGameIntoEditor(gameToEdit.data);
    } else if (template && template !== 'empty') {
        loadTemplate(template);
    }
    }
