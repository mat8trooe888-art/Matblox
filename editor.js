import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as API from './api.js';

// ========== ПЕРЕМЕННЫЕ РЕДАКТОРА ==========
let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorObjects = [];
let selectedObjects = [];
let currentTransformMode = 'translate';
let currentBlockType = 'wood';
let currentShape = 'cube';
let currentColor = '#8B5A2B';
let currentOpacity = 1;
let editorActive = false;
let editorAnimationId = null;
let gameBeingEdited = null;

// VFX
let particleSystems = [];

// Анимации
let animations = [];
let currentAnimation = null;
let isPlaying = false;
let animationStartTime = 0;
let animationRequestId = null;
let recording = false;
let recordedKeyframes = [];
let recordTarget = null;
let recordStartTime = 0;

// Таймлайн
let timelineCanvas, timelineCtx;
let currentAnimationTime = 0;
let isDraggingTimeline = false;
let currentAnimationDuration = 1;

// GUI
let guiElements = [];

// NPC
let npcList = [];
let selectedNpc = null;

// Скульптинг
let sculptMode = 'pull';
let sculptActive = false;
let sculptRadius = 0.5;
let sculptStrength = 0.2;
let sculptOriginalPositions = null;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
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
    mesh.userData = { type, shape, color: '#' + (typeof color === 'number' ? color.toString(16).padStart(6,'0') : color.slice(1)), opacity };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// ========== ЧАСТИЦЫ ==========
function createParticleSystem(config) {
    const geometry = new THREE.BufferGeometry();
    const count = config.count || 100;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        positions[i*3] = 0;
        positions[i*3+1] = 0;
        positions[i*3+2] = 0;
        velocities.push({
            x: (Math.random() - 0.5) * (config.spread || 1),
            y: Math.random() * (config.speedY || 2),
            z: (Math.random() - 0.5) * (config.spread || 1)
        });
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: config.color || 0xffaa44,
        size: config.size || 0.2,
        blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.userData = {
        type: 'particleSystem',
        config: config,
        velocities: velocities,
        lifetimes: new Array(count).fill(0).map(() => Math.random() * (config.lifetime || 1)),
        age: 0
    };
    return points;
}

function updateParticleSystem(ps, delta) {
    const cfg = ps.userData.config;
    const positions = ps.geometry.attributes.position.array;
    const velocities = ps.userData.velocities;
    const lifetimes = ps.userData.lifetimes;
    const count = positions.length / 3;
    let anyAlive = false;
    for (let i = 0; i < count; i++) {
        lifetimes[i] += delta;
        if (lifetimes[i] >= cfg.lifetime) {
            lifetimes[i] = 0;
            positions[i*3] = 0;
            positions[i*3+1] = 0;
            positions[i*3+2] = 0;
            velocities[i] = {
                x: (Math.random() - 0.5) * (cfg.spread || 1),
                y: Math.random() * (cfg.speedY || 2),
                z: (Math.random() - 0.5) * (cfg.spread || 1)
            };
        } else {
            anyAlive = true;
            positions[i*3] += velocities[i].x * delta;
            positions[i*3+1] += velocities[i].y * delta;
            positions[i*3+2] += velocities[i].z * delta;
        }
    }
    ps.geometry.attributes.position.needsUpdate = true;
    ps.userData.age += delta;
    return anyAlive;
}

function addParticleSystem(config) {
    const id = generateId();
    const ps = createParticleSystem(config);
    ps.userData.id = id;
    ps.userData.name = config.name || 'Система частиц';
    editorScene.add(ps);
    const obj = {
        id: id,
        name: ps.userData.name,
        type: 'particle',
        parentId: 'workspace',
        childrenIds: [],
        threeObject: ps,
        userData: { type: 'particle', config: config }
    };
    editorObjects.push(obj);
    renderExplorer();
    selectObject(obj);
    return obj;
}

function addParticleSystemPreset(type) {
    let config;
    switch(type) {
        case 'fire':
            config = {
                name: 'Огонь',
                count: 200,
                color: 0xff6600,
                size: 0.15,
                speedY: 3,
                spread: 0.8,
                lifetime: 0.8,
                texture: ''
            };
            break;
        case 'water':
            config = {
                name: 'Вода',
                count: 150,
                color: 0x3399ff,
                size: 0.1,
                speedY: 1.5,
                spread: 1.2,
                lifetime: 1.2,
                texture: ''
            };
            break;
        case 'air':
            config = {
                name: 'Воздух',
                count: 100,
                color: 0xaaccff,
                size: 0.2,
                speedY: 2,
                spread: 2,
                lifetime: 1.5,
                texture: ''
            };
            break;
        case 'smoke':
            config = {
                name: 'Дым',
                count: 80,
                color: 0x888888,
                size: 0.3,
                speedY: 1.2,
                spread: 1.5,
                lifetime: 2,
                texture: ''
            };
            break;
        default:
            return;
    }
    addParticleSystem(config);
}

// ========== АНИМАЦИИ (с таймлайном) ==========
function createAnimation(name) {
    const id = generateId();
    const anim = {
        id: id,
        name: name,
        duration: 1,
        tracks: []
    };
    animations.push(anim);
    updateAnimationSelect();
    return anim;
}

function addKeyframe(animationId, targetId, property, time, value) {
    const anim = animations.find(a => a.id === animationId);
    if (!anim) return;
    let track = anim.tracks.find(t => t.targetId === targetId && t.property === property);
    if (!track) {
        track = { targetId, property, keyframes: [] };
        anim.tracks.push(track);
    }
    track.keyframes.push({ time, value });
    track.keyframes.sort((a,b) => a.time - b.time);
    if (time > anim.duration) anim.duration = time;
    drawTimeline();
}

