import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as API from './api.js';

// ========== ПЕРЕМЕННЫЕ ==========
let scene, camera, renderer, controls, transformControls;
let objects = [];
let selectedObject = null;
let currentColor = '#ffaa44';
let currentGameId = null;

// ========== ЭЛЕМЕНТЫ UI ==========
let explorerTree, propertiesContent;

// ========== ИНИЦИАЛИЗАЦИЯ ==========
function init() {
    init3D();
    initUI();
    addDefaultPart('box');
}

function init3D() {
    const container = document.getElementById('editorCanvasContainer');
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
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
    
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function initUI() {
    explorerTree = document.getElementById('explorerTree');
    propertiesContent = document.getElementById('propertiesContent');
    
    // Инструменты
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
    
    document.getElementById('addPartBtn').onclick = () => addDefaultPart('box');
    document.getElementById('addSphereBtn').onclick = () => addDefaultPart('sphere');
    document.getElementById('addCylinderBtn').onclick = () => addDefaultPart('cylinder');
    
    document.getElementById('colorPicker').onchange = (e) => {
        currentColor = e.target.value;
        if (selectedObject && selectedObject.material) {
            selectedObject.material.color.set(currentColor);
            if (selectedObject.userData) selectedObject.userData.color = currentColor;
        }
    };
    
    document.getElementById('playTestBtn').onclick = () => {
        alert('Тестовый режим запущен!');
    };
    
    document.getElementById('saveGameBtn').onclick = () => saveGame(false);
    document.getElementById('publishGameBtn').onclick = () => saveGame(true);
    document.getElementById('exitEditorBtn').onclick = () => {
        document.getElementById('editorScreen').classList.add('hidden');
        document.getElementById('mainMenuScreen').classList.remove('hidden');
        if (window.renderMyProjects) window.renderMyProjects();
        if (window.renderGamesList) window.renderGamesList();
    };
    
    renderExplorer();
}

function addDefaultPart(type = 'box') {
    let geometry;
    if (type === 'sphere') geometry = new THREE.SphereGeometry(0.5, 32, 32);
    else if (type === 'cylinder') geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    else geometry = new THREE.BoxGeometry(1, 1, 1);
    
    const material = new THREE.MeshStandardMaterial({ color: currentColor });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1, 0);
    mesh.userData = { name: `${type}_${Date.now()}`, color: currentColor, type: type };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    scene.add(mesh);
    objects.push(mesh);
    selectObject(mesh);
    renderExplorer();
}

function selectObject(obj) {
    if (selectedObject === obj) return;
    
    if (transformControls.object) transformControls.detach();
    selectedObject = obj;
    transformControls.attach(obj);
    updateProperties();
    renderExplorer();
}

function updateProperties() {
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
        <button id="applyPropsBtn" style="background:#ff5722; border:none; padding:6px; border-radius:4px; color:white; width:100%; margin-top:8px;">Применить</button>
    `;
    
    document.getElementById('propName').onchange = () => {
        selectedObject.userData.name = document.getElementById('propName').value;
        renderExplorer();
    };
    document.getElementById('propPosX').onchange = () => selectedObject.position.x = parseFloat(document.getElementById('propPosX').value);
    document.getElementById('propPosY').onchange = () => selectedObject.position.y = parseFloat(document.getElementById('propPosY').value);
    document.getElementById('propPosZ').onchange = () => selectedObject.position.z = parseFloat(document.getElementById('propPosZ').value);
    document.getElementById('propScaleX').onchange = () => selectedObject.scale.x = parseFloat(document.getElementById('propScaleX').value);
    document.getElementById('propScaleY').onchange = () => selectedObject.scale.y = parseFloat(document.getElementById('propScaleY').value);
    document.getElementById('propScaleZ').onchange = () => selectedObject.scale.z = parseFloat(document.getElementById('propScaleZ').value);
    document.getElementById('propColor').onchange = () => {
        selectedObject.userData.color = document.getElementById('propColor').value;
        selectedObject.material.color.set(selectedObject.userData.color);
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
    };
}

function renderExplorer() {
    if (!explorerTree) return;
    explorerTree.innerHTML = '';
    
    objects.forEach(obj => {
        const div = document.createElement('div');
        div.className = 'explorer-item';
        if (selectedObject === obj) div.classList.add('selected');
        const icon = obj.userData.type === 'sphere' ? '⚪' : (obj.userData.type === 'cylinder' ? '📦' : '🧱');
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
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            color: obj.userData.color || '#ffaa44'
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

// Запуск
init();
