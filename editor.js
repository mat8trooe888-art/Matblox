import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as API from './api.js';

// ========== ПЕРЕМЕННЫЕ ==========
let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorObjects = [];
let selectedObjects = [];
let currentTransformMode = 'translate';
let currentShape = 'cube';
let currentColor = '#8B5A2B';
let currentOpacity = 1;
let editorActive = false;
let editorAnimationId = null;
let gameBeingEdited = null;

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

// GUI
let guiElements = [];

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
        div.innerHTML = `<span>${el.type === 'button' ? '🔘' : el.type === 'panel' ? '📦' : '📝'} ${el.name}</span><div><button class="editGuiBtn" data-id="${el.id}" style="background:#ffaa44; border:none; border-radius:12px; padding:2px 8px; margin-right:4px;">✎</button><button class="deleteGuiBtn" data-id="${el.id}" style="background:#ff3333; border:none; border-radius:12px; padding:2px 8px;">🗑</button></div>`;
        container.appendChild(div);
    });
    document.querySelectorAll('.editGuiBtn').forEach(btn => btn.addEventListener('click', () => { const id = btn.dataset.id; const el = guiElements.find(g => g.id === id); if (el) editGUIElement(el); }));
    document.querySelectorAll('.deleteGuiBtn').forEach(btn => btn.addEventListener('click', () => { const id = btn.dataset.id; guiElements = guiElements.filter(g => g.id !== id); renderGUIList(); updateGUIPreview(); }));
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
                    try { new Function('game', 'player', 'world', el.action)(null, null, null); } catch(e) { console.warn(e); }
                }
                alert(`Нажата кнопка: ${el.name}`);
            });
        }
        container.appendChild(div);
    });
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
        renderExplorer();
        updatePropertiesPanel();
    }
}

function duplicateObject(obj) {
    const cloneMesh = obj.threeObject.clone();
    cloneMesh.position.x += 1;
    const newId = generateId();
    const newObj = {
        id: newId,
        name: `${obj.name} (копия)`,
        type: obj.type,
        parentId: null,
        childrenIds: [],
        threeObject: cloneMesh,
        userData: { ...obj.userData }
    };
    addObject(newObj);
    selectObject(newObj);
}

function renameObject(obj) {
    const newName = prompt('Новое имя', obj.name);
    if (newName) {
        obj.name = newName;
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
        parentId: null,
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
        parentId: null,
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
        if (obj.threeObject && !obj.userData.originalMaterial) {
            obj.userData.originalMaterial = obj.threeObject.material;
            if (obj.threeObject.material) {
                const newMat = obj.threeObject.material.clone();
                newMat.emissive = new THREE.Color(0x444444);
                obj.threeObject.material = newMat;
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
        if (selectedObjects.some(obj => obj.id === id)) el.classList.add('selected');
    });
}

function renderExplorer() {
    const container = document.getElementById('explorerTree');
    if (!container) return;
    const rootObjects = editorObjects.filter(obj => !obj.parentId);
    container.innerHTML = '';
    rootObjects.forEach(obj => renderExplorerItem(obj, container));
}

function renderExplorerItem(obj, parentElement) {
    const div = document.createElement('div');
    div.className = 'explorer-item';
    div.dataset.id = obj.id;
    if (selectedObjects.includes(obj)) div.classList.add('selected');
    let icon = '🧱';
    if (obj.type === 'group') icon = '📁';
    div.innerHTML = `<span class="icon">${icon}</span><span class="name">${escapeHtml(obj.name)}</span><span class="controls"><button class="renameBtn" title="Переименовать">✎</button><button class="deleteBtn" title="Удалить">🗑</button><button class="duplicateBtn" title="Дублировать">📋</button></span>`;
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
    div.addEventListener('click', (e) => { e.stopPropagation(); selectObject(obj, e.ctrlKey); });
    div.querySelector('.renameBtn')?.addEventListener('click', (e) => { e.stopPropagation(); renameObject(obj); });
    div.querySelector('.deleteBtn')?.addEventListener('click', (e) => { e.stopPropagation(); deleteObject(obj); });
    div.querySelector('.duplicateBtn')?.addEventListener('click', (e) => { e.stopPropagation(); duplicateObject(obj); });
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; });
}

