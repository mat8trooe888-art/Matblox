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
    if (!container) {
        console.error('Container not found');
        return;
    }
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
    const explorerTree = document.getElementById('explorerTree');
    const propertiesContent = document.getElementById('propertiesContent');
    
    if (!explorerTree || !propertiesContent) {
        console.error('UI elements not found');
        return;
    }
    
    // Функции для UI
    window.renderExplorer = function() {
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
    };
    
    window.updateProperties = function() {
        if (!propertiesContent) return;
        if (!selectedObject) {
            propertiesContent.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>';
            return;
        }
        
        propertiesContent.innerHTML = `
            <div class="prop-group"><label>Имя</label><input id="propName" value="${escapeHtml(selectedObject.userData.name || 'Объект')}"></div>
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
        
        const propName = document.getElementById('propName');
        const propPosX = document.getElementById('propPosX');
        const propPosY = document.getElementById('propPosY');
        const propPosZ = document.getElementById('propPosZ');
        const propScaleX = document.getElementById('propScaleX');
        const propScaleY = document.getElementById('propScaleY');
        const propScaleZ = document.getElementById('propScaleZ');
        const propColor = document.getElementById('propColor');
        const propMaterial = document.getElementById('propMaterial');
        const applyBtn = document.getElementById('applyPropsBtn');
        
        if (propName) propName.onchange = () => { selectedObject.userData.name = propName.value; window.renderExplorer(); saveToHistory(); };
        if (propPosX) propPosX.onchange = () => { selectedObject.position.x = parseFloat(propPosX.value); saveToHistory(); };
        if (propPosY) propPosY.onchange = () => { selectedObject.position.y = parseFloat(propPosY.value); saveToHistory(); };
        if (propPosZ) propPosZ.onchange = () => { selectedObject.position.z = parseFloat(propPosZ.value); saveToHistory(); };
        if (propScaleX) propScaleX.onchange = () => { selectedObject.scale.x = parseFloat(propScaleX.value); saveToHistory(); };
        if (propScaleY) propScaleY.onchange = () => { selectedObject.scale.y = parseFloat(propScaleY.value); saveToHistory(); };
        if (propScaleZ) propScaleZ.onchange = () => { selectedObject.scale.z = parseFloat(propScaleZ.value); saveToHistory(); };
        if (propColor) propColor.onchange = () => {
            selectedObject.userData.color = propColor.value;
            selectedObject.material.color.set(selectedObject.userData.color);
            saveToHistory();
        };
        if (propMaterial) propMaterial.onchange = () => {
            selectedObject.userData.material = propMaterial.value;
            applyMaterialToSelected();
            saveToHistory();
        };
        if (applyBtn) applyBtn.onclick = () => {
            selectedObject.position.set(
                parseFloat(propPosX?.value || 0),
                parseFloat(propPosY?.value || 0),
                parseFloat(propPosZ?.value || 0)
            );
            selectedObject.scale.set(
                parseFloat(propScaleX?.value || 1),
                parseFloat(propScaleY?.value || 1),
                parseFloat(propScaleZ?.value || 1)
            );
            saveToHistory();
        };
    };
    
    // Привязка кнопок
    const modeMoveBtn = document.getElementById('modeMoveBtn');
    const modeRotateBtn = document.getElementById('modeRotateBtn');
    const modeScaleBtn = document.getElementById('modeScaleBtn');
    const addPartBtn = document.getElementById('addPartBtn');
    const addSphereBtn = document.getElementById('addSphereBtn');
    const addCylinderBtn = document.getElementById('addCylinderBtn');
    const addConeBtn = document.getElementById('addConeBtn');
    const addPlaneBtn = document.getElementById('addPlaneBtn');
    const duplicateBtn = document.getElementById('duplicateBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const groupBtn = document.getElementById('groupBtn');
    const ungroupBtn = document.getElementById('ungroupBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const colorPicker = document.getElementById('colorPicker');
    const materialSelect = document.getElementById('materialSelect');
    const playTestBtn = document.getElementById('playTestBtn');
    const saveGameBtn = document.getElementById('saveGameBtn');
    const publishGameBtn = document.getElementById('publishGameBtn');
    const exitEditorBtn = document.getElementById('exitEditorBtn');
    
    if (modeMoveBtn) modeMoveBtn.onclick = () => { transformControls.setMode('translate'); };
    if (modeRotateBtn) modeRotateBtn.onclick = () => { transformControls.setMode('rotate'); };
    if (modeScaleBtn) modeScaleBtn.onclick = () => { transformControls.setMode('scale'); };
    if (addPartBtn) addPartBtn.onclick = () => addDefaultPart('box');
    if (addSphereBtn) addSphereBtn.onclick = () => addDefaultPart('sphere');
    if (addCylinderBtn) addCylinderBtn.onclick = () => addDefaultPart('cylinder');
    if (addConeBtn) addConeBtn.onclick = () => addDefaultPart('cone');
    if (addPlaneBtn) addPlaneBtn.onclick = () => addDefaultPart('plane');
    if (duplicateBtn) duplicateBtn.onclick = () => duplicateSelected();
    if (deleteBtn) deleteBtn.onclick = () => deleteSelected();
    if (groupBtn) groupBtn.onclick = () => groupSelected();
    if (ungroupBtn) ungroupBtn.onclick = () => ungroupSelected();
    if (undoBtn) undoBtn.onclick = () => undo();
    if (redoBtn) redoBtn.onclick = () => redo();
    if (exportBtn) exportBtn.onclick = () => exportProject();
    if (importBtn) importBtn.onclick = () => importProject();
    if (colorPicker) colorPicker.onchange = (e) => {
        currentColor = e.target.value;
        if (selectedObject && selectedObject.material) {
            selectedObject.material.color.set(currentColor);
            if (selectedObject.userData) selectedObject.userData.color = currentColor;
            saveToHistory();
        }
    };
    if (materialSelect) materialSelect.onchange = (e) => {
        currentMaterial = e.target.value;
        applyMaterialToSelected();
    };
    if (playTestBtn) playTestBtn.onclick = () => alert('Тестовый режим запущен!');
    if (saveGameBtn) saveGameBtn.onclick = () => saveGame(false);
    if (publishGameBtn) publishGameBtn.onclick = () => saveGame(true);
    if (exitEditorBtn) exitEditorBtn.onclick = () => {
        editorActive = false;
        document.getElementById('editorScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        if (window.renderMyProjects) window.renderMyProjects();
        if (window.renderGamesList) window.renderGamesList();
    };
    
    window.renderExplorer();
    window.updateProperties();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
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
    window.renderExplorer();
    saveToHistory();
}

function selectObject(obj) {
    if (selectedObject === obj) return;
    if (transformControls.object) transformControls.detach();
    selectedObject = obj;
    if (obj) transformControls.attach(obj);
    window.updateProperties();
    window.renderExplorer();
}

function duplicateSelected() {
    if (!selectedObject) return;
    const clone = selectedObject.clone();
    clone.position.x += 1;
    clone.userData.name = `${selectedObject.userData.name}_copy`;
    scene.add(clone);
    objects.push(clone);
    selectObject(clone);
    window.renderExplorer();
    saveToHistory();
}

function deleteSelected() {
    if (!selectedObject) return;
    scene.remove(selectedObject);
    objects = objects.filter(obj => obj !== selectedObject);
    if (transformControls.object) transformControls.detach();
    selectedObject = null;
    window.renderExplorer();
    window.updateProperties();
    saveToHistory();
}

function groupSelected() {
    if (!selectedObject) {
        alert('Выберите объект для группировки');
        return;
    }
    const group = new THREE.Group();
    const selected = [...objects.filter(obj => obj === selectedObject)];
    if (selected.length === 0) return;
    selected.forEach(obj => {
        group.add(obj);
        objects = objects.filter(o => o !== obj);
    });
    scene.add(group);
    objects.push(group);
    selectObject(group);
    window.renderExplorer();
    saveToHistory();
}

function ungroupSelected() {
    if (!selectedObject || !selectedObject.isGroup) {
        alert('Выберите группу для разгруппировки');
        return;
    }
    const children = [...selectedObject.children];
    selectedObject.clear();
    scene.remove(selectedObject);
    children.forEach(child => {
        scene.add(child);
        objects.push(child);
    });
    objects = objects.filter(obj => obj !== selectedObject);
    selectObject(children[0] || null);
    window.renderExplorer();
    saveToHistory();
}

function saveToHistory() {
    const state = objects.map(obj => ({
        type: obj.userData.type,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
        color: obj.userData.color,
        name: obj.userData.name,
        material: obj.userData.material
    }));
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
    if (!state || !Array.isArray(state)) return;
    objects.forEach(obj => scene.remove(obj));
    objects = [];
    state.forEach(data => {
        if (!data) return;
        let geometry;
        switch(data.type) {
            case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
            case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
            case 'cone': geometry = new THREE.ConeGeometry(0.5, 1, 32); break;
            case 'plane': geometry = new THREE.PlaneGeometry(1, 1); break;
            default: geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        let material;
        switch(data.material) {
            case 'metal':
                material = new THREE.MeshStandardMaterial({ color: data.color, metalness: 0.9, roughness: 0.3 });
                break;
            case 'wood':
                material = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.7, metalness: 0.1 });
                break;
            case 'glass':
                material = new THREE.MeshPhysicalMaterial({ color: data.color, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.6 });
                break;
            default:
                material = new THREE.MeshStandardMaterial({ color: data.color });
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(data.position);
        mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        mesh.scale.copy(data.scale);
        mesh.userData = data;
        scene.add(mesh);
        objects.push(mesh);
    });
    window.renderExplorer();
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
            name: obj.userData.name,
            material: obj.userData.material
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
                if (!data.objects || !Array.isArray(data.objects)) {
                    throw new Error('Invalid project file');
                }
                objects.forEach(obj => scene.remove(obj));
                objects = [];
                data.objects.forEach(objData => {
                    let geometry;
                    switch(objData.type) {
                        case 'sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
                        case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
                        case 'cone': geometry = new THREE.ConeGeometry(0.5, 1, 32); break;
                        default: geometry = new THREE.BoxGeometry(1, 1, 1);
                    }
                    let material;
                    switch(objData.material) {
                        case 'metal':
                            material = new THREE.MeshStandardMaterial({ color: objData.color, metalness: 0.9, roughness: 0.3 });
                            break;
                        case 'wood':
                            material = new THREE.MeshStandardMaterial({ color: objData.color, roughness: 0.7, metalness: 0.1 });
                            break;
                        case 'glass':
                            material = new THREE.MeshPhysicalMaterial({ color: objData.color, metalness: 0, roughness: 0.1, transparent: true, opacity: 0.6 });
                            break;
                        default:
                            material = new THREE.MeshStandardMaterial({ color: objData.color });
                    }
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.copy(objData.position);
                    mesh.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z);
                    mesh.scale.copy(objData.scale);
                    mesh.userData = objData;
                    scene.add(mesh);
                    objects.push(mesh);
                });
                window.renderExplorer();
                saveToHistory();
                alert('Проект импортирован');
            } catch(err) {
                alert('Ошибка импорта: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
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

// ========== ЭКСПОРТ ФУНКЦИИ ==========
export function openEditor(gameToEdit = null) {
    console.log('openEditor called');
    currentGameId = gameToEdit?.id || null;
    const mainMenu = document.getElementById('mainMenuScreen');
    const editorScreen = document.getElementById('editorScreen');
    if (mainMenu) mainMenu.classList.add('hidden');
    if (editorScreen) editorScreen.classList.remove('hidden');
    init();
    if (gameToEdit && gameToEdit.data && gameToEdit.data.blocks && Array.isArray(gameToEdit.data.blocks)) {
        gameToEdit.data.blocks.forEach(block => {
            if (!block) return;
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
            mesh.rotation.set(block.rotation.x, block.rotation.y, block.rotation.z);
            mesh.scale.copy(block.scale);
            mesh.userData = block;
            scene.add(mesh);
            objects.push(mesh);
        });
        window.renderExplorer();
        saveToHistory();
    }
    }
