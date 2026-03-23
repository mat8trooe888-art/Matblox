// editor.js — конструктор с полной функциональностью
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Глобальные данные редактора (доступны из основного окна)
const { currentUser, customGames, saveGames, createGameOnServer, renderMyProjects } = window;

// Переменные редактора
let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorBlocks = [];
let selectedObjects = [];
let isDraggingSelection = false;
let dragSelectionStart = null;
let dragSelectionEnd = null;
let currentTransformMode = 'move';
let currentShape = 'cube';
let currentBlockType = 'wood';
let currentPhysType = 'solid';
let currentTexture = 'wood';
let currentColor = '#8B5A2B';
let currentOpacity = 1;
let editorActive = false;
let editorAnimationId = null;
let gameBeingEdited = null;
let directionalLight = null;

// Вспомогательные функции
function createMeshEditor(shape, size = { x: 0.9, y: 0.9, z: 0.9 }, color = 0x8B5A2B, opacity = 1, type = 'block') {
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
    mesh.userData = { type, shape, color: '#' + color.toString(16).padStart(6,'0'), opacity, physType: currentPhysType, texture: currentTexture, script: '', groupId: null };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createStartPlatform() {
    const platform = createMeshEditor('cube', { x: 10, y: 0.5, z: 10 }, 0x6B8E23, 1, 'block');
    platform.position.set(0, -0.25, 0);
    platform.userData.color = '#6B8E23';
    editorScene.add(platform);
    editorBlocks.push(platform);
    const spawn = createMeshEditor('cube', { x: 0.8, y: 0.4, z: 0.8 }, 0xff3333, 1, 'spawn');
    spawn.position.set(0, 0.3, 0);
    editorScene.add(spawn);
    editorBlocks.push(spawn);
}

function addDefaultBlock() {
    const color = parseInt(currentColor.slice(1), 16);
    const block = createMeshEditor(currentShape, { x:0.9, y:0.9, z:0.9 }, color, currentOpacity, 'block');
    block.position.set(0, 1, 0);
    editorScene.add(block);
    editorBlocks.push(block);
    selectObject(block);
}

function duplicateSelected() {
    if (selectedObjects.length === 0) return;
    const obj = selectedObjects[0];
    if (obj.userData.type === 'group') return;
    const newBlock = createMeshEditor(obj.userData.shape, obj.scale, parseInt(obj.userData.color.slice(1),16), obj.userData.opacity, obj.userData.type);
    newBlock.position.copy(obj.position);
    newBlock.position.x += 1;
    newBlock.rotation.copy(obj.rotation);
    newBlock.userData = { ...obj.userData };
    editorScene.add(newBlock);
    editorBlocks.push(newBlock);
    selectObject(newBlock);
}

function applyLightSettings() {
    if (!directionalLight) return;
    const intensity = parseFloat(document.getElementById('lightIntensity').value);
    const color = document.getElementById('lightColor').value;
    const height = parseFloat(document.getElementById('lightHeight').value);
    const angleX = parseFloat(document.getElementById('lightAngleX').value);
    const angleY = parseFloat(document.getElementById('lightAngleY').value);
    directionalLight.intensity = intensity;
    directionalLight.color.set(color);
    const radX = angleX * Math.PI/180;
    const radY = angleY * Math.PI/180;
    const x = Math.cos(radY) * Math.cos(radX);
    const y = Math.sin(radX);
    const z = Math.sin(radY) * Math.cos(radX);
    directionalLight.position.set(x * height, y * height, z * height);
    directionalLight.target.position.set(0,0,0);
    editorScene.add(directionalLight.target);
    document.getElementById('lightIntensityVal').innerText = intensity.toFixed(2);
    document.getElementById('lightHeightVal').innerText = height.toFixed(1);
    document.getElementById('lightAngleXVal').innerText = angleX;
    document.getElementById('lightAngleYVal').innerText = angleY;
}

function createGroup(objects) {
    const group = new THREE.Group();
    group.userData = { type: 'group', children: objects.map(obj => ({ original: obj, position: obj.position.clone(), rotation: obj.rotation.clone(), scale: obj.scale.clone() })), groupId: Date.now() };
    objects.forEach(obj => { group.add(obj); obj.userData.groupId = group.userData.groupId; });
    return group;
}

function ungroup(group) {
    if (group.userData.type !== 'group') return null;
    const children = [...group.children];
    group.remove(...children);
    children.forEach(child => { child.userData.groupId = null; editorScene.add(child); });
    editorScene.remove(group);
    return children;
}

function updatePropertiesPanel() {
    let panel = document.getElementById('propertiesPanel');
    if (!panel) { panel = document.createElement('div'); panel.id = 'propertiesPanel'; panel.className = 'properties-panel'; document.body.appendChild(panel); }
    if (selectedObjects.length === 0) { panel.innerHTML = '<div style="padding:12px; color:#aaa;">Ничего не выбрано</div>'; return; }
    const obj = selectedObjects[0];
    const isGroup = obj.userData.type === 'group';
    let html = `<div class="prop-section"><h4>${isGroup ? 'Группа' : 'Блок'}</h4>
        <div class="prop-row"><label>Позиция X:</label><input type="number" id="propPosX" step="0.1" value="${obj.position.x.toFixed(2)}"></div>
        <div class="prop-row"><label>Позиция Y:</label><input type="number" id="propPosY" step="0.1" value="${obj.position.y.toFixed(2)}"></div>
        <div class="prop-row"><label>Позиция Z:</label><input type="number" id="propPosZ" step="0.1" value="${obj.position.z.toFixed(2)}"></div>
        <div class="prop-row"><label>Поворот X:</label><input type="number" id="propRotX" step="15" value="${(obj.rotation.x * 180/Math.PI).toFixed(0)}"></div>
        <div class="prop-row"><label>Поворот Y:</label><input type="number" id="propRotY" step="15" value="${(obj.rotation.y * 180/Math.PI).toFixed(0)}"></div>
        <div class="prop-row"><label>Поворот Z:</label><input type="number" id="propRotZ" step="15" value="${(obj.rotation.z * 180/Math.PI).toFixed(0)}"></div>
        <div class="prop-row"><label>Масштаб X:</label><input type="number" id="propScaleX" step="0.1" min="0.2" max="5" value="${obj.scale.x.toFixed(2)}"></div>
        <div class="prop-row"><label>Масштаб Y:</label><input type="number" id="propScaleY" step="0.1" min="0.2" max="5" value="${obj.scale.y.toFixed(2)}"></div>
        <div class="prop-row"><label>Масштаб Z:</label><input type="number" id="propScaleZ" step="0.1" min="0.2" max="5" value="${obj.scale.z.toFixed(2)}"></div>`;
    if (!isGroup) {
        html += `<div class="prop-row"><label>Цвет:</label><input type="color" id="propColor" value="${obj.userData.color}"></div>
        <div class="prop-row"><label>Прозрачность:</label><input type="range" id="propOpacity" min="0" max="1" step="0.01" value="${obj.userData.opacity}"><span id="propOpacityVal">${obj.userData.opacity.toFixed(2)}</span></div>
        <div class="prop-row"><label>Тип:</label><select id="propPhysType"><option value="solid" ${obj.userData.physType === 'solid' ? 'selected' : ''}>Твёрдый</option><option value="platform" ${obj.userData.physType === 'platform' ? 'selected' : ''}>Платформа</option><option value="trigger" ${obj.userData.physType === 'trigger' ? 'selected' : ''}>Триггер</option></select></div>
        <div class="prop-row"><label>Текстура:</label><select id="propTexture"><option value="wood" ${obj.userData.texture === 'wood' ? 'selected' : ''}>Дерево</option><option value="stone" ${obj.userData.texture === 'stone' ? 'selected' : ''}>Камень</option><option value="brick" ${obj.userData.texture === 'brick' ? 'selected' : ''}>Кирпич</option><option value="grass" ${obj.userData.texture === 'grass' ? 'selected' : ''}>Трава</option></select></div>
        <div class="prop-row"><label>Скрипт:</label><textarea id="propScript" rows="3" style="width:100%">${obj.userData.script || ''}</textarea></div>`;
    }
    html += `<button id="applyPropsBtn" class="tool-btn" style="margin-top:8px;">💾 Применить</button>`;
    if (isGroup) html += `<button id="ungroupBtn" class="tool-btn" style="margin-top:8px; background:#ffaa44;">🔓 Разгруппировать</button>`;
    panel.innerHTML = html;
    document.getElementById('applyPropsBtn')?.addEventListener('click', () => applyPropertiesToSelected());
    if (isGroup) document.getElementById('ungroupBtn')?.addEventListener('click', () => { const newChildren = ungroup(obj); if (newChildren) { editorBlocks = editorBlocks.filter(b => b !== obj); editorBlocks.push(...newChildren); selectedObjects = []; updatePropertiesPanel(); } });
    const posX = document.getElementById('propPosX'), posY = document.getElementById('propPosY'), posZ = document.getElementById('propPosZ');
    const rotX = document.getElementById('propRotX'), rotY = document.getElementById('propRotY'), rotZ = document.getElementById('propRotZ');
    const scaleX = document.getElementById('propScaleX'), scaleY = document.getElementById('propScaleY'), scaleZ = document.getElementById('propScaleZ');
    const applyTransform = () => {
        if (!selectedObjects.length) return;
        const obj = selectedObjects[0];
        obj.position.set(parseFloat(posX.value), parseFloat(posY.value), parseFloat(posZ.value));
        obj.rotation.set(parseFloat(rotX.value) * Math.PI/180, parseFloat(rotY.value) * Math.PI/180, parseFloat(rotZ.value) * Math.PI/180);
        obj.scale.set(parseFloat(scaleX.value), parseFloat(scaleY.value), parseFloat(scaleZ.value));
        if (transformControls.object === obj) transformControls.update();
    };
    posX?.addEventListener('change', applyTransform); posY?.addEventListener('change', applyTransform); posZ?.addEventListener('change', applyTransform);
    rotX?.addEventListener('change', applyTransform); rotY?.addEventListener('change', applyTransform); rotZ?.addEventListener('change', applyTransform);
    scaleX?.addEventListener('change', applyTransform); scaleY?.addEventListener('change', applyTransform); scaleZ?.addEventListener('change', applyTransform);
    if (!isGroup) {
        const colorInput = document.getElementById('propColor');
        const opacityInput = document.getElementById('propOpacity');
        const opacityVal = document.getElementById('propOpacityVal');
        const physType = document.getElementById('propPhysType');
        const texture = document.getElementById('propTexture');
        const script = document.getElementById('propScript');
        colorInput?.addEventListener('change', () => { obj.material.color.set(colorInput.value); obj.userData.color = colorInput.value; });
        opacityInput?.addEventListener('input', () => { const val = parseFloat(opacityInput.value); obj.material.transparent = val < 1; obj.material.opacity = val; obj.userData.opacity = val; if (opacityVal) opacityVal.innerText = val.toFixed(2); });
        physType?.addEventListener('change', () => { obj.userData.physType = physType.value; });
        texture?.addEventListener('change', () => { obj.userData.texture = texture.value; });
        script?.addEventListener('change', () => { obj.userData.script = script.value; });
    }
}

function applyPropertiesToSelected() { if (selectedObjects.length === 0) return; updatePropertiesPanel(); }

function clearSelection() {
    selectedObjects.forEach(obj => {
        if (obj.userData.originalMaterial) { obj.material = obj.userData.originalMaterial; delete obj.userData.originalMaterial; }
        if (obj.children) obj.children.forEach(child => { if (child.userData.originalMaterial) { child.material = child.userData.originalMaterial; delete child.userData.originalMaterial; } });
    });
    selectedObjects = [];
    if (transformControls.object) transformControls.detach();
    updatePropertiesPanel();
}

function selectObject(obj, addToSelection = false) {
    if (!addToSelection) clearSelection();
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        if (obj.isGroup) {
            obj.children.forEach(child => { if (!child.userData.originalMaterial) { child.userData.originalMaterial = child.material; child.material = child.material.clone(); child.material.emissive = new THREE.Color(0x444444); } });
        } else {
            if (!obj.userData.originalMaterial) { obj.userData.originalMaterial = obj.material; obj.material = obj.material.clone(); obj.material.emissive = new THREE.Color(0x444444); }
        }
        if (selectedObjects.length === 1) transformControls.attach(obj);
    }
    updatePropertiesPanel();
}

