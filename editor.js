// editor.js — конструктор с орбитальной камерой, множественным выбором, группировкой и панелью свойств
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

// Глобальные переменные редактора
let editorScene, editorCamera, editorRenderer, editorControls;
let editorBlocks = [];          // массив всех объектов (мешей и групп)
let selectedObjects = [];       // массив выделенных объектов
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

// Настройки камеры
const cameraSettings = {
    distance: 10,
    azimuth: 45,
    elevation: 30
};

// Группировка
let nextGroupId = 1;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
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
    mesh.userData = {
        type: 'block',
        shape: shape,
        color: '#' + color.toString(16).padStart(6,'0'),
        opacity: opacity,
        physType: currentPhysType,
        texture: currentTexture,
        script: '',
        groupId: null
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createGroup(objects) {
    const group = new THREE.Group();
    group.userData = {
        type: 'group',
        children: objects.map(obj => ({
            original: obj,
            position: obj.position.clone(),
            rotation: obj.rotation.clone(),
            scale: obj.scale.clone()
        })),
        groupId: nextGroupId++
    };
    objects.forEach(obj => {
        group.add(obj);
        obj.userData.groupId = group.userData.groupId;
    });
    return group;
}

function ungroup(group) {
    if (group.userData.type !== 'group') return null;
    const children = [...group.children];
    group.remove(...children);
    children.forEach(child => {
        child.userData.groupId = null;
        editorScene.add(child);
    });
    editorScene.remove(group);
    return children;
}

// ========== ПАНЕЛЬ СВОЙСТВ ==========
function updatePropertiesPanel() {
    const panel = document.getElementById('propertiesPanel');
    if (!panel) return;
    if (selectedObjects.length === 0) {
        panel.innerHTML = '<div style="padding:12px; color:#aaa;">Ничего не выбрано</div>';
        return;
    }
    const obj = selectedObjects[0];
    const isGroup = obj.userData.type === 'group';
    
    let html = `<div class="prop-section">
        <h4>${isGroup ? 'Группа' : 'Блок'}</h4>
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
    if (isGroup) {
        html += `<button id="ungroupBtn" class="tool-btn" style="margin-top:8px; background:#ffaa44;">🔓 Разгруппировать</button>`;
    }
    panel.innerHTML = html;
    
    // Привязываем события
    document.getElementById('applyPropsBtn')?.addEventListener('click', () => applyPropertiesToSelected());
    if (isGroup) {
        document.getElementById('ungroupBtn')?.addEventListener('click', () => {
            ungroup(obj);
            editorBlocks = editorBlocks.filter(b => b !== obj);
            selectedObjects = [];
            updatePropertiesPanel();
            updateSceneList();
        });
    }
    // Поля позиции/поворота/масштаба
    const posX = document.getElementById('propPosX');
    const posY = document.getElementById('propPosY');
    const posZ = document.getElementById('propPosZ');
    const rotX = document.getElementById('propRotX');
    const rotY = document.getElementById('propRotY');
    const rotZ = document.getElementById('propRotZ');
    const scaleX = document.getElementById('propScaleX');
    const scaleY = document.getElementById('propScaleY');
    const scaleZ = document.getElementById('propScaleZ');
    const applyTransform = () => {
        if (!selectedObjects.length) return;
        const obj = selectedObjects[0];
        obj.position.set(parseFloat(posX.value), parseFloat(posY.value), parseFloat(posZ.value));
        obj.rotation.set(parseFloat(rotX.value) * Math.PI/180, parseFloat(rotY.value) * Math.PI/180, parseFloat(rotZ.value) * Math.PI/180);
        obj.scale.set(parseFloat(scaleX.value), parseFloat(scaleY.value), parseFloat(scaleZ.value));
    };
    posX?.addEventListener('change', applyTransform);
    posY?.addEventListener('change', applyTransform);
    posZ?.addEventListener('change', applyTransform);
    rotX?.addEventListener('change', applyTransform);
    rotY?.addEventListener('change', applyTransform);
    rotZ?.addEventListener('change', applyTransform);
    scaleX?.addEventListener('change', applyTransform);
    scaleY?.addEventListener('change', applyTransform);
    scaleZ?.addEventListener('change', applyTransform);
    
    if (!isGroup) {
        const colorInput = document.getElementById('propColor');
        const opacityInput = document.getElementById('propOpacity');
        const opacityVal = document.getElementById('propOpacityVal');
        const physType = document.getElementById('propPhysType');
        const texture = document.getElementById('propTexture');
        const script = document.getElementById('propScript');
        colorInput?.addEventListener('change', () => {
            obj.material.color.set(colorInput.value);
            obj.userData.color = colorInput.value;
        });
        opacityInput?.addEventListener('input', () => {
            const val = parseFloat(opacityInput.value);
            obj.material.transparent = val < 1;
            obj.material.opacity = val;
            obj.userData.opacity = val;
            if (opacityVal) opacityVal.innerText = val.toFixed(2);
        });
        physType?.addEventListener('change', () => { obj.userData.physType = physType.value; });
        texture?.addEventListener('change', () => { obj.userData.texture = texture.value; });
        script?.addEventListener('change', () => { obj.userData.script = script.value; });
    }
}

function applyPropertiesToSelected() {
    if (selectedObjects.length === 0) return;
    for (let obj of selectedObjects) {
        if (obj.userData.type === 'group') continue;
        // Свойства уже применены через прямые обработчики, но для групп не применяем
    }
    updatePropertiesPanel();
}

// ========== ВЫДЕЛЕНИЕ ==========
function clearSelection() {
    selectedObjects.forEach(obj => {
        // Убираем подсветку
        if (obj.userData.originalMaterial) {
            obj.material = obj.userData.originalMaterial;
            delete obj.userData.originalMaterial;
        }
        if (obj.children) {
            obj.children.forEach(child => {
                if (child.userData.originalMaterial) {
                    child.material = child.userData.originalMaterial;
                    delete child.userData.originalMaterial;
                }
            });
        }
    });
    selectedObjects = [];
    updatePropertiesPanel();
}

function selectObject(obj, addToSelection = false) {
    if (!addToSelection) clearSelection();
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        // Подсветка
        if (obj.isGroup) {
            obj.children.forEach(child => {
                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material;
                    child.material = child.material.clone();
                    child.material.emissive = new THREE.Color(0x444444);
                }
            });
        } else {
            if (!obj.userData.originalMaterial) {
                obj.userData.originalMaterial = obj.material;
                obj.material = obj.material.clone();
                obj.material.emissive = new THREE.Color(0x444444);
            }
        }
    }
    updatePropertiesPanel();
}

// ========== ВЫДЕЛЕНИЕ РАМКОЙ ==========
function startDragSelection(event) {
    isDraggingSelection = true;
    dragSelectionStart = { x: event.clientX, y: event.clientY };
    dragSelectionEnd = null;
    // Создаём div для рамки
    const rectDiv = document.createElement('div');
    rectDiv.id = 'dragSelectionRect';
    rectDiv.style.position = 'fixed';
    rectDiv.style.border = '1px dashed #fff';
    rectDiv.style.backgroundColor = 'rgba(100,100,255,0.2)';
    rectDiv.style.pointerEvents = 'none';
    rectDiv.style.zIndex = '1000';
    document.body.appendChild(rectDiv);
}

function updateDragSelection(event) {
    if (!isDraggingSelection || !dragSelectionStart) return;
    dragSelectionEnd = { x: event.clientX, y: event.clientY };
    const rectDiv = document.getElementById('dragSelectionRect');
    if (rectDiv) {
        const left = Math.min(dragSelectionStart.x, dragSelectionEnd.x);
        const top = Math.min(dragSelectionStart.y, dragSelectionEnd.y);
        const width = Math.abs(dragSelectionStart.x - dragSelectionEnd.x);
        const height = Math.abs(dragSelectionStart.y - dragSelectionEnd.y);
        rectDiv.style.left = left + 'px';
        rectDiv.style.top = top + 'px';
        rectDiv.style.width = width + 'px';
        rectDiv.style.height = height + 'px';
    }
}

function endDragSelection() {
    isDraggingSelection = false;
    const rectDiv = document.getElementById('dragSelectionRect');
    if (rectDiv) rectDiv.remove();
    if (!dragSelectionStart || !dragSelectionEnd) return;
    
    // Преобразуем координаты окна в мировые лучи
    const start = new THREE.Vector2(dragSelectionStart.x, dragSelectionStart.y);
    const end = new THREE.Vector2(dragSelectionEnd.x, dragSelectionEnd.y);
    const rect = {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y)
    };
    
    // Проверяем каждый объект, попадает ли его проекция в рамку
    const toSelect = [];
    editorBlocks.forEach(obj => {
        // Получаем позицию объекта в экранных координатах
        const vector = obj.position.clone().project(editorCamera);
        const x = (vector.x * 0.5 + 0.5) * editorRenderer.domElement.clientWidth;
        const y = (-(vector.y * 0.5 - 0.5)) * editorRenderer.domElement.clientHeight;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            toSelect.push(obj);
        }
    });
    
    if (toSelect.length) {
        clearSelection();
        toSelect.forEach(obj => selectObject(obj, true));
    }
    dragSelectionStart = null;
    dragSelectionEnd = null;
}

// ========== ГРУППИРОВКА ==========
function groupSelected() {
    if (selectedObjects.length < 2) return;
    const objectsToGroup = [...selectedObjects];
    const group = createGroup(objectsToGroup);
    editorScene.add(group);
    // Удаляем исходные объекты из editorBlocks, добавляем группу
    objectsToGroup.forEach(obj => {
        const idx = editorBlocks.indexOf(obj);
        if (idx !== -1) editorBlocks.splice(idx, 1);
    });
    editorBlocks.push(group);
    clearSelection();
    selectObject(group);
    updateSceneList();
}

// ========== ОБНОВЛЕНИЕ СПИСКА В СЦЕНЕ (для отладки) ==========
function updateSceneList() {
    // Можно вывести в консоль или обновить дерево, если нужно
    console.log('Objects in scene:', editorBlocks.length);
}

// ========== СОЗДАНИЕ НАЧАЛЬНОЙ ПЛАТФОРМЫ ==========
function createStartPlatform() {
    const platformGeo = new THREE.BoxGeometry(20, 1, 20);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x6B8E23 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, -0.5, 0);
    platform.userData = {
        type: 'block',
        shape: 'cube',
        color: '#6B8E23',
        opacity: 1,
        physType: 'solid',
        texture: 'grass',
        script: ''
    };
    platform.castShadow = true;
    platform.receiveShadow = true;
    editorScene.add(platform);
    editorBlocks.push(platform);
}

// ========== ИНИЦИАЛИЗАЦИЯ РЕДАКТОРА ==========
function initEditor() {
    if (editorActive) return;
    const container = document.getElementById('editorCanvasContainer');
    container.innerHTML = '';
    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x111122);
    editorCamera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000);
    editorCamera.position.set(10, 8, 10);
    editorCamera.lookAt(0,0,0);
    editorRenderer = new THREE.WebGLRenderer({ antialias: true });
    editorRenderer.setSize(container.clientWidth, container.clientHeight);
    editorRenderer.setPixelRatio(window.devicePixelRatio);
    editorRenderer.shadowMap.enabled = true;
    container.appendChild(editorRenderer.domElement);
    
    // Орбитальный контроллер
    editorControls = new OrbitControls(editorCamera, editorRenderer.domElement);
    editorControls.enableDamping = true;
    editorControls.dampingFactor = 0.05;
    editorControls.rotateSpeed = 1.0;
    editorControls.zoomSpeed = 1.2;
    editorControls.panSpeed = 0.8;
    editorControls.screenSpacePanning = true; // для панорамирования по горизонтали/вертикали
    
    // Освещение
    const ambientLight = new THREE.AmbientLight(0x404060);
    editorScene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    editorScene.add(directionalLight);
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2, 3, 4);
    editorScene.add(fillLight);
    
    // Сетка и оси
    const gridHelper = new THREE.GridHelper(30, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    editorScene.add(axesHelper);
    
    // Небо (CubeTexture)
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    cubeTextureLoader.setPath('https://threejs.org/examples/textures/cube/SwedishRoyal/');
    const skybox = cubeTextureLoader.load(['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']);
    editorScene.background = skybox;
    
    // Обработчики событий
    setupEventHandlers();
    
    // Панель свойств справа (создадим в HTML, но обновляем здесь)
    if (!document.getElementById('propertiesPanel')) {
        const panel = document.createElement('div');
        panel.id = 'propertiesPanel';
        panel.className = 'properties-panel';
        document.body.appendChild(panel);
    }
    
    // Загружаем игру, если редактируем
    if (gameBeingEdited) {
        loadGameForEditing(gameBeingEdited);
        gameBeingEdited = null;
    } else {
        createStartPlatform();
        addDefaultBlock(); // добавим ещё один блок для демонстрации
    }
    
    // Анимация
    function animateEditor() {
        if (!editorActive) return;
        editorAnimationId = requestAnimationFrame(animateEditor);
        editorControls.update(); // обязательно обновляем контроллер
        editorRenderer.render(editorScene, editorCamera);
    }
    editorActive = true;
    animateEditor();
    
    // Обработка изменения размера окна
    window.addEventListener('resize', () => {
        const container = document.getElementById('editorCanvasContainer');
        editorCamera.aspect = container.clientWidth / container.clientHeight;
        editorCamera.updateProjectionMatrix();
        editorRenderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function setupEventHandlers() {
    // Выделение рамкой
    editorRenderer.domElement.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !e.ctrlKey && !e.shiftKey) {
            // Левая кнопка без модификаторов – начало рамки
            startDragSelection(e);
        }
    });
    editorRenderer.domElement.addEventListener('mousemove', (e) => {
        if (isDraggingSelection) updateDragSelection(e);
    });
    editorRenderer.domElement.addEventListener('mouseup', (e) => {
        if (isDraggingSelection) endDragSelection();
    });
    
    // Выделение по клику
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    editorRenderer.domElement.addEventListener('click', (event) => {
        if (isDraggingSelection) return; // рамка уже обработана
        const rect = editorRenderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, editorCamera);
        const intersects = raycaster.intersectObjects(editorBlocks, true);
        if (intersects.length > 0) {
            // Находим корневой объект (если это дочерний элемент группы)
            let hit = intersects[0].object;
            while (hit.parent && hit.parent !== editorScene && hit.parent.userData.type === 'group') {
                hit = hit.parent;
            }
            if (event.ctrlKey) {
                if (selectedObjects.includes(hit)) {
                    // Убираем из выделения
                    const idx = selectedObjects.indexOf(hit);
                    if (idx !== -1) selectedObjects.splice(idx, 1);
                    if (hit.userData.originalMaterial) {
                        hit.material = hit.userData.originalMaterial;
                        delete hit.userData.originalMaterial;
                    }
                    if (hit.isGroup) {
                        hit.children.forEach(child => {
                            if (child.userData.originalMaterial) {
                                child.material = child.userData.originalMaterial;
                                delete child.userData.originalMaterial;
                            }
                        });
                    }
                    updatePropertiesPanel();
                } else {
                    selectObject(hit, true);
                }
            } else {
                selectObject(hit, false);
            }
        } else {
            clearSelection();
        }
    });
    
    // Кнопка группировки (добавим в панель инструментов)
    const groupBtn = document.createElement('button');
    groupBtn.textContent = '📦 Группировать';
    groupBtn.className = 'tool-btn special';
    groupBtn.style.marginTop = '8px';
    groupBtn.onclick = groupSelected;
    document.querySelector('.tool-section:last-child').appendChild(groupBtn);
}

// ========== СОХРАНЕНИЕ/ЗАГРУЗКА ==========
function saveGameToStorage() {
    const gameName = prompt('Введите название игры:');
    if (!gameName) return;
    const blocksData = editorBlocks.map(block => serializeBlock(block));
    const gameData = { blocks: blocksData };
    const gameId = Date.now();
    const newGame = {
        id: gameId,
        name: gameName,
        author: window.currentUser.username,
        desc: 'Создано в редакторе',
        data: gameData
    };
    window.customGames.push(newGame);
    window.saveGames();
    alert('Игра сохранена локально!');
    if (window.renderMyProjects) window.renderMyProjects();
}

function serializeBlock(obj) {
    if (obj.userData.type === 'group') {
        return {
            type: 'group',
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            children: obj.children.map(child => serializeBlock(child))
        };
    } else {
        return {
            type: 'block',
            shape: obj.userData.shape,
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            color: obj.userData.color,
            opacity: obj.userData.opacity,
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z,
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            physType: obj.userData.physType,
            texture: obj.userData.texture,
            script: obj.userData.script
        };
    }
}

function loadGameForEditing(game) {
    clearEditor();
    if (!game.data || !game.data.blocks) return;
    game.data.blocks.forEach(blockData => {
        const block = deserializeBlock(blockData);
        editorScene.add(block);
        editorBlocks.push(block);
    });
    selectBlock(null);
}

function deserializeBlock(data) {
    if (data.type === 'group') {
        const group = new THREE.Group();
        group.position.set(data.position.x, data.position.y, data.position.z);
        group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        group.scale.set(data.scale.x, data.scale.y, data.scale.z);
        group.userData = { type: 'group', groupId: nextGroupId++ };
        data.children.forEach(childData => {
            const child = deserializeBlock(childData);
            group.add(child);
            child.userData.groupId = group.userData.groupId;
        });
        return group;
    } else {
        const colorNum = parseInt(data.color.slice(1), 16);
        const block = createMesh(data.shape, data.scale, colorNum, data.opacity);
        block.position.set(data.x, data.y, data.z);
        block.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        block.userData = {
            type: 'block',
            shape: data.shape,
            color: data.color,
            opacity: data.opacity,
            physType: data.physType,
            texture: data.texture,
            script: data.script
        };
        return block;
    }
}

function clearEditor() {
    editorBlocks.forEach(block => editorScene.remove(block));
    editorBlocks = [];
    selectedBlocks = [];
    updatePropertiesPanel();
}

function addDefaultBlock() {
    const color = parseInt(currentColor.slice(1), 16);
    const block = createMesh(currentShape, { x:0.9, y:0.9, z:0.9 }, color, currentOpacity);
    block.position.set(0, 1, 0);
    editorScene.add(block);
    editorBlocks.push(block);
    selectBlock(block);
}

function selectBlock(block) {
    if (block) selectObject(block);
    else clearSelection();
}

function publishGame() {
    const gameName = prompt('Введите название игры для публикации:');
    if (!gameName) return;
    const blocksData = editorBlocks.map(block => serializeBlockForServer(block));
    const gameData = { blocks: blocksData };
    if (window.createGameOnServer) {
        window.createGameOnServer(gameName, gameData);
    } else {
        alert('WebSocket не подключён. Игра сохранена локально.');
    }
    // также локально
    const gameId = Date.now();
    const newGame = {
        id: gameId,
        name: gameName,
        author: window.currentUser.username,
        desc: 'Опубликовано',
        data: gameData
    };
    window.customGames.push(newGame);
    window.saveGames();
    if (window.renderMyProjects) window.renderMyProjects();
    alert('Игра опубликована на сервере и сохранена локально.');
}

function serializeBlockForServer(obj) {
    // Упрощённая версия без групп для сервера (можно расширить)
    if (obj.userData.type === 'group') {
        return { type: 'group', children: obj.children.map(c => serializeBlockForServer(c)) };
    } else {
        return {
            shape: obj.userData.shape,
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            color: parseInt(obj.userData.color.slice(1),16),
            opacity: obj.userData.opacity,
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z,
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }
        };
    }
}

// ========== ЭКСПОРТ ==========
export function openEditor(gameToEdit = null) {
    gameBeingEdited = gameToEdit;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');
    initEditor();
                                                                                                             }