function getInterpolatedValue(keyframes, time) {
    if (keyframes.length === 0) return null;
    if (time <= keyframes[0].time) return keyframes[0].value;
    if (time >= keyframes[keyframes.length-1].time) return keyframes[keyframes.length-1].value;
    for (let i = 0; i < keyframes.length-1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i+1].time) {
            const t = (time - keyframes[i].time) / (keyframes[i+1].time - keyframes[i].time);
            if (typeof keyframes[i].value === 'number') {
                return keyframes[i].value + (keyframes[i+1].value - keyframes[i].value) * t;
            } else if (keyframes[i].value instanceof THREE.Vector3) {
                return keyframes[i].value.clone().lerp(keyframes[i+1].value, t);
            }
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
    timelineCtx.clearRect(0, 0, timelineCanvas.width, timelineCanvas.height);
    // Сетка
    timelineCtx.strokeStyle = '#666';
    for (let i = 0; i <= 10; i++) {
        const x = i * timelineCanvas.width / 10;
        timelineCtx.beginPath();
        timelineCtx.moveTo(x, 0);
        timelineCtx.lineTo(x, timelineCanvas.height);
        timelineCtx.stroke();
    }
    // Ключевые кадры
    if (currentAnimation) {
        for (let track of currentAnimation.tracks) {
            for (let kf of track.keyframes) {
                const x = (kf.time / currentAnimation.duration) * timelineCanvas.width;
                timelineCtx.fillStyle = '#ffaa44';
                timelineCtx.fillRect(x-2, 0, 4, timelineCanvas.height);
            }
        }
    }
    // Текущее время
    if (currentAnimation) {
        const currentX = (currentAnimationTime / currentAnimation.duration) * timelineCanvas.width;
        timelineCtx.fillStyle = '#ff5722';
        timelineCtx.fillRect(currentX-1, 0, 2, timelineCanvas.height);
    }
}

function initTimeline() {
    timelineCanvas = document.getElementById('timelineCanvas');
    timelineCtx = timelineCanvas.getContext('2d');
    timelineCanvas.addEventListener('mousedown', (e) => {
        const rect = timelineCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / timelineCanvas.width) * currentAnimationDuration;
        setAnimationTime(time);
        isDraggingTimeline = true;
    });
    window.addEventListener('mouseup', () => { isDraggingTimeline = false; });
    window.addEventListener('mousemove', (e) => {
        if (isDraggingTimeline && currentAnimation) {
            const rect = timelineCanvas.getBoundingClientRect();
            let x = e.clientX - rect.left;
            if (x < 0) x = 0;
            if (x > timelineCanvas.width) x = timelineCanvas.width;
            const time = (x / timelineCanvas.width) * currentAnimationDuration;
            setAnimationTime(time);
        }
    });
}

function updateAnimationSelect() {
    const select = document.getElementById('animationSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Выберите анимацию --</option>';
    animations.forEach(anim => {
        const option = document.createElement('option');
        option.value = anim.id;
        option.textContent = anim.name;
        select.appendChild(option);
    });
}

// ========== GUI ==========
function addGUIElement(type, properties) {
    const id = generateId();
    const element = {
        id: id,
        type: type,
        name: properties.name || `${type}_${guiElements.length+1}`,
        x: properties.x || 100,
        y: properties.y || 100,
        width: properties.width || 200,
        height: properties.height || 50,
        text: properties.text || (type === 'button' ? 'Кнопка' : type === 'panel' ? 'Панель' : 'Текст'),
        color: properties.color || '#4a6e8a',
        fontSize: properties.fontSize || 14,
        action: properties.action || ''
    };
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
        div.style.cssText = 'background:#2c2f36; margin:4px 0; padding:4px 8px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;';
        div.innerHTML = `
            <span>${el.type === 'button' ? '🔘' : el.type === 'panel' ? '📦' : '📝'} ${el.name}</span>
            <div>
                <button class="editGuiBtn" data-id="${el.id}" style="background:#ffaa44; border:none; border-radius:12px; padding:2px 8px; margin-right:4px;">✎</button>
                <button class="deleteGuiBtn" data-id="${el.id}" style="background:#ff3333; border:none; border-radius:12px; padding:2px 8px;">🗑</button>
            </div>
        `;
        container.appendChild(div);
    });
    document.querySelectorAll('.editGuiBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.dataset.id;
            const el = guiElements.find(g => g.id === id);
            if (el) editGUIElement(el);
        });
    });
    document.querySelectorAll('.deleteGuiBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.dataset.id;
            guiElements = guiElements.filter(g => g.id !== id);
            renderGUIList();
            updateGUIPreview();
        });
    });
    updateGUIPreview();
}

function editGUIElement(el) {
    const newName = prompt('Название', el.name);
    if (newName) el.name = newName;
    const newX = prompt('X позиция (px)', el.x);
    if (newX !== null) el.x = parseInt(newX);
    const newY = prompt('Y позиция (px)', el.y);
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
            div.addEventListener('click', () => {
                if (el.action) {
                    try {
                        new Function('game', 'player', 'world', el.action)(null, null, null);
                    } catch(e) { console.warn(e); }
                }
                alert(`Нажата кнопка: ${el.name}`);
            });
        }
        container.appendChild(div);
    });
}

// ========== NPC ==========
function createNPC(name = "NPC") {
    const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const material = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.6;
    mesh.userData = {
        type: 'npc',
        name: name,
        behavior: 'idle',
        speed: 2,
        dialog: '',
        model: null
    };
    const obj = {
        id: generateId(),
        name: name,
        type: 'npc',
        parentId: 'workspace',
        childrenIds: [],
        threeObject: mesh,
        userData: mesh.userData
    };
    addObject(obj);
    npcList.push(obj);
    renderNpcList();
    selectObject(obj);
    return obj;
}