function startDragSelection(e) {
    isDraggingSelection = true;
    dragSelectionStart = { x: e.clientX, y: e.clientY };
    dragSelectionEnd = null;
    const rectDiv = document.createElement('div'); rectDiv.id = 'dragSelectionRect'; rectDiv.style.cssText = 'position:fixed; border:1px dashed #fff; background:rgba(100,100,255,0.2); pointer-events:none; z-index:1000;'; document.body.appendChild(rectDiv);
}
function updateDragSelection(e) {
    if (!isDraggingSelection || !dragSelectionStart) return;
    dragSelectionEnd = { x: e.clientX, y: e.clientY };
    const rectDiv = document.getElementById('dragSelectionRect');
    if (rectDiv) {
        const left = Math.min(dragSelectionStart.x, dragSelectionEnd.x);
        const top = Math.min(dragSelectionStart.y, dragSelectionEnd.y);
        const width = Math.abs(dragSelectionStart.x - dragSelectionEnd.x);
        const height = Math.abs(dragSelectionStart.y - dragSelectionEnd.y);
        rectDiv.style.left = left + 'px'; rectDiv.style.top = top + 'px'; rectDiv.style.width = width + 'px'; rectDiv.style.height = height + 'px';
    }
}
function endDragSelection() {
    isDraggingSelection = false;
    const rectDiv = document.getElementById('dragSelectionRect'); if (rectDiv) rectDiv.remove();
    if (!dragSelectionStart || !dragSelectionEnd) { dragSelectionStart = null; dragSelectionEnd = null; return; }
    const start = new THREE.Vector2(dragSelectionStart.x, dragSelectionStart.y);
    const end = new THREE.Vector2(dragSelectionEnd.x, dragSelectionEnd.y);
    const rect = { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), right: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y) };
    const toSelect = [];
    editorBlocks.forEach(obj => {
        const vector = obj.position.clone().project(editorCamera);
        const x = (vector.x * 0.5 + 0.5) * editorRenderer.domElement.clientWidth;
        const y = (-(vector.y * 0.5 - 0.5)) * editorRenderer.domElement.clientHeight;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) toSelect.push(obj);
    });
    if (toSelect.length) { clearSelection(); toSelect.forEach(obj => selectObject(obj, true)); }
    dragSelectionStart = null; dragSelectionEnd = null;
}

