import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as API from './api.js';

// ========== ПЕРЕМЕННЫЕ ==========
let scene, camera, renderer, controls, transformControls;
let objects = [];
let selectedObject = null;
let currentColor = '#ffaa44';
let currentMaterial = 'plastic';
let currentGameId = null;
let editorActive = false;

// История для Undo/Redo
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// ========== ЭЛЕМЕНТЫ UI ==========
let explorerTree, propertiesContent;

// ========== ИНИЦИАЛИЗАЦИЯ ==========
function init() {
    if (editorActive) return;
    editorActive = true;
    init3D();
    initUI();
    addDefaultPart('box');
    saveToHistory();
}

function init3D() {
    const container = document.getElementById('editorCanvasContainer');
    if (!container) return;
    container.innerHTML = '';
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d24);
    scene.fog = new THREE.FogExp2(0x1a1d24, 0.008);
    
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(10, 8, 10);
    camera.lookAt(0, 0, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', (event) => {
        controls.enabled = !event.value;
    });
    transformControls.addEventListener('objectChange', () => {
        if (selectedObject) updateProperties();
        saveToHistory();
    });
    scene.add(transformControls);
    
    // Освещение
    const ambient = new THREE.AmbientLight(0x404060);
    scene.add(ambient);
    
    const dirLight = new THREE.DirectionalLight(0xfff5d1, 1.2);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2, 3, 4);
    scene.add(fillLight);
    
    // Сетка
    const gridHelper = new THREE.GridHelper(50, 20, 0x88aaff, 0x335588);
    scene.add(gridHelper);
    
    // Анимация
    function animate() {
        if (!editorActive) return;
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
    
    window.addEventListener('resize', () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function initUI() {
    explorerTree = document.getElementById('explorerTree');
    propertiesContent = document.getElementById('propertiesContent');
    
    // Инструменты трансформации
    document.getElementById('modeMoveBtn').onclick = () => {
        transformControls.setMode('translate');
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('modeMoveBtn').classList.add('active');
    };
    document.getElementById('modeRotateBtn').onclick = () => {
        transformControls.setMode('rotate');
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('modeRotateBtn').classList.add('active');
    };
    document.getElementById('modeScaleBtn').onclick = () => {
        transformControls.setMode('scale');
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('modeScaleBtn').classList.add('active');
    };
    
    // Добавление объектов
    document.getElementById('addPartBtn').onclick = () => addDefaultPart('box');
    document.getElementById('addSphereBtn').onclick = () => addDefaultPart('sphere');
    document.getElementById('addCylinderBtn').onclick = () => addDefaultPart('cylinder');
    document.getElementById('addConeBtn')?.addEventListener('click', () => addDefaultPart('cone'));
    document.getElementById('addCapsuleBtn')?.addEventListener('click', () => addDefaultPart('capsule'));
    document.getElementById('addPlaneBtn')?.addEventListener('click', () => addDefaultPart('plane'));
    
    // Материалы
    document.getElementById('colorPicker').onchange = (e) => {
        currentColor = e.target.value;
        if (selectedObject && selectedObject.material) {
            selectedObject.material.color.set(currentColor);
            if (selectedObject.userData) selectedObject.userData.color = currentColor;
            saveToHistory();
        }
    };
    document.getElementById('materialSelect').onchange = (e) => {
        currentMaterial = e.target.value;
        applyMaterialToSelected();
    };
    
    // Действия
    document.getElementById('duplicateBtn')?.addEventListener('click', duplicateSelected);
    document.getElementById('deleteBtn')?.addEventListener('click', deleteSelected);
    document.getElementById('groupBtn')?.addEventListener('click', groupSelected);
    document.getElementById('ungroupBtn')?.addEventListener('click', ungroupSelected);
    document.getElementById('undoBtn')?.addEventListener('click', undo);
    document.getElementById('redoBtn')?.addEventListener('click', redo);
    document.getElementById('exportBtn')?.addEventListener('click', exportProject);
    document.getElementById('importBtn')?.addEventListener('click', importProject);
    
    // Тестирование и сохранение
    document.getElementById('playTestBtn').onclick = () => {
        alert('Тестовый режим запущен!');
    };
    document.getElementById('saveGameBtn').onclick = () => saveGame(false);
    document.getElementById('publishGameBtn').onclick = () => saveGame(true);
    document.getElementById('exitEditorBtn').onclick = () => {
        editorActive = false;
        document.getElementById('editorScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        if (window.renderMyProjects) window.renderMyProjects();
        if (window.renderGamesList) window.renderGamesList();
    };
    
    renderExplorer();
}

function applyMaterialToSelected() {
    if (!selectedObject) return;
    let material;
    switch(currentMaterial) {
        case 'metal':
            material = new THREE.MeshStandardMaterial({ color: currentColor, metalness: 0.9, roughness: 0.3 });
            break;
        case 'wood':
            material = new THREE.MeshStandardMaterial({ color: currentColor, roughness: 0.7, metalness: 0.1 });
            break;
        case 'glass':
            material = new THREE.MeshPhysicalMaterial({ color: currentColor, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.6 });
            break;
        default:
            material = new THREE.MeshStandardMaterial({ color: currentColor, metalness: 0, roughness: 0.5 });
    }
    selectedObject.material = material;
    selectedObject.userData.material = currentMaterial;
    saveToHistory();
}

function addDefaultPart(type = 'box') {
    let geometry;
    switch(type) {
        case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
        case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
        case 'cone': geometry = new THREE.ConeGeometry(0.5, 1, 32); break;
        case 'capsule': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
        case 'plane': geometry = new THREE.PlaneGeometry(1, 1); break;
        default: geometry = new THREE.BoxGeometry(1, 1, 1);
    }
    
    const material = new THREE.MeshStandardMaterial({ color: currentColor });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1, 0);
    mesh.userData = { name: `${type}_${Date.now()}`, color: currentColor, type: type, material: 'plastic' };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    scene.add(mesh);
    objects.push(mesh);
    selectObject(mesh);
    renderExplorer();
    saveToHistory();
}

function duplicateSelected() {
    if (!selectedObject) return;
    const clone = selectedObject.clone();
    clone.position.x += 1;
    clone.userData.name = `${selectedObject.userData.name}_copy`;
    scene.add(clone);
    objects.push(clone);
    selectObject(clone);
    renderExplorer();
    saveToHistory();
}

function deleteSelected() {
    if (!selectedObject) return;
    scene.remove(selectedObject);
    objects = objects.filter(obj => obj !== selectedObject);
    if (transformControls.object) transformControls.detach();
    selectedObject = null;
    renderExplorer();
    updateProperties();
    saveToHistory();
}

function groupSelected() {
    const selected = objects.filter(obj => obj === selectedObject);
    if (selected.length < 2) {
        alert('Выберите несколько объектов для группировки');
        return;
    }
    const group = new THREE.Group();
    selected.forEach(obj => {
        group.add(obj);
        objects = objects.filter(o => o !== obj);
    });
    scene.add(group);
    objects.push(group);
    selectObject(group);
    renderExplorer();
    saveToHistory();
}

function ungroupSelected() {
    if (!selectedObject || !selectedObject.isGroup) return;
    const children = [...selectedObject.children];
    selectedObject.clear();
    scene.remove(selectedObject);
    children.forEach(child => {
        scene.add(child);
        objects.push(child);
    });
    objects = objects.filter(obj => obj !== selectedObject);
    selectObject(children[0] || null);
    renderExplorer();
    saveToHistory();
}

function saveToHistory() {
    const state = JSON.parse(JSON.stringify(objects.map(obj => ({
        type: obj.userData.type,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
        color: obj.userData.color,
        name: obj.userData.name
    }))));
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    historyIndex++;
    if (history.length > MAX_HISTORY) {
        history.shift();
        historyIndex--;
    }
}

function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restoreState(history[historyIndex]);
}

function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    restoreState(history[historyIndex]);
}