function renderNpcList() {
    const container = document.getElementById('npcList');
    if (!container) return;
    container.innerHTML = '';
    npcList.forEach(npc => {
        const div = document.createElement('div');
        div.className = 'npc-item';
        div.style.background = '#2c2f36';
        div.style.padding = '4px 8px';
        div.style.margin = '2px 0';
        div.style.borderRadius = '4px';
        div.style.cursor = 'pointer';
        div.textContent = npc.userData.name;
        div.addEventListener('click', () => selectNPC(npc));
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

// ========== ИМПОРТ GLTF ==========
function importGLTFModel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gltf,.glb';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
            const model = gltf.scene;
            model.userData = { type: 'model', source: 'gltf' };
            const obj = {
                id: generateId(),
                name: file.name,
                type: 'model',
                parentId: 'workspace',
                childrenIds: [],
                threeObject: model,
                userData: { type: 'model', gltfData: gltf }
            };
            addObject(obj);
            selectObject(obj);
            URL.revokeObjectURL(url);
        }, undefined, (error) => {
            console.error('GLTF load error:', error);
            alert('Ошибка загрузки модели');
        });
    };
    input.click();
}

// ========== СКУЛЬПТИНГ ==========
function initSculpting() {
    document.getElementById('sculptBrushBtn').onclick = () => setSculptMode('pull');
    document.getElementById('sculptSmoothBtn').onclick = () => setSculptMode('smooth');
    document.getElementById('sculptFlattenBtn').onclick = () => setSculptMode('flatten');
    document.getElementById('sculptResetBtn').onclick = resetSculpt;
    const radiusSlider = document.getElementById('sculptRadius');
    const strengthSlider = document.getElementById('sculptStrength');
    radiusSlider.oninput = (e) => { sculptRadius = parseFloat(e.target.value); };
    strengthSlider.oninput = (e) => { sculptStrength = parseFloat(e.target.value); };
}

function setSculptMode(mode) {
    sculptMode = mode;
    document.querySelectorAll('#subpanelSculpt button').forEach(btn => btn.classList.remove('active'));
    if (mode === 'pull') document.getElementById('sculptBrushBtn').classList.add('active');
    if (mode === 'smooth') document.getElementById('sculptSmoothBtn').classList.add('active');
    if (mode === 'flatten') document.getElementById('sculptFlattenBtn').classList.add('active');
}

function applySculptToMesh(mesh, point, radius, strength, mode) {
    if (!mesh.geometry) return;
    const geometry = mesh.geometry;
    if (!geometry.attributes.position) return;
    const positions = geometry.attributes.position.array;
    const pointLocal = mesh.worldToLocal(point.clone());
    const radiusSq = radius * radius;
    for (let i = 0; i < positions.length; i += 3) {
        const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
        const dx = v.x - pointLocal.x;
        const dy = v.y - pointLocal.y;
        const dz = v.z - pointLocal.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        if (distSq < radiusSq) {
            const factor = (1 - Math.sqrt(distSq)/radius) * strength;
            if (mode === 'pull') {
                v.x += dx * factor;
                v.y += dy * factor;
                v.z += dz * factor;
            } else if (mode === 'flatten') {
                v.y = pointLocal.y; // упрощённая версия
            }
            positions[i] = v.x;
            positions[i+1] = v.y;
            positions[i+2] = v.z;
        }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
}

function resetSculpt() {
    if (!selectedObjects.length) return;
    const obj = selectedObjects[0];
    if (!obj.threeObject.geometry) return;
    // Восстановление исходных позиций вершин (не реализовано для простоты)
    alert("Сброс скульптинга пока не реализован");
}

// ========== ОБЩИЕ ФУНКЦИИ РЕДАКТОРА ==========
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
        if (obj.type === 'npc') {
            npcList = npcList.filter(n => n.id !== obj.id);
            renderNpcList();
        }
        renderExplorer();
        updatePropertiesPanel();
    }
}

function duplicateObject(obj) {
    if (obj.type === 'particle') {
        const newConfig = { ...obj.userData.config };
        newConfig.name = obj.name + ' (копия)';
        addParticleSystem(newConfig);
        return;
    }
    const cloneMesh = obj.threeObject.clone();
    cloneMesh.position.x += 1;
    const newId = generateId();
    const newObj = {
        id: newId,
        name: `${obj.name} (копия)`,
        type: obj.type,
        parentId: obj.parentId,
        childrenIds: [],
        threeObject: cloneMesh,
        userData: { ...obj.userData }
    };
    if (obj.parentId) {
        const parent = editorObjects.find(o => o.id === obj.parentId);
        if (parent) parent.childrenIds.push(newId);
    }
    addObject(newObj);
    selectObject(newObj);
}

function renameObject(obj) {
    const newName = prompt('Новое имя', obj.name);
    if (newName) {
        obj.name = newName;
        if (obj.type === 'particle') obj.threeObject.userData.name = newName;
        if (obj.type === 'npc') {
            obj.userData.name = newName;
            renderNpcList();
        }
        renderExplorer();
        updatePropertiesPanel();
    }
}

function addDefaultBlock() {
    const color = parseInt(currentColor.slice(1), 16);
    const mesh = createBlockMesh(currentShape, { x:0.9, y:0.9, z:0.9 }, color, currentOpacity, 'block');
    mesh.position.set(0, 1, 0);
    const obj = {
        id: generateId(),
        name: `Блок (${currentShape})`,
        type: 'block',
        parentId: 'workspace',
        childrenIds: [],
        threeObject: mesh,
        userData: { type: 'block', shape: currentShape, color: currentColor, opacity: currentOpacity }
    };
    addObject(obj);
    selectObject(obj);
}

