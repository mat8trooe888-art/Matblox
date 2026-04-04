import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as API from './api.js';

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorObjects = [];
let selectedObjects = [];
let currentTransformMode = 'translate';
let currentColor = '#ffaa44';
let editorActive = false;
let editorAnimationId = null;
let currentGameId = null;

// ========== ЭЛЕМЕНТЫ ИНТЕРФЕЙСА ==========
let explorerTree, propertiesContent, outputContent;

// ========== ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ==========
function initLayout() {
    // Загрузка сохранённых размеров
    const savedLayout = localStorage.getItem('blockverse_layout');
    if (savedLayout) {
        const layout = JSON.parse(savedLayout);
        if (layout.leftWidth) document.getElementById('leftDock').style.width = layout.leftWidth;
        if (layout.rightWidth) document.getElementById('rightDock').style.width = layout.rightWidth;
        if (layout.bottomHeight) document.getElementById('bottomDock').style.height = layout.bottomHeight;
    }
    initResizers();
    initMenu();
    initRibbon();
    initToolbox();
    initExplorerProperties();
    initOutputCommand();
    init3DViewport();
}

function initResizers() {
    const leftResizer = document.getElementById('leftResizer');
    const rightResizer = document.getElementById('rightResizer');
    const bottomResizer = document.getElementById('bottomResizer');
    const leftDock = document.getElementById('leftDock');
    const rightDock = document.getElementById('rightDock');
    const bottomDock = document.getElementById('bottomDock');

    let startX, startWidth;
    leftResizer.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = leftDock.offsetWidth;
        document.addEventListener('mousemove', onMouseMoveLeft);
        document.addEventListener('mouseup', onMouseUpLeft);
    });
    function onMouseMoveLeft(e) {
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth >= 150 && newWidth <= 500) {
            leftDock.style.width = newWidth + 'px';
            saveLayout();
        }
    }
    function onMouseUpLeft() {
        document.removeEventListener('mousemove', onMouseMoveLeft);
        document.removeEventListener('mouseup', onMouseUpLeft);
    }

    rightResizer.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = rightDock.offsetWidth;
        document.addEventListener('mousemove', onMouseMoveRight);
        document.addEventListener('mouseup', onMouseUpRight);
    });
    function onMouseMoveRight(e) {
        const newWidth = startWidth - (e.clientX - startX);
        if (newWidth >= 200 && newWidth <= 600) {
            rightDock.style.width = newWidth + 'px';
            saveLayout();
        }
    }
    function onMouseUpRight() {
        document.removeEventListener('mousemove', onMouseMoveRight);
        document.removeEventListener('mouseup', onMouseUpRight);
    }

    let startY, startHeight;
    bottomResizer.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = bottomDock.offsetHeight;
        document.addEventListener('mousemove', onMouseMoveBottom);
        document.addEventListener('mouseup', onMouseUpBottom);
    });
    function onMouseMoveBottom(e) {
        const newHeight = startHeight - (e.clientY - startY);
        if (newHeight >= 80 && newHeight <= 400) {
            bottomDock.style.height = newHeight + 'px';
            saveLayout();
        }
    }
    function onMouseUpBottom() {
        document.removeEventListener('mousemove', onMouseMoveBottom);
        document.removeEventListener('mouseup', onMouseUpBottom);
    }
}

function saveLayout() {
    const layout = {
        leftWidth: document.getElementById('leftDock').style.width,
        rightWidth: document.getElementById('rightDock').style.width,
        bottomHeight: document.getElementById('bottomDock').style.height
    };
    localStorage.setItem('blockverse_layout', JSON.stringify(layout));
}

function initMenu() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const action = item.textContent.toLowerCase();
            if (action === 'file') alert('Новый проект');
            else if (action === 'edit') alert('Открыть проект');
            else if (action === 'view') alert('Сохранить');
            else if (action === 'insert') addDefaultBlock();
            else if (action === 'test') alert('Тестирование');
            else if (action === 'resetlayout') resetLayout();
        });
    });
}

function resetLayout() {
    localStorage.removeItem('blockverse_layout');
    location.reload();
}