function restoreState(state) {
    objects.forEach(obj => scene.remove(obj));
    objects = [];
    state.forEach(data => {
        let geometry;
        switch(data.type) {
            case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
            case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
            case 'cone': geometry = new THREE.ConeGeometry(0.5, 1, 32); break;
            default: geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        const material = new THREE.MeshStandardMaterial({ color: data.color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(data.position);
        mesh.rotation.copy(data.rotation);
        mesh.scale.copy(data.scale);
        mesh.userData = data;
        scene.add(mesh);
        objects.push(mesh);
    });
    renderExplorer();
    if (selectedObject && !objects.includes(selectedObject)) {
        selectObject(objects[0] || null);
    }
}

function exportProject() {
    const projectData = {
        objects: objects.map(obj => ({
            type: obj.userData.type,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            color: obj.userData.color,
            name: obj.userData.name
        }))
    };
    const dataStr = JSON.stringify(projectData);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blockverse_project.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                objects.forEach(obj => scene.remove(obj));
                objects = [];
                data.objects.forEach(objData => {
                    let geometry;
                    switch(objData.type) {
                        case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
                        case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
                        default: geometry = new THREE.BoxGeometry(1, 1, 1);
                    }
                    const material = new THREE.MeshStandardMaterial({ color: objData.color });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.copy(objData.position);
                    mesh.rotation.copy(objData.rotation);
                    mesh.scale.copy(objData.scale);
                    mesh.userData = objData;
                    scene.add(mesh);
                    objects.push(mesh);
                });
                renderExplorer();
                saveToHistory();
                alert('Проект импортирован');
            } catch(err) {
                alert('Ошибка импорта');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function selectObject(obj) {
    if (selectedObject === obj) return;
    if (transformControls.object) transformControls.detach();
    selectedObject = obj;
    if (obj) transformControls.attach(obj);
    updateProperties();
    renderExplorer();
}

function updateProperties() {
    if (!propertiesContent) return;
    if (!selectedObject) {
        propertiesContent.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>';
        return;
    }
    
    propertiesContent.innerHTML = `
        <div class="prop-group"><label>Имя</label><input id="propName" value="${selectedObject.userData.name || 'Объект'}"></div>
        <div class="prop-group"><label>Позиция X</label><input id="propPosX" type="number" step="0.1" value="${selectedObject.position.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Y</label><input id="propPosY" type="number" step="0.1" value="${selectedObject.position.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Позиция Z</label><input id="propPosZ" type="number" step="0.1" value="${selectedObject.position.z.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб X</label><input id="propScaleX" type="number" step="0.1" value="${selectedObject.scale.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Y</label><input id="propScaleY" type="number" step="0.1" value="${selectedObject.scale.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Масштаб Z</label><input id="propScaleZ" type="number" step="0.1" value="${selectedObject.scale.z.toFixed(2)}"></div>
        <div class="prop-group"><label>Цвет</label><input id="propColor" type="color" value="${selectedObject.userData.color || '#ffaa44'}"></div>
        <div class="prop-group"><label>Материал</label><select id="propMaterial">
            <option value="plastic" ${selectedObject.userData.material === 'plastic' ? 'selected' : ''}>Пластик</option>
            <option value="metal" ${selectedObject.userData.material === 'metal' ? 'selected' : ''}>Металл</option>
            <option value="wood" ${selectedObject.userData.material === 'wood' ? 'selected' : ''}>Дерево</option>
            <option value="glass" ${selectedObject.userData.material === 'glass' ? 'selected' : ''}>Стекло</option>
        </select></div>
        <button id="applyPropsBtn" style="background:#ff5722; border:none; padding:6px; border-radius:4px; color:white; width:100%; margin-top:8px;">Применить</button>
    `;
    
    document.getElementById('propName').onchange = () => {
        selectedObject.userData.name = document.getElementById('propName').value;
        renderExplorer();
        saveToHistory();
    };
    document.getElementById('propPosX').onchange = () => {
        selectedObject.position.x = parseFloat(document.getElementById('propPosX').value);
        saveToHistory();
    };
    document.getElementById('propPosY').onchange = () => {
        selectedObject.position.y = parseFloat(document.getElementById('propPosY').value);
        saveToHistory();
    };
    document.getElementById('propPosZ').onchange = () => {
        selectedObject.position.z = parseFloat(document.getElementById('propPosZ').value);
        saveToHistory();
    };
    document.getElementById('propScaleX').onchange = () => {
        selectedObject.scale.x = parseFloat(document.getElementById('propScaleX').value);
        saveToHistory();
    };
    document.getElementById('propScaleY').onchange = () => {
        selectedObject.scale.y = parseFloat(document.getElementById('propScaleY').value);
        saveToHistory();
    };
    document.getElementById('propScaleZ').onchange = () => {
        selectedObject.scale.z = parseFloat(document.getElementById('propScaleZ').value);
        saveToHistory();
    };
    document.getElementById('propColor').onchange = () => {
        selectedObject.userData.color = document.getElementById('propColor').value;
        selectedObject.material.color.set(selectedObject.userData.color);
        saveToHistory();
    };
    document.getElementById('propMaterial').onchange = () => {
        selectedObject.userData.material = document.getElementById('propMaterial').value;
        applyMaterialToSelected();
        saveToHistory();
    };
    document.getElementById('applyPropsBtn').onclick = () => {
        selectedObject.position.set(
            parseFloat(document.getElementById('propPosX').value),
            parseFloat(document.getElementById('propPosY').value),
            parseFloat(document.getElementById('propPosZ').value)
        );
        selectedObject.scale.set(
            parseFloat(document.getElementById('propScaleX').value),
            parseFloat(document.getElementById('propScaleY').value),
            parseFloat(document.getElementById('propScaleZ').value)
        );
        saveToHistory();
    };
}

function renderExplorer() {
    if (!explorerTree) return;
    explorerTree.innerHTML = '';
    
    objects.forEach(obj => {
        const div = document.createElement('div');
        div.className = 'explorer-item';
        if (selectedObject === obj) div.classList.add('selected');
        let icon = '🧱';
        if (obj.userData.type === 'sphere') icon = '⚪';
        else if (obj.userData.type === 'cylinder') icon = '📦';
        else if (obj.userData.type === 'cone') icon = '🔺';
        div.innerHTML = `<span class="icon">${icon}</span><span class="name">${obj.userData.name || 'Объект'}</span>`;
        div.onclick = (e) => {
            e.stopPropagation();
            selectObject(obj);
        };
        explorerTree.appendChild(div);
    });
}

async function saveGame(isPublished = false) {
    if (!window.currentUser) {
        alert('Вы не авторизованы');
        return;
    }
    const gameName = prompt('Название игры:', currentGameId ? 'Моя игра' : 'Новая игра');
    if (!gameName) return;
    const description = prompt('Описание игры:', '');
    
    const gameData = {
        blocks: objects.map(obj => ({
            type: obj.userData.type || 'box',
            name: obj.userData.name,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            color: obj.userData.color || '#ffaa44',
            material: obj.userData.material || 'plastic'
        }))
    };
    
    let result;
    if (currentGameId && !isPublished) {
        result = await API.updateGame(currentGameId, gameName, description, gameData);
    } else {
        result = await API.saveGame(gameName, window.currentUser.username, gameData, description);
        if (result.id) currentGameId = result.id;
    }
    
    if (result.success || result.id) {
        alert(isPublished ? 'Игра опубликована!' : 'Игра сохранена!');
        if (window.renderMyProjects) window.renderMyProjects();
    } else {
        alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
    }
}

// Экспорт функции openEditor
export function openEditor(gameToEdit = null) {
    currentGameId = gameToEdit?.id || null;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');
    init();
    if (gameToEdit && gameToEdit.data && gameToEdit.data.blocks) {
        gameToEdit.data.blocks.forEach(block => {
            let geometry;
            switch(block.type) {
                case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
                case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
                case 'cone': geometry = new THREE.ConeGeometry(0.5, 1, 32); break;
                default: geometry = new THREE.BoxGeometry(1, 1, 1);
            }
            let material;
            switch(block.material) {
                case 'metal':
                    material = new THREE.MeshStandardMaterial({ color: block.color, metalness: 0.9, roughness: 0.3 });
                    break;
                case 'wood':
                    material = new THREE.MeshStandardMaterial({ color: block.color, roughness: 0.7, metalness: 0.1 });
                    break;
                case 'glass':
                    material = new THREE.MeshPhysicalMaterial({ color: block.color, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.6 });
                    break;
                default:
                    material = new THREE.MeshStandardMaterial({ color: block.color });
            }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(block.position);
            mesh.rotation.copy(block.rotation);
            mesh.scale.copy(block.scale);
            mesh.userData = block;
            scene.add(mesh);
            objects.push(mesh);
        });
        renderExplorer();
        saveToHistory();
    }
            }