function groupSelected() {
    if (selectedObjects.length < 2) return;
    const groupId = generateId();
    const groupObj = {
        id: groupId,
        name: 'Группа',
        type: 'group',
        parentId: 'workspace',
        childrenIds: [],
        threeObject: new THREE.Group()
    };
    selectedObjects.forEach(obj => {
        const idx = editorObjects.findIndex(o => o.id === obj.id);
        if (idx !== -1) {
            editorObjects[idx].parentId = groupId;
            groupObj.childrenIds.push(obj.id);
            groupObj.threeObject.add(obj.threeObject);
        }
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
        if (obj.threeObject) {
            if (!obj.userData.originalMaterial) {
                obj.userData.originalMaterial = obj.threeObject.material;
                if (obj.threeObject.material) {
                    const newMat = obj.threeObject.material.clone();
                    newMat.emissive = new THREE.Color(0x444444);
                    obj.threeObject.material = newMat;
                }
            }
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
        const id = el.dataset.id;
        if (selectedObjects.some(obj => obj.id === id)) {
            el.classList.add('selected');
        }
    });
}

function renderExplorer() {
    const container = document.getElementById('explorerTree');
    if (!container) return;
    // Создаём корневой элемент Workspace, если его нет
    let workspaceObj = editorObjects.find(obj => obj.id === 'workspace');
    if (!workspaceObj) {
        workspaceObj = {
            id: 'workspace',
            name: 'Workspace',
            type: 'folder',
            parentId: null,
            childrenIds: [],
            threeObject: null
        };
        editorObjects.unshift(workspaceObj);
    }
    const rootObjects = editorObjects.filter(obj => !obj.parentId || obj.parentId === null);
    container.innerHTML = '';
    rootObjects.forEach(obj => {
        renderExplorerItem(obj, container);
    });
}

function renderExplorerItem(obj, parentElement) {
    const div = document.createElement('div');
    div.className = 'explorer-item';
    div.dataset.id = obj.id;
    if (selectedObjects.includes(obj)) div.classList.add('selected');
    let icon = '📄';
    if (obj.type === 'group') icon = '📁';
    if (obj.type === 'particle') icon = '✨';
    if (obj.type === 'npc') icon = '👤';
    if (obj.type === 'model') icon = '📦';
    if (obj.id === 'workspace') icon = '🌐';
    div.innerHTML = `
        <span class="icon">${icon}</span>
        <span class="name">${escapeHtml(obj.name)}</span>
        <span class="controls">
            <button class="renameBtn" title="Переименовать">✎</button>
            <button class="deleteBtn" title="Удалить">🗑</button>
            <button class="duplicateBtn" title="Дублировать">📋</button>
        </span>
    `;
    if (obj.childrenIds && obj.childrenIds.length) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'explorer-children';
        obj.childrenIds.forEach(childId => {
            const child = editorObjects.find(o => o.id === childId);
            if (child) renderExplorerItem(child, childrenContainer);
        });
        div.appendChild(childrenContainer);
    }
    parentElement.appendChild(div);

    div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectObject(obj, e.ctrlKey);
    });
    div.querySelector('.renameBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        renameObject(obj);
    });
    div.querySelector('.deleteBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteObject(obj);
    });
    div.querySelector('.duplicateBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateObject(obj);
    });
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function updatePropertiesPanel() {
    const container = document.getElementById('propertiesContent');
    if (!container) return;
    if (selectedObjects.length === 0) {
        container.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>';
        return;
    }
    const obj = selectedObjects[0];
    if (obj.type === 'particle') {
        const cfg = obj.userData.config;
        container.innerHTML = `
            <div class="prop-group">
                <label>Имя</label>
                <input type="text" id="propName" value="${escapeHtml(obj.name)}">
            </div>
            <div class="prop-group">
                <label>Количество частиц</label>
                <input type="number" id="propCount" value="${cfg.count || 100}">
            </div>
            <div class="prop-group">
                <label>Цвет</label>
                <input type="color" id="propColor" value="${cfg.color ? '#'+cfg.color.toString(16).padStart(6,'0') : '#ffaa44'}">
            </div>
            <div class="prop-group">
                <label>Размер</label>
                <input type="number" id="propSize" step="0.05" value="${cfg.size || 0.2}">
            </div>
            <div class="prop-group">
                <label>Скорость Y</label>
                <input type="number" id="propSpeedY" step="0.5" value="${cfg.speedY || 2}">
            </div>
            <div class="prop-group">
                <label>Разброс</label>
                <input type="number" id="propSpread" step="0.5" value="${cfg.spread || 1}">
            </div>
            <div class="prop-group">
                <label>Время жизни (сек)</label>
                <input type="number" id="propLifetime" step="0.5" value="${cfg.lifetime || 1}">
            </div>
            <div class="prop-group">
                <label>Текстура (URL)</label>
                <input type="text" id="propTexture" value="${cfg.texture || ''}">
            </div>
            <button id="applyParticleBtn" style="background:#ff5722; border:none; border-radius:20px; padding:6px; color:white; margin-top:8px; width:100%;">Применить</button>
        `;
        document.getElementById('propName')?.addEventListener('change', (e) => { obj.name = e.target.value; renderExplorer(); });
        document.getElementById('applyParticleBtn')?.addEventListener('click', () => {
            const newCfg = {
                count: parseInt(document.getElementById('propCount').value),
                color: parseInt(document.getElementById('propColor').value.slice(1), 16),
                size: parseFloat(document.getElementById('propSize').value),
                speedY: parseFloat(document.getElementById('propSpeedY').value),
                spread: parseFloat(document.getElementById('propSpread').value),
                lifetime: parseFloat(document.getElementById('propLifetime').value),
                texture: document.getElementById('propTexture').value
            };
            const newPs = createParticleSystem(newCfg);
            newPs.userData.id = obj.id;
            newPs.userData.name = obj.name;
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
        <div class="prop-group">
            <label>Имя</label>
            <input type="text" id="propName" value="${escapeHtml(obj.name)}">
        </div>
        <div class="prop-group">
            <label>Позиция X</label>
            <input type="number" id="propPosX" step="0.1" value="${obj.threeObject.position.x.toFixed(2)}">
        </div>
        <div class="prop-group">
            <label>Позиция Y</label>
            <input type="number" id="propPosY" step="0.1" value="${obj.threeObject.position.y.toFixed(2)}">
        </div>
        <div class="prop-group">
            <label>Позиция Z</label>
            <input type="number" id="propPosZ" step="0.1" value="${obj.threeObject.position.z.toFixed(2)}">
        </div>
        <div class="prop-group">
            <label>Масштаб X</label>
            <input type="number" id="propScaleX" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.x.toFixed(2)}">
        </div>
        <div class="prop-group">
            <label>Масштаб Y</label>
            <input type="number" id="propScaleY" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.y.toFixed(2)}">
        </div>
        <div class="prop-group">
            <label>Масштаб Z</label>
            <input type="number" id="propScaleZ" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.z.toFixed(2)}">
        </div>
        ${obj.type === 'block' ? `
        <div class="prop-group">
            <label>Цвет</label>
            <input type="color" id="propColor" value="${obj.userData.color}">
        </div>
        <div class="prop-group">
            <label>Прозрачность</label>
            <input type="range" id="propOpacity" min="0" max="1" step="0.01" value="${obj.userData.opacity}">
        </div>
        ` : ''}
        ${obj.type === 'npc' ? `
        <div class="prop-group">
            <label>Поведение</label>
            <select id="npcBehaviorProp">
                <option value="idle">Стоять</option>
                <option value="patrol">Патрулировать</option>
                <option value="follow">Следовать</option>
            </select>
        </div>
        <div class="prop-group">
            <label>Скорость</label>
            <input type="number" id="npcSpeedProp" step="0.5" value="${obj.userData.speed}">
        </div>
        <div class="prop-group">
            <label>Диалог</label>
            <textarea id="npcDialogProp">${obj.userData.dialog || ''}</textarea>
        </div>
        ` : ''}
        <button id="applyPropsBtn" style="background:#ff5722; border:none; border-radius:20px; padding:6px; color:white; margin-top:8px; width:100%;">Применить</button>
    `;

    document.getElementById('propName')?.addEventListener('change', (e) => { obj.name = e.target.value; renderExplorer(); });
    document.getElementById('propPosX')?.addEventListener('change', applyProps);
    document.getElementById('propPosY')?.addEventListener('change', applyProps);
    document.getElementById('propPosZ')?.addEventListener('change', applyProps);
    document.getElementById('propScaleX')?.addEventListener('change', applyProps);
    document.getElementById('propScaleY')?.addEventListener('change', applyProps);
    document.getElementById('propScaleZ')?.addEventListener('change', applyProps);
    if (obj.type === 'block') {
        document.getElementById('propColor')?.addEventListener('change', (e) => {
            obj.userData.color = e.target.value;
            obj.threeObject.material.color.set(e.target.value);
        });
        document.getElementById('propOpacity')?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            obj.userData.opacity = val;
            obj.threeObject.material.transparent = val < 1;
            obj.threeObject.material.opacity = val;
        });
    }
    if (obj.type === 'npc') {
        document.getElementById('npcBehaviorProp')?.addEventListener('change', (e) => {
            obj.userData.behavior = e.target.value;
        });
        document.getElementById('npcSpeedProp')?.addEventListener('change', (e) => {
            obj.userData.speed = parseFloat(e.target.value);
        });
        document.getElementById('npcDialogProp')?.addEventListener('change', (e) => {
            obj.userData.dialog = e.target.value;
        });
    }
    document.getElementById('applyPropsBtn')?.addEventListener('click', applyProps);
}

function applyProps() {
    if (selectedObjects.length === 0) return;
    const obj = selectedObjects[0];
    obj.threeObject.position.set(
        parseFloat(document.getElementById('propPosX').value),
        parseFloat(document.getElementById('propPosY').value),
        parseFloat(document.getElementById('propPosZ').value)
    );
    obj.threeObject.scale.set(
        parseFloat(document.getElementById('propScaleX').value),
        parseFloat(document.getElementById('propScaleY').value),
        parseFloat(document.getElementById('propScaleZ').value)
    );
    renderExplorer();
}

// ========== СОХРАНЕНИЕ / ЗАГРУЗКА ==========
async function saveGameLocal() {
    const isElectron = typeof window.electronAPI !== 'undefined';
    if (isElectron) {
        const gameData = {
            blocks: editorObjects.filter(o => o.id !== 'workspace').map(obj => serializeObject(obj)),
            animations: animations,
            gui: guiElements
        };
        let defaultPath;
        if (window.currentProjectPath) {
            defaultPath = window.currentProjectPath;
        } else {
            const projectsPath = await window.electronAPI.getProjectsPath();
            const defaultName = `project_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.bvproj`;
            defaultPath = `${projectsPath}/${defaultName}`;
        }
        const savedPath = await window.electronAPI.saveProject(defaultPath, gameData);
        if (savedPath) {
            window.currentProjectPath = savedPath;
            alert('Проект сохранён на диск');
        }
        return;
    }
    // Старая логика сохранения в localStorage (для браузера)
    if (!window.currentUser) {
        alert('Вы не авторизованы для сохранения');
        return;
    }
    const gameName = prompt('Введите название игры для сохранения:');
    if (!gameName) return;
    const blocksData = editorObjects.filter(o => o.id !== 'workspace').map(obj => serializeObject(obj));
    const animationsData = animations.map(anim => ({
        id: anim.id,
        name: anim.name,
        duration: anim.duration,
        tracks: anim.tracks.map(track => ({
            targetId: track.targetId,
            property: track.property,
            keyframes: track.keyframes
        }))
    }));
    const guiData = guiElements;
    const gameData = { blocks: blocksData, animations: animationsData, gui: guiData };
    const result = await API.saveGame(gameName, window.currentUser.username, gameData);
    if (result.id) {
        alert('Игра сохранена');
        if (window.renderMyProjects) window.renderMyProjects();
    } else {
        alert('Ошибка сохранения');
    }
}

function serializeObject(obj) {
    if (obj.type === 'group') {
        return {
            type: 'group',
            id: obj.id,
            name: obj.name,
            children: obj.childrenIds.map(childId => {
                const child = editorObjects.find(o => o.id === childId);
                return child ? serializeObject(child) : null;
            }).filter(c => c),
            position: { x: obj.threeObject.position.x, y: obj.threeObject.position.y, z: obj.threeObject.position.z },
            rotation: { x: obj.threeObject.rotation.x, y: obj.threeObject.rotation.y, z: obj.threeObject.rotation.z },
            scale: { x: obj.threeObject.scale.x, y: obj.threeObject.scale.y, z: obj.threeObject.scale.z }
        };
    } else if (obj.type === 'particle') {
        return {
            type: 'particle',
            id: obj.id,
            name: obj.name,
            config: obj.userData.config
        };
    } else if (obj.type === 'npc') {
        return {
            type: 'npc',
            id: obj.id,
            name: obj.name,
            userData: obj.userData,
            position: { x: obj.threeObject.position.x, y: obj.threeObject.position.y, z: obj.threeObject.position.z },
            rotation: { x: obj.threeObject.rotation.x, y: obj.threeObject.rotation.y, z: obj.threeObject.rotation.z },
            scale: { x: obj.threeObject.scale.x, y: obj.threeObject.scale.y, z: obj.threeObject.scale.z }
        };
    } else if (obj.type === 'model') {
        return {
            type: 'model',
            id: obj.id,
            name: obj.name,
            position: { x: obj.threeObject.position.x, y: obj.threeObject.position.y, z: obj.threeObject.position.z },
            rotation: { x: obj.threeObject.rotation.x, y: obj.threeObject.rotation.y, z: obj.threeObject.rotation.z },
            scale: { x: obj.threeObject.scale.x, y: obj.threeObject.scale.y, z: obj.threeObject.scale.z },
            // Для GLTF нужно сохранить буфер? Не сохраняем, только ссылку на файл – это будет отдельно.
        };
    } else {
        return {
            type: 'block',
            id: obj.id,
            name: obj.name,
            shape: obj.userData.shape,
            color: obj.userData.color,
            opacity: obj.userData.opacity,
            position: { x: obj.threeObject.position.x, y: obj.threeObject.position.y, z: obj.threeObject.position.z },
            rotation: { x: obj.threeObject.rotation.x, y: obj.threeObject.rotation.y, z: obj.threeObject.rotation.z },
            scale: { x: obj.threeObject.scale.x, y: obj.threeObject.scale.y, z: obj.threeObject.scale.z }
        };
    }
}

function deserializeObject(data) {
    if (data.type === 'group') {
        const group = new THREE.Group();
        group.position.copy(data.position);
        group.rotation.copy(data.rotation);
        group.scale.copy(data.scale);
        const groupObj = {
            id: data.id,
            name: data.name,
            type: 'group',
            parentId: 'workspace',
            childrenIds: [],
            threeObject: group
        };
        data.children.forEach(childData => {
            const child = deserializeObject(childData);
            if (child) {
                child.parentId = groupObj.id;
                groupObj.childrenIds.push(child.id);
                group.add(child.threeObject);
                editorObjects.push(child);
            }
        });
        return groupObj;
    } else if (data.type === 'particle') {
        const ps = createParticleSystem(data.config);
        ps.userData.id = data.id;
        ps.userData.name = data.name;
        return {
            id: data.id,
            name: data.name,
            type: 'particle',
            parentId: 'workspace',
            childrenIds: [],
            threeObject: ps,
            userData: { type: 'particle', config: data.config }
        };
    } else if (data.type === 'npc') {
        const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
        const material = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(data.position);
        mesh.rotation.copy(data.rotation);
        mesh.scale.copy(data.scale);
        mesh.userData = data.userData;
        const obj = {
            id: data.id,
            name: data.name,
            type: 'npc',
            parentId: 'workspace',
            childrenIds: [],
            threeObject: mesh,
            userData: data.userData
        };
        npcList.push(obj);
        return obj;
    } else {
        const mesh = createBlockMesh(data.shape, data.scale, data.color, data.opacity, 'block');
        mesh.position.copy(data.position);
        mesh.rotation.copy(data.rotation);
        mesh.scale.copy(data.scale);
        return {
            id: data.id,
            name: data.name,
            type: 'block',
            parentId: 'workspace',
            childrenIds: [],
            threeObject: mesh,
            userData: { type: 'block', shape: data.shape, color: data.color, opacity: data.opacity }
        };
    }
}

function loadGameIntoEditor(gameData) {
    clearEditor();
    if (gameData.blocks) {
        gameData.blocks.forEach(blockData => {
            const obj = deserializeObject(blockData);
            if (obj) addObject(obj);
        });
    }
    if (gameData.animations) {
        animations = gameData.animations;
        updateAnimationSelect();
    }
    if (gameData.gui) {
        guiElements = gameData.gui;
        renderGUIList();
    }
    selectObject(null);
    renderNpcList();
}

function clearEditor() {
    editorObjects.forEach(obj => {
        if (obj.threeObject) editorScene.remove(obj.threeObject);
    });
    editorObjects = [];
    selectedObjects = [];
    animations = [];
    guiElements = [];
    npcList = [];
    if (transformControls.object) transformControls.detach();
    renderExplorer();
    updatePropertiesPanel();
    updateAnimationSelect();
    renderGUIList();
    renderNpcList();
}

// ========== ИНИЦИАЛИЗАЦИЯ РЕДАКТОРА ==========
function initEditor() {
    if (editorActive) return;
    const container = document.getElementById('editorCanvasContainer');
    container.innerHTML = '';
    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x111122);
    editorScene.fog = new THREE.Fog(0x111122, 40, 80);
    editorCamera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000);
    editorCamera.position.set(10, 8, 10);
    editorRenderer = new THREE.WebGLRenderer({ antialias: true });
    editorRenderer.setSize(container.clientWidth, container.clientHeight);
    editorRenderer.shadowMap.enabled = true;
    editorRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(editorRenderer.domElement);
    editorControls = new OrbitControls(editorCamera, editorRenderer.domElement);
    editorControls.enableDamping = true;
    editorControls.screenSpacePanning = true;
    transformControls = new TransformControls(editorCamera, editorRenderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => { editorControls.enabled = !event.value; });
    transformControls.addEventListener('objectChange', () => { if (selectedObjects.length) updatePropertiesPanel(); });
    editorScene.add(transformControls);

    // Улучшенное освещение
    const ambient = new THREE.AmbientLight(0x404060);
    editorScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xfff5d1, 1.2);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.receiveShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    editorScene.add(dirLight);
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2, 3, 4);
    editorScene.add(fillLight);
    const backLight = new THREE.PointLight(0xffaa66, 0.3);
    backLight.position.set(-3, 2, -4);
    editorScene.add(backLight);
    const gridHelper = new THREE.GridHelper(30, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    editorScene.add(axesHelper);

    // Стартовые объекты
    const platformMesh = createBlockMesh('cube', { x: 10, y: 0.5, z: 10 }, 0x6B8E23, 1, 'block');
    platformMesh.position.set(0, -0.25, 0);
    const platformObj = {
        id: generateId(),
        name: 'Платформа',
        type: 'block',
        parentId: 'workspace',
        childrenIds: [],
        threeObject: platformMesh,
        userData: { type: 'block', shape: 'cube', color: '#6B8E23', opacity: 1 }
    };
    addObject(platformObj);
    const spawnMesh = createBlockMesh('cube', { x: 0.8, y: 0.4, z: 0.8 }, 0xff3333, 1, 'spawn');
    spawnMesh.position.set(0, 0.3, 0);
    const spawnObj = {
        id: generateId(),
        name: 'Спавн',
        type: 'block',
        parentId: 'workspace',
        childrenIds: [],
        threeObject: spawnMesh,
        userData: { type: 'spawn', shape: 'cube', color: '#ff3333', opacity: 1 }
    };
    addObject(spawnObj);
    addDefaultBlock();

    // Привязка кнопок тулбара
    document.getElementById('modeMoveBtn').onclick = () => {
        transformControls.setMode('translate');
        currentTransformMode = 'translate';
        document.getElementById('modeMoveBtn').classList.add('active');
        document.getElementById('modeRotateBtn').classList.remove('active');
        document.getElementById('modeScaleBtn').classList.remove('active');
    };
    document.getElementById('modeRotateBtn').onclick = () => {
        transformControls.setMode('rotate');
        currentTransformMode = 'rotate';
        document.getElementById('modeRotateBtn').classList.add('active');
        document.getElementById('modeMoveBtn').classList.remove('active');
        document.getElementById('modeScaleBtn').classList.remove('active');
    };
    document.getElementById('modeScaleBtn').onclick = () => {
        transformControls.setMode('scale');
        currentTransformMode = 'scale';
        document.getElementById('modeScaleBtn').classList.add('active');
        document.getElementById('modeMoveBtn').classList.remove('active');
        document.getElementById('modeRotateBtn').classList.remove('active');
    };
    document.getElementById('shapeCubeBtn')?.addEventListener('click', () => { currentShape = 'cube'; updateShapeButtons('cube'); });
    document.getElementById('shapeSphereBtn')?.addEventListener('click', () => { currentShape = 'sphere'; updateShapeButtons('sphere'); });
    document.getElementById('shapeCylinderBtn')?.addEventListener('click', () => { currentShape = 'cylinder'; updateShapeButtons('cylinder'); });
    document.getElementById('shapeConeBtn')?.addEventListener('click', () => { currentShape = 'cone'; updateShapeButtons('cone'); });
    function updateShapeButtons(shape) {
        document.getElementById('shapeCubeBtn').classList.remove('active');
        document.getElementById('shapeSphereBtn').classList.remove('active');
        document.getElementById('shapeCylinderBtn').classList.remove('active');
        document.getElementById('shapeConeBtn').classList.remove('active');
        if (shape === 'cube') document.getElementById('shapeCubeBtn').classList.add('active');
        else if (shape === 'sphere') document.getElementById('shapeSphereBtn').classList.add('active');
        else if (shape === 'cylinder') document.getElementById('shapeCylinderBtn').classList.add('active');
        else if (shape === 'cone') document.getElementById('shapeConeBtn').classList.add('active');
    }
    document.getElementById('addCubeBtn').onclick = addDefaultBlock;
    document.getElementById('groupBtn').onclick = groupSelected;
    document.getElementById('saveGameBtn').onclick = saveGameLocal;
    document.getElementById('publishGameBtn').onclick = () => { alert('Публикация через API пока не реализована, но игра сохранена локально'); };
    document.getElementById('exitEditorBtn').onclick = () => {
        document.getElementById('editorScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        if (editorActive) { editorActive = false; cancelAnimationFrame(editorAnimationId); }
    };
    document.querySelectorAll('.block-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.block-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            currentBlockType = opt.dataset.type;
            if (currentBlockType === 'wood') currentColor = '#8B5A2B';
            else if (currentBlockType === 'stone') currentColor = '#808080';
            else if (currentBlockType === 'concrete') currentColor = '#B0B0B0';
            else if (currentBlockType === 'dirt') currentColor = '#6B4C3B';
        });
    });
    document.querySelector('.block-option').classList.add('selected');

    // Новые кнопки
    document.getElementById('deleteBtn')?.addEventListener('click', () => {
        if (selectedObjects.length) deleteObject(selectedObjects[0]);
        else alert('Выберите объект для удаления');
    });
    document.getElementById('duplicateBtn')?.addEventListener('click', () => {
        if (selectedObjects.length) duplicateObject(selectedObjects[0]);
        else alert('Выберите объект для дублирования');
    });
    document.getElementById('workBtn')?.addEventListener('click', () => {
        transformControls.setMode('translate');
        currentTransformMode = 'translate';
        document.getElementById('modeMoveBtn').classList.add('active');
        document.getElementById('modeRotateBtn').classList.remove('active');
        document.getElementById('modeScaleBtn').classList.remove('active');
    });
    document.getElementById('addBlockBtn')?.addEventListener('click', addDefaultBlock);
    document.getElementById('groupBtn2')?.addEventListener('click', groupSelected);

    // VFX
    document.getElementById('addParticleBtn')?.addEventListener('click', () => {
        const config = {
            name: 'Новая система частиц',
            count: 100,
            color: 0xffaa44,
            size: 0.2,
            speedY: 2,
            spread: 1,
            lifetime: 1,
            texture: ''
        };
        addParticleSystem(config);
    });
    document.getElementById('vfxFireBtn')?.addEventListener('click', () => addParticleSystemPreset('fire'));
    document.getElementById('vfxWaterBtn')?.addEventListener('click', () => addParticleSystemPreset('water'));
    document.getElementById('vfxAirBtn')?.addEventListener('click', () => addParticleSystemPreset('air'));
    document.getElementById('vfxSmokeBtn')?.addEventListener('click', () => addParticleSystemPreset('smoke'));

    // Анимации
    document.getElementById('newAnimationBtn')?.addEventListener('click', () => {
        const name = prompt('Название анимации', 'Анимация ' + (animations.length+1));
        if (name) createAnimation(name);
    });
    document.getElementById('recordAnimationBtn')?.addEventListener('click', () => {
        if (!selectedObjects.length) { alert('Выберите объект для записи'); return; }
        recording = true;
        recordTarget = selectedObjects[0];
        recordedKeyframes = [];
        recordStartTime = performance.now() / 1000;
        alert('Запись начата. Изменяйте свойства объекта (двигайте, вращайте, масштабируйте). Нажмите Стоп для завершения.');
    });
    document.getElementById('playAnimationBtn')?.addEventListener('click', () => {
        const select = document.getElementById('animationSelect');
        const animId = select.value;
        if (!animId) { alert('Выберите анимацию'); return; }
        playAnimation(animId);
    });
    document.getElementById('stopAnimationBtn')?.addEventListener('click', () => {
        if (recording) {
            recording = false;
            if (recordTarget && recordedKeyframes.length) {
                const animName = prompt('Название анимации', 'Запись ' + new Date().toLocaleTimeString());
                if (animName) {
                    const newAnim = createAnimation(animName);
                    const framesByProp = {};
                    recordedKeyframes.forEach(kf => {
                        if (!framesByProp[kf.property]) framesByProp[kf.property] = [];
                        framesByProp[kf.property].push({ time: kf.time, value: kf.value });
                    });
                    for (let prop in framesByProp) {
                        const track = { targetId: recordTarget.id, property: prop, keyframes: framesByProp[prop] };
                        newAnim.tracks.push(track);
                    }
                    updateAnimationSelect();
                }
            }
            recordedKeyframes = [];
            recordTarget = null;
        } else {
            stopAnimation();
        }
    });
    transformControls.addEventListener('objectChange', () => {
        if (recording && recordTarget && transformControls.object === recordTarget.threeObject) {
            const pos = recordTarget.threeObject.position.clone();
            const rot = recordTarget.threeObject.rotation.clone();
            const scale = recordTarget.threeObject.scale.clone();
            recordProperty('position', pos);
            recordProperty('rotation', rot);
            recordProperty('scale', scale);
        }
    });
    function recordProperty(property, value) {
        if (!recording || !recordTarget) return;
        const time = performance.now() / 1000 - recordStartTime;
        recordedKeyframes.push({ time, property, value: value.clone ? value.clone() : value });
    }
    initTimeline();

    // GUI
    document.getElementById('addButtonBtn')?.addEventListener('click', () => {
        addGUIElement('button', { name: 'Новая кнопка', text: 'Кнопка', x: 100, y: 100, width: 120, height: 40, action: 'alert("Hello")' });
    });
    document.getElementById('addPanelBtn')?.addEventListener('click', () => {
        addGUIElement('panel', { name: 'Панель', text: 'Панель', x: 100, y: 200, width: 200, height: 150 });
    });
    document.getElementById('addTextBtn')?.addEventListener('click', () => {
        addGUIElement('text', { name: 'Текст', text: 'Привет, мир!', x: 100, y: 300, width: 200, height: 30, fontSize: 14 });
    });

    // NPC
    document.getElementById('createNpcBtn')?.addEventListener('click', () => createNPC());
    document.getElementById('importModelBtn')?.addEventListener('click', importGLTFModel);
    document.getElementById('saveNpcBtn')?.addEventListener('click', saveNPCProperties);

    // Скульптинг
    initSculpting();

    // Вкладки и подразделы
    const tabs = document.querySelectorAll('.tab');
    const subpanels = {
        blocks: document.getElementById('subpanelBlocks'),
        vfx: document.getElementById('subpanelVfx'),
        animations: document.getElementById('subpanelAnimations'),
        scripts: document.getElementById('subpanelScripts'),
        gui: document.getElementById('subpanelGui'),
        npc: document.getElementById('subpanelNpc'),
        sculpt: document.getElementById('subpanelSculpt')
    };
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            Object.values(subpanels).forEach(panel => panel.classList.remove('active'));
            if (subpanels[tabId]) subpanels[tabId].classList.add('active');
        });
    });

    // Скрипты
    document.getElementById('applyScriptBtn')?.addEventListener('click', () => {
        if (!selectedObjects.length) { alert('Выберите блок'); return; }
        const obj = selectedObjects[0];
        const script = document.getElementById('blockScriptEditor').value;
        obj.userData.script = script;
        alert('Скрипт сохранён');
    });
    if (selectedObjects.length) {
        const scriptArea = document.getElementById('blockScriptEditor');
        if (scriptArea && selectedObjects[0].userData.script) scriptArea.value = selectedObjects[0].userData.script;
    }

    if (gameBeingEdited) loadGameIntoEditor(gameBeingEdited);
    function animateEditor() { if (!editorActive) return; editorAnimationId = requestAnimationFrame(animateEditor); editorControls.update(); 
        const delta = 1/60;
        for (let obj of editorObjects) {
            if (obj.type === 'particle') {
                updateParticleSystem(obj.threeObject, delta);
            }
        }
        editorRenderer.render(editorScene, editorCamera);
    }
    editorActive = true; animateEditor();
    window.addEventListener('resize', () => { editorCamera.aspect = container.clientWidth / container.clientHeight; editorCamera.updateProjectionMatrix(); editorRenderer.setSize(container.clientWidth, container.clientHeight); });
}

export function openEditor(gameToEdit = null) {
    gameBeingEdited = gameToEdit;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');
    initEditor();
    }