function initRibbon() {
    const tabs = document.querySelectorAll('.ribbon-tab');
    const contents = document.querySelectorAll('.ribbon-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            contents.forEach(c => c.classList.add('hidden'));
            document.getElementById(`ribbon${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.remove('hidden');
        });
    });
    document.getElementById('modeMoveBtn').onclick = () => { if (transformControls) transformControls.setMode('translate'); };
    document.getElementById('modeRotateBtn').onclick = () => { if (transformControls) transformControls.setMode('rotate'); };
    document.getElementById('modeScaleBtn').onclick = () => { if (transformControls) transformControls.setMode('scale'); };
    document.getElementById('addPartBtn').onclick = () => addDefaultBlock('box');
    document.getElementById('addSphereBtn').onclick = () => addDefaultBlock('sphere');
    document.getElementById('addCylinderBtn').onclick = () => addDefaultBlock('cylinder');
    document.getElementById('colorPicker').onchange = (e) => { currentColor = e.target.value; if (selectedObjects[0] && selectedObjects[0].material) selectedObjects[0].material.color.set(currentColor); };
}

function initToolbox() {
    const cats = document.querySelectorAll('.toolbox-cat');
    const contents = {
        marketplace: document.getElementById('toolboxMarketplace'),
        inventory: document.getElementById('toolboxInventory'),
        recent: document.getElementById('toolboxRecent'),
        creations: document.getElementById('toolboxCreations')
    };
    cats.forEach(cat => {
        cat.addEventListener('click', () => {
            cats.forEach(c => c.classList.remove('active'));
            cat.classList.add('active');
            Object.values(contents).forEach(c => c.classList.add('hidden'));
            contents[cat.dataset.cat].classList.remove('hidden');
        });
    });
    document.querySelectorAll('.asset-item').forEach(asset => {
        asset.addEventListener('click', () => {
            const type = asset.dataset.asset;
            if (type === 'cube') addDefaultBlock('box');
            if (type === 'sphere') addDefaultBlock('sphere');
            if (type === 'lamp') addDefaultBlock('cylinder');
        });
    });
}

function initExplorerProperties() {
    explorerTree = document.getElementById('explorerTree');
    propertiesContent = document.getElementById('propertiesContent');
    document.getElementById('explorerSearch').addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        document.querySelectorAll('.explorer-item').forEach(el => {
            const name = el.textContent.toLowerCase();
            el.style.display = name.includes(search) ? 'flex' : 'none';
        });
    });
    document.getElementById('explorerTabBtn').onclick = () => {
        document.getElementById('explorerPanel').style.display = 'flex';
        document.getElementById('propertiesPanel').style.display = 'none';
        document.getElementById('explorerTabBtn').style.background = '#0e639c';
        document.getElementById('propertiesTabBtn').style.background = '';
    };
    document.getElementById('propertiesTabBtn').onclick = () => {
        document.getElementById('explorerPanel').style.display = 'none';
        document.getElementById('propertiesPanel').style.display = 'flex';
        document.getElementById('propertiesTabBtn').style.background = '#0e639c';
        document.getElementById('explorerTabBtn').style.background = '';
    };
}

function initOutputCommand() {
    outputContent = document.getElementById('outputContent');
    const commandInput = document.getElementById('commandInput');
    commandInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const cmd = commandInput.value;
            addOutputMessage(`> ${cmd}`);
            addOutputMessage(`Результат: команда "${cmd}" выполнена (заглушка)`);
            commandInput.value = '';
        }
    });
    document.getElementById('clearOutputBtn').onclick = () => { outputContent.innerHTML = ''; };
}

function addOutputMessage(msg, type = 'info') {
    const div = document.createElement('div');
    div.style.color = type === 'error' ? '#ff6666' : '#88ff88';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    outputContent.appendChild(div);
    outputContent.scrollTop = outputContent.scrollHeight;
}

// ========== 3D СЦЕНА И ОБЪЕКТЫ ==========
function init3DViewport() {
    const container = document.getElementById('editorCanvasContainer');
    container.innerHTML = '';
    editorScene = new THREE.Scene();
    editorScene.background = new THREE.Color(0x1a1d24);
    editorScene.fog = new THREE.FogExp2(0x1a1d24, 0.008);
    editorCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
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
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    editorScene.add(dirLight);
    const fillLight = new THREE.PointLight(0x4466cc, 0.5);
    fillLight.position.set(2, 3, 4);
    editorScene.add(fillLight);
    const gridHelper = new THREE.GridHelper(100, 20, 0x88aaff, 0x335588);
    editorScene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    editorScene.add(axesHelper);
    document.getElementById('toggleGridBtn').onclick = () => { gridHelper.visible = !gridHelper.visible; };
    document.getElementById('toggleWireframeBtn').onclick = () => {
        editorObjects.forEach(obj => {
            if (obj.material) obj.material.wireframe = !obj.material.wireframe;
        });
    };

    addDefaultBlock('box');
    renderExplorer();

    function animate() {
        if (!editorActive) return;
        editorAnimationId = requestAnimationFrame(animate);
        editorControls.update();
        editorRenderer.render(editorScene, editorCamera);
    }
    editorActive = true;
    animate();
    window.addEventListener('resize', () => {
        editorCamera.aspect = container.clientWidth / container.clientHeight;
        editorCamera.updateProjectionMatrix();
        editorRenderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function addDefaultBlock(shape = 'box') {
    let geometry;
    if (shape === 'sphere') geometry = new THREE.SphereGeometry(0.5, 32, 32);
    else if (shape === 'cylinder') geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    else geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: currentColor });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1, 0);
    mesh.userData = { name: `Block_${Date.now()}`, color: currentColor };
    editorScene.add(mesh);
    editorObjects.push(mesh);
    renderExplorer();
    selectObject(mesh);
}

function selectObject(obj) {
    clearSelection();
    selectedObjects = [obj];
    if (transformControls) transformControls.attach(obj);
    updatePropertiesPanel();
    renderExplorer();
}

function clearSelection() {
    if (transformControls && transformControls.object) transformControls.detach();
    selectedObjects = [];
    updatePropertiesPanel();
    renderExplorer();
}

function renderExplorer() {
    if (!explorerTree) return;
    explorerTree.innerHTML = '';
    editorObjects.forEach(obj => {
        const div = document.createElement('div');
        div.className = 'explorer-item';
        if (selectedObjects.includes(obj)) div.classList.add('selected');
        div.innerHTML = `<span class="icon">🧱</span><span class="name">${obj.userData.name || 'Object'}</span>`;
        div.onclick = (e) => {
            e.stopPropagation();
            selectObject(obj);
        };
        explorerTree.appendChild(div);
    });
}

function updatePropertiesPanel() {
    if (!propertiesContent) return;
    if (selectedObjects.length === 0) {
        propertiesContent.innerHTML = '<div style="color:#aaa;">Ничего не выбрано</div>';
        return;
    }
    const obj = selectedObjects[0];
    propertiesContent.innerHTML = `
        <div class="prop-group"><label>Name</label><input id="propName" value="${obj.userData.name || ''}"></div>
        <div class="prop-group"><label>Position X</label><input id="propPosX" type="number" step="0.1" value="${obj.position.x.toFixed(2)}"></div>
        <div class="prop-group"><label>Position Y</label><input id="propPosY" type="number" step="0.1" value="${obj.position.y.toFixed(2)}"></div>
        <div class="prop-group"><label>Position Z</label><input id="propPosZ" type="number" step="0.1" value="${obj.position.z.toFixed(2)}"></div>
        <div class="prop-group"><label>Color</label><input id="propColor" type="color" value="${obj.userData.color || '#ffaa44'}"></div>
        <button id="applyPropsBtn">Apply</button>
    `;
    document.getElementById('propName').onchange = () => { obj.userData.name = document.getElementById('propName').value; renderExplorer(); };
    document.getElementById('propPosX').onchange = () => { obj.position.x = parseFloat(document.getElementById('propPosX').value); };
    document.getElementById('propPosY').onchange = () => { obj.position.y = parseFloat(document.getElementById('propPosY').value); };
    document.getElementById('propPosZ').onchange = () => { obj.position.z = parseFloat(document.getElementById('propPosZ').value); };
    document.getElementById('propColor').onchange = () => { obj.userData.color = document.getElementById('propColor').value; obj.material.color.set(obj.userData.color); };
    document.getElementById('applyPropsBtn').onclick = () => {
        obj.position.set(
            parseFloat(document.getElementById('propPosX').value),
            parseFloat(document.getElementById('propPosY').value),
            parseFloat(document.getElementById('propPosZ').value)
        );
    };
}

// ========== СОХРАНЕНИЕ И ПУБЛИКАЦИЯ ==========
async function saveGame(isPublished = false) {
    if (!window.currentUser) { alert('Не авторизован'); return; }
    const gameName = prompt('Название игры:', currentGameId ? 'Моя игра' : 'Новая игра');
    if (!gameName) return;
    const description = prompt('Описание игры:', '');
    const gameData = {
        blocks: editorObjects.map(obj => ({
            type: 'block',
            name: obj.userData.name,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            userData: obj.userData
        }))
    };
    let result;
    if (currentGameId && !isPublished) result = await API.updateGame(currentGameId, gameName, description, gameData);
    else result = await API.saveGame(gameName, window.currentUser.username, gameData, description);
    if (result.success || result.id) {
        alert(isPublished ? 'Игра опубликована!' : 'Игра сохранена!');
    } else alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
}

// ========== ЗАГРУЗКА ШАБЛОНОВ ==========
function loadTemplate(template) {
    // Очистка сцены
    editorObjects.forEach(obj => editorScene.remove(obj));
    editorObjects = [];
    if (template === 'platformer') {
        const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 30), new THREE.MeshStandardMaterial({ color: 0x6B8E23 }));
        ground.position.y = -0.5;
        ground.userData = { name: 'Ground' };
        editorScene.add(ground);
        editorObjects.push(ground);
        for (let i = -3; i <= 3; i++) {
            const plat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0xaa8866 }));
            plat.position.set(i * 2.5, 0.5 + Math.abs(i) * 0.5, 0);
            plat.userData = { name: `Platform_${i}` };
            editorScene.add(plat);
            editorObjects.push(plat);
        }
    } else if (template === 'racing') {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const road = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
            road.position.set(Math.cos(angle) * 8, -0.3, Math.sin(angle) * 8);
            road.userData = { name: `Road_${i}` };
            editorScene.add(road);
            editorObjects.push(road);
        }
    } else if (template === 'rpg') {
        const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), new THREE.MeshStandardMaterial({ color: 0x4a7a4a }));
        ground.position.y = -0.5;
        ground.userData = { name: 'Grass' };
        editorScene.add(ground);
        editorObjects.push(ground);
        const house = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), new THREE.MeshStandardMaterial({ color: 0xaa8866 }));
        house.position.set(6, 0, 6);
        house.userData = { name: 'House' };
        editorScene.add(house);
        editorObjects.push(house);
    }
    renderExplorer();
}

// ========== ЭКСПОРТ ФУНКЦИИ ОТКРЫТИЯ РЕДАКТОРА ==========
export function openEditor(gameToEdit = null) {
    currentGameId = gameToEdit?.id || null;
    document.getElementById('startPage').classList.add('hidden');
    document.getElementById('studioScreen').classList.remove('hidden');
    initLayout();
    if (gameToEdit && gameToEdit.data) {
        gameToEdit.data.blocks.forEach(block => {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: block.userData.color });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(block.position);
            mesh.userData = block.userData;
            editorScene.add(mesh);
            editorObjects.push(mesh);
        });
        renderExplorer();
    }
}

// Стартовая страница – шаблоны
document.getElementById('newEmptyProjectBtn').onclick = () => {
    document.getElementById('startPage').classList.add('hidden');
    document.getElementById('studioScreen').classList.remove('hidden');
    initLayout();
};
document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
        const template = card.dataset.template;
        document.getElementById('startPage').classList.add('hidden');
        document.getElementById('studioScreen').classList.remove('hidden');
        initLayout();
        loadTemplate(template);
    });
});
document.getElementById('playBtn').onclick = () => addOutputMessage('Игровой режим запущен (симуляция)');
document.getElementById('stopBtn').onclick = () => addOutputMessage('Игровой режим остановлен');
document.getElementById('assistantBtn').onclick = () => alert('AI-помощник в разработке');
