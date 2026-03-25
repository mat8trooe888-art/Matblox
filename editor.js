import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Глобальные данные (доступны через window)
const { currentUser, customGames, saveGames, renderMyProjects, createGameOnServer } = window;

// ========== ПЕРЕМЕННЫЕ РЕДАКТОРА ==========
let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorObjects = []; // массив объектов с иерархией
let selectedObjects = [];
let currentTransformMode = 'translate';
let currentBlockType = 'wood';
let currentColor = '#8B5A2B';
let currentOpacity = 1;
let editorActive = false;
let editorAnimationId = null;
let gameBeingEdited = null;
let directionalLight = null;

// Вспомогательные функции для идентификаторов
function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

// Создание меша блока
function createBlockMesh(shape, size = { x: 0.9, y: 0.9, z: 0.9 }, color = 0x8B5A2B, opacity = 1, type = 'block') {
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
    mesh.userData = { type, shape, color: '#' + color.toString(16).padStart(6,'0'), opacity };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// Добавление объекта в редактор
function addObject(obj) {
    editorObjects.push(obj);
    if (obj.threeObject) editorScene.add(obj.threeObject);
    renderExplorer();
    return obj;
}

// Удаление объекта
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

// Дублирование объекта
function duplicateObject(obj) {
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

// Переименование объекта
function renameObject(obj) {
    const newName = prompt('Новое имя', obj.name);
    if (newName) {
        obj.name = newName;
        renderExplorer();
        updatePropertiesPanel();
    }
}

// Создание блока
function addDefaultBlock() {
    const color = parseInt(currentColor.slice(1), 16);
    const mesh = createBlockMesh('cube', { x:0.9, y:0.9, z:0.9 }, color, currentOpacity, 'block');
    mesh.position.set(0, 1, 0);
    const obj = {
        id: generateId(),
        name: 'Блок',
        type: 'block',
        parentId: null,
        childrenIds: [],
        threeObject: mesh,
        userData: { type: 'block', shape: 'cube', color: currentColor, opacity: currentOpacity }
    };
    addObject(obj);
    selectObject(obj);
}

// Создание группы
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

// Выделение объекта
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

// Обновление выделения в проводнике
function updateSelectedInExplorer() {
    document.querySelectorAll('.explorer-item').forEach(el => {
        el.classList.remove('selected');
        const id = el.dataset.id;
        if (selectedObjects.some(obj => obj.id === id)) {
            el.classList.add('selected');
        }
    });
}

// Рендер проводника
function renderExplorer() {
    const container = document.getElementById('explorerTree');
    if (!container) return;
    const rootObjects = editorObjects.filter(obj => !obj.parentId);
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
    div.innerHTML = `
        <span class="icon">${obj.type === 'group' ? '📁' : '🧱'}</span>
        <span class="name">${escapeHtml(obj.name)}</span>
        <span class="controls">
            <button class="renameBtn" title="Переименовать">✎</button>
            <button class="deleteBtn" title="Удалить">🗑</button>
            ${obj.type === 'block' ? '<button class="duplicateBtn" title="Дублировать">📋</button>' : ''}
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

// Эскейп для HTML
function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Панель свойств
function updatePropertiesPanel() {
    const container = document.getElementById('propertiesContent');
    if (!container) return;
    if (selectedObjects.length === 0) {
        container.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>';
        return;
    }
    const obj = selectedObjects[0];
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
        <button id="applyPropsBtn" style="background:#ff5722; border:none; border-radius:20px; padding:6px; color:white; margin-top:8px; width:100%;">Применить</button>
    `;

    document.getElementById('propName')?.addEventListener('change', (e) => {
        obj.name = e.target.value;
        renderExplorer();
    });
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
    if (transformControls.object === obj.threeObject) transformControls.update();
    renderExplorer();
}

// Сохранение игры
function saveGameLocal() {
    const gameName = prompt('Введите название игры для сохранения:');
    if (!gameName) return;
    const blocksData = editorObjects.map(obj => serializeObject(obj));
    const gameData = { blocks: blocksData };
    const gameId = Date.now();
    const newGame = { id: gameId, name: gameName, author: window.currentUser.username, desc: 'Создано в конструкторе', data: gameData };
    window.customGames.push(newGame);
    window.saveGames();
    if (window.renderMyProjects) window.renderMyProjects();
    alert('Игра сохранена локально');
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
            position: obj.threeObject.position,
            rotation: obj.threeObject.rotation,
            scale: obj.threeObject.scale
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

function loadGameForEditing(game) {
    clearEditor();
    if (!game.data || !game.data.blocks) return;
    game.data.blocks.forEach(blockData => {
        const obj = deserializeObject(blockData);
        if (obj) addObject(obj);
    });
    selectObject(null);
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
            parentId: null,
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
    } else {
        const colorNum = parseInt(data.color.slice(1), 16);
        const mesh = createBlockMesh(data.shape, data.scale, colorNum, data.opacity, 'block');
        mesh.position.copy(data.position);
        mesh.rotation.copy(data.rotation);
        mesh.scale.copy(data.scale);
        return {
            id: data.id,
            name: data.name,
            type: 'block',
            parentId: null,
            childrenIds: [],
            threeObject: mesh,
            userData: { type: 'block', shape: data.shape, color: data.color, opacity: data.opacity }
        };
    }
}

function clearEditor() {
    editorObjects.forEach(obj => {
        if (obj.threeObject) editorScene.remove(obj.threeObject);
    });
    editorObjects = [];
    selectedObjects = [];
    if (transformControls.object) transformControls.detach();
    renderExplorer();
    updatePropertiesPanel();
}

// Инициализация редактора
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
    directionalLight = new THREE.DirectionalLight(0xffaa66, 1);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    editorScene.add(directionalLight);
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2, 3, 4);
    editorScene.add(fillLight);
    const gridHelper = new THREE.GridHelper(30, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    editorScene.add(axesHelper);

    // Добавляем стартовую платформу и спавн
    const platformMesh = createBlockMesh('cube', { x: 10, y: 0.5, z: 10 }, 0x6B8E23, 1, 'block');
    platformMesh.position.set(0, -0.25, 0);
    const platformObj = {
        id: generateId(),
        name: 'Платформа',
        type: 'block',
        parentId: null,
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
        parentId: null,
        childrenIds: [],
        threeObject: spawnMesh,
        userData: { type: 'spawn', shape: 'cube', color: '#ff3333', opacity: 1 }
    };
    addObject(spawnObj);
    addDefaultBlock();

    // Привязка кнопок
    document.getElementById('modeMoveBtn').onclick = () => { transformControls.setMode('translate'); currentTransformMode = 'translate'; };
    document.getElementById('modeRotateBtn').onclick = () => { transformControls.setMode('rotate'); currentTransformMode = 'rotate'; };
    document.getElementById('modeScaleBtn').onclick = () => { transformControls.setMode('scale'); currentTransformMode = 'scale'; };
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
    document.getElementById('explorerAddBtn').onclick = () => addDefaultBlock();

    // Вкладки
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(tabId + 'Tab').classList.add('active');
        });
    });

    if (gameBeingEdited) loadGameForEditing(gameBeingEdited);
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