function groupSelected() {
    if (selectedObjects.length < 2) return;
    const objectsToGroup = [...selectedObjects];
    const group = createGroup(objectsToGroup);
    editorScene.add(group);
    objectsToGroup.forEach(obj => { const idx = editorBlocks.indexOf(obj); if (idx !== -1) editorBlocks.splice(idx, 1); });
    editorBlocks.push(group);
    clearSelection();
    selectObject(group);
}

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
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    editorRenderer.domElement.addEventListener('click', (event) => {
        if (isDraggingSelection) return;
        const rect = editorRenderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, editorCamera);
        const intersects = raycaster.intersectObjects(editorBlocks, true);
        if (intersects.length > 0) {
            let hit = intersects[0].object;
            while (hit.parent && hit.parent !== editorScene && hit.parent.userData.type === 'group') hit = hit.parent;
            if (event.ctrlKey) {
                if (selectedObjects.includes(hit)) {
                    const idx = selectedObjects.indexOf(hit);
                    if (idx !== -1) selectedObjects.splice(idx, 1);
                    if (hit.userData.originalMaterial) { hit.material = hit.userData.originalMaterial; delete hit.userData.originalMaterial; }
                    if (hit.isGroup) hit.children.forEach(child => { if (child.userData.originalMaterial) { child.material = child.userData.originalMaterial; delete child.userData.originalMaterial; } });
                    if (selectedObjects.length === 1) transformControls.attach(selectedObjects[0]);
                    else if (selectedObjects.length === 0) transformControls.detach();
                    updatePropertiesPanel();
                } else selectObject(hit, true);
            } else selectObject(hit, false);
        } else clearSelection();
    });
    editorRenderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.ctrlKey && !e.shiftKey) startDragSelection(e); });
    editorRenderer.domElement.addEventListener('mousemove', (e) => { if (isDraggingSelection) updateDragSelection(e); });
    editorRenderer.domElement.addEventListener('mouseup', (e) => { if (isDraggingSelection) endDragSelection(); });
    editorRenderer.domElement.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { e.preventDefault(); startDragSelection(e.touches[0]); } });
    editorRenderer.domElement.addEventListener('touchmove', (e) => { if (isDraggingSelection && e.touches.length === 1) { e.preventDefault(); updateDragSelection(e.touches[0]); } });
    editorRenderer.domElement.addEventListener('touchend', (e) => { if (isDraggingSelection) endDragSelection(); });

    document.getElementById('modeMove').onclick = () => { transformControls.setMode('translate'); currentTransformMode = 'move'; };
    document.getElementById('modeRotate').onclick = () => { transformControls.setMode('rotate'); currentTransformMode = 'rotate'; };
    document.getElementById('modeScale').onclick = () => { transformControls.setMode('scale'); currentTransformMode = 'scale'; };
    document.getElementById('shapeCube').onclick = () => { currentShape = 'cube'; };
    document.getElementById('shapeSphere').onclick = () => { currentShape = 'sphere'; };
    document.getElementById('shapeCylinder').onclick = () => { currentShape = 'cylinder'; };
    document.getElementById('shapeCone').onclick = () => { currentShape = 'cone'; };
    document.getElementById('shapeWedge').onclick = () => { currentShape = 'wedge'; };
    document.getElementById('duplicateBtn').onclick = duplicateSelected;
    document.getElementById('addCubeBtn').onclick = addDefaultBlock;
    document.getElementById('groupBtn').onclick = groupSelected;
    document.getElementById('applyLightBtn').onclick = applyLightSettings;
    document.getElementById('publishGameBtn').onclick = publishGameLocal;
    document.getElementById('exitEditorBtn').onclick = () => { document.getElementById('editorScreen').classList.add('hidden'); document.getElementById('mainMenuScreen').classList.remove('hidden'); if (editorActive) { editorActive = false; cancelAnimationFrame(editorAnimationId); } };
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
    if (gameBeingEdited) loadGameForEditing(gameBeingEdited);
    else { createStartPlatform(); addDefaultBlock(); }
    function animateEditor() { if (!editorActive) return; editorAnimationId = requestAnimationFrame(animateEditor); editorControls.update(); editorRenderer.render(editorScene, editorCamera); }
    editorActive = true; animateEditor();
    window.addEventListener('resize', () => { const container = document.getElementById('editorCanvasContainer'); editorCamera.aspect = container.clientWidth / container.clientHeight; editorCamera.updateProjectionMatrix(); editorRenderer.setSize(container.clientWidth, container.clientHeight); });
    const toolsPanel = document.getElementById('toolsPanel');
    const propsPanel = document.getElementById('propertiesPanel');
    document.getElementById('toggleToolsPanelBtn').onclick = () => { toolsPanel.classList.toggle('hidden'); };
    document.getElementById('togglePropsPanelBtn').onclick = () => { propsPanel.classList.toggle('hidden'); };
    document.getElementById('toggleToolsBtn').onclick = () => { toolsPanel.classList.toggle('hidden'); };
    document.getElementById('togglePropsBtn').onclick = () => { propsPanel.classList.toggle('hidden'); };
}