function updatePropertiesPanel() {
    const container = document.getElementById('propertiesContent');
    if (!container) return;
    if (selectedObjects.length === 0) {
        container.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>';
        return;
    }
    const obj = selectedObjects[0];
    container.innerHTML = `
        <div class="prop-group"><label>Имя</label><input type="text" id="propName" value="${escapeHtml(obj.name)}"></div>
        <div class="prop-group"><label>Позиция X</label><input type="number" id="propPosX" step="0.1" value="${obj.threeObject.position.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Y</label><input type="number" id="propPosY" step="0.1" value="${obj.threeObject.position.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Z</label><input type="number" id="propPosZ" step="0.1" value="${obj.threeObject.position.z.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб X</label><input type="number" id="propScaleX" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Y</label><input type="number" id="propScaleY" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Z</label><input type="number" id="propScaleZ" step="0.1" min="0.2" max="5" value="${obj.threeObject.scale.z.toFixed(2)}"></div>
        ${obj.type === 'block' ? `<div class="prop-group"><label>Цвет</label><input type="color" id="propColor" value="${obj.userData.color}"></div><div class="prop-group"><label>Прозрачность</label><input type="range" id="propOpacity" min="0" max="1" step="0.01" value="${obj.userData.opacity}"></div>` : ''}
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
        document.getElementById('propColor')?.addEventListener('change', (e) => { obj.userData.color = e.target.value; obj.threeObject.material.color.set(e.target.value); });
        document.getElementById('propOpacity')?.addEventListener('input', (e) => { const val = parseFloat(e.target.value); obj.userData.opacity = val; obj.threeObject.material.transparent = val < 1; obj.threeObject.material.opacity = val; });
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

async function saveGameLocal() {
    if (!window.currentUser) { alert('Вы не авторизованы'); return; }
    const gameName = prompt('Введите название игры:');
    if (!gameName) return;
    const gameData = { blocks: editorObjects.map(obj => serializeObject(obj)), animations: animations, gui: guiElements };
    const result = await API.saveGame(gameName, window.currentUser.username, gameData);
    if (result.id) alert('Игра сохранена');
    else alert('Ошибка');
}

function serializeObject(obj) {
    return {
        type: obj.type,
        id: obj.id,
        name: obj.name,
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
    return {
        id: data.id,
        name: data.name,
        type: data.type,
        parentId: null,
        childrenIds: [],
        threeObject: mesh,
        userData: data.userData
    };
}

function loadGameIntoEditor(gameData) {
    clearEditor();
    if (gameData.blocks) {
        gameData.blocks.forEach(blockData => { const obj = deserializeObject(blockData); if (obj) addObject(obj); });
    }
    if (gameData.animations) animations = gameData.animations;
    if (gameData.gui) guiElements = gameData.gui;
    selectObject(null);
}

function clearEditor() {
    editorObjects.forEach(obj => { if (obj.threeObject) editorScene.remove(obj.threeObject); });
    editorObjects = [];
    selectedObjects = [];
    animations = [];
    guiElements = [];
    if (transformControls.object) transformControls.detach();
    renderExplorer();
    updatePropertiesPanel();
}

// ========== ИНИЦИАЛИЗАЦИЯ РЕДАКТОРА ==========
function initEditor() {
    if (editorActive) return;
    const container = document.getElementById('editorCanvasContainer');
    container.innerHTML = '';
    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x87CEEB);
    editorScene.fog = new THREE.Fog(0x87CEEB, 40, 80);
    editorCamera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000);
    editorCamera.position.set(10, 8, 10);
    editorRenderer = new THREE.WebGLRenderer({ antialias: true });
    editorRenderer.setSize(container.clientWidth, container.clientHeight);
    editorRenderer.shadowMap.enabled = true;
    container.appendChild(editorRenderer.domElement);
    editorControls = new OrbitControls(editorCamera, editorRenderer.domElement);
    editorControls.enableDamping = true;
    editorControls.screenSpacePanning = true;
    transformControls = new TransformControls(editorCamera, editorRenderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => { editorControls.enabled = !event.value; });
    transformControls.addEventListener('objectChange', () => { if (selectedObjects.length) updatePropertiesPanel(); });
    editorScene.add(transformControls);

    const ambient = new THREE.AmbientLight(0x404060);
    editorScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffaa66, 1);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    editorScene.add(dirLight);
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2, 3, 4);
    editorScene.add(fillLight);
    const gridHelper = new THREE.GridHelper(30, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    editorScene.add(axesHelper);

    // Стартовые объекты
    const platformMesh = createBlockMesh('cube', { x: 10, y: 0.5, z: 10 }, 0x6B8E23, 1, 'block');
    platformMesh.position.set(0, -0.25, 0);
    addObject({ id: generateId(), name: 'Платформа', type: 'block', parentId: null, childrenIds: [], threeObject: platformMesh, userData: { type: 'block', shape: 'cube', color: '#6B8E23', opacity: 1 } });
    const spawnMesh = createBlockMesh('cube', { x: 0.8, y: 0.4, z: 0.8 }, 0xff3333, 1, 'spawn');
    spawnMesh.position.set(0, 0.3, 0);
    addObject({ id: generateId(), name: 'Спавн', type: 'block', parentId: null, childrenIds: [], threeObject: spawnMesh, userData: { type: 'spawn', shape: 'cube', color: '#ff3333', opacity: 1 } });
    addDefaultBlock();

    // Привязка кнопок
    document.getElementById('modeMoveBtn').onclick = () => { transformControls.setMode('translate'); currentTransformMode = 'translate'; document.getElementById('modeMoveBtn').classList.add('active'); document.getElementById('modeRotateBtn').classList.remove('active'); document.getElementById('modeScaleBtn').classList.remove('active'); };
    document.getElementById('modeRotateBtn').onclick = () => { transformControls.setMode('rotate'); currentTransformMode = 'rotate'; document.getElementById('modeRotateBtn').classList.add('active'); document.getElementById('modeMoveBtn').classList.remove('active'); document.getElementById('modeScaleBtn').classList.remove('active'); };
    document.getElementById('modeScaleBtn').onclick = () => { transformControls.setMode('scale'); currentTransformMode = 'scale'; document.getElementById('modeScaleBtn').classList.add('active'); document.getElementById('modeMoveBtn').classList.remove('active'); document.getElementById('modeRotateBtn').classList.remove('active'); };
    document.getElementById('shapeCubeBtn')?.addEventListener('click', () => { currentShape = 'cube'; });
    document.getElementById('shapeSphereBtn')?.addEventListener('click', () => { currentShape = 'sphere'; });
    document.getElementById('shapeCylinderBtn')?.addEventListener('click', () => { currentShape = 'cylinder'; });
    document.getElementById('shapeConeBtn')?.addEventListener('click', () => { currentShape = 'cone'; });
    document.getElementById('addCubeBtn').onclick = addDefaultBlock;
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
        });
    });
    document.querySelector('.block-option').classList.add('selected');
    document.getElementById('deleteBtn')?.addEventListener('click', () => { if (selectedObjects.length) deleteObject(selectedObjects[0]); else alert('Выберите объект'); });
    document.getElementById('duplicateBtn')?.addEventListener('click', () => { if (selectedObjects.length) duplicateObject(selectedObjects[0]); else alert('Выберите объект'); });
    document.getElementById('workBtn')?.addEventListener('click', () => { transformControls.setMode('translate'); });
    document.getElementById('addBlockBtn')?.addEventListener('click', addDefaultBlock);
    document.getElementById('groupBtn2')?.addEventListener('click', groupSelected);
    document.getElementById('addParticleBtn')?.addEventListener('click', () => alert('Система частиц будет позже'));

    // Вкладки
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

    document.getElementById('applyScriptBtn')?.addEventListener('click', () => {
        if (!selectedObjects.length) { alert('Выберите блок'); return; }
        const script = document.getElementById('blockScriptEditor').value;
        selectedObjects[0].userData.script = script;
        alert('Скрипт сохранён');
    });
    document.getElementById('addButtonBtn')?.addEventListener('click', () => addGUIElement('button', { name: 'Кнопка', text: 'Кнопка', x: 100, y: 100, width: 120, height: 40, action: 'alert("Hello")' }));
    document.getElementById('addPanelBtn')?.addEventListener('click', () => addGUIElement('panel', { name: 'Панель', text: 'Панель', x: 100, y: 200, width: 200, height: 150 }));
    document.getElementById('addTextBtn')?.addEventListener('click', () => addGUIElement('text', { name: 'Текст', text: 'Привет!', x: 100, y: 300, width: 200, height: 30, fontSize: 14 }));
    document.getElementById('createNpcBtn')?.addEventListener('click', () => alert('NPC будет добавлен позже'));
    document.getElementById('importModelBtn')?.addEventListener('click', () => alert('Импорт GLTF в разработке'));

    if (gameBeingEdited) loadGameIntoEditor(gameBeingEdited);
    function animateEditor() { if (!editorActive) return; editorAnimationId = requestAnimationFrame(animateEditor); editorControls.update(); editorRenderer.render(editorScene, editorCamera); }
    editorActive = true; animateEditor();
    window.addEventListener('resize', () => { editorCamera.aspect = container.clientWidth / container.clientHeight; editorCamera.updateProjectionMatrix(); editorRenderer.setSize(container.clientWidth, container.clientHeight); });
}

export function openEditor(gameToEdit = null) {
    gameBeingEdited = gameToEdit;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');
    initEditor();
        }