function publishGameLocal() {
    const gameName = prompt('Введите название игры для публикации:');
    if (!gameName) return;
    const blocksData = editorBlocks.map(block => serializeBlockForServer(block));
    const gameData = { blocks: blocksData };
    const gameId = Date.now();
    const newGame = { id: gameId, name: gameName, author: window.currentUser.username, desc: 'Опубликовано', data: gameData };
    window.customGames.push(newGame);
    window.saveGames();
    if (window.renderMyProjects) window.renderMyProjects();
    if (confirm('Игра сохранена. Создать мультиплеерный сервер для неё?')) {
        window.createGameOnServer(gameName, gameData);
    }
}

function serializeBlockForServer(obj) {
    if (obj.userData.type === 'group') return { type: 'group', children: obj.children.map(c => serializeBlockForServer(c)) };
    else return {
        shape: obj.userData.shape,
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
        color: parseInt(obj.userData.color.slice(1),16),
        opacity: obj.userData.opacity,
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z,
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        userData: { type: obj.userData.type, ...obj.userData }
    };
}

function loadGameForEditing(game) {
    clearEditor();
    if (!game.data || !game.data.blocks) return;
    game.data.blocks.forEach(blockData => {
        const block = deserializeBlock(blockData);
        editorScene.add(block);
        editorBlocks.push(block);
    });
    selectObject(null);
}

function deserializeBlock(data) {
    if (data.type === 'group') {
        const group = new THREE.Group();
        group.position.set(data.position.x, data.position.y, data.position.z);
        group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        group.scale.set(data.scale.x, data.scale.y, data.scale.z);
        group.userData = { type: 'group', groupId: Date.now() };
        data.children.forEach(childData => {
            const child = deserializeBlock(childData);
            group.add(child);
            child.userData.groupId = group.userData.groupId;
        });
        return group;
    } else {
        const colorNum = parseInt(data.color.slice(1), 16);
        const block = createMeshEditor(data.shape, data.scale, colorNum, data.opacity, data.userData?.type || 'block');
        block.position.set(data.x, data.y, data.z);
        block.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        block.userData = { ...block.userData, ...data.userData };
        return block;
    }
}

function clearEditor() { editorBlocks.forEach(block => editorScene.remove(block)); editorBlocks = []; selectedObjects = []; if (transformControls.object) transformControls.detach(); updatePropertiesPanel(); }

export function openEditor(gameToEdit = null) {
    gameBeingEdited = gameToEdit;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');
    initEditor();
                                                        }
