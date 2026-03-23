// editor.js — конструктор (загружается динамически)
import * as THREE from 'three';

// Импортируем глобальные функции и данные из основного скрипта (они доступны через window)
const { currentUser, customGames, saveGames, renderMyProjects } = window;

let editorScene, editorCamera, editorRenderer;
let editorBlocks = [];
let selectedBlock = null;
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

// Вспомогательные функции (скопированы из исходного редактора)
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
    return mesh;
}

function selectBlock(block) {
    selectedBlock = block;
    if (selectedBlock) {
        document.getElementById('editorStatus').innerText = `Выбран блок: ${selectedBlock.userData.shape || 'cube'}`;
        updatePropertyPanel(selectedBlock);
        updateTransformInputs();
    } else {
        document.getElementById('editorStatus').innerText = 'Ничего не выбрано';
        clearPropertyPanel();
    }
}

function updatePropertyPanel(block) {
    document.getElementById('blockColor').value = block.userData.color || '#8B5A2B';
    document.getElementById('blockOpacity').value = block.userData.opacity || 1;
    document.getElementById('opacityVal').innerText = (block.userData.opacity || 1).toFixed(2);
    document.getElementById('blockPhysType').value = block.userData.physType || 'solid';
    document.getElementById('blockTexture').value = block.userData.texture || 'wood';
    document.getElementById('blockScript').value = block.userData.script || '';
}

function clearPropertyPanel() {
    document.getElementById('blockColor').value = '#8B5A2B';
    document.getElementById('blockOpacity').value = 1;
    document.getElementById('opacityVal').innerText = '1.00';
    document.getElementById('blockPhysType').value = 'solid';
    document.getElementById('blockTexture').value = 'wood';
    document.getElementById('blockScript').value = '';
}

function updateTransformInputs() {
    if (!selectedBlock) return;
    document.getElementById('moveX').value = selectedBlock.position.x.toFixed(2);
    document.getElementById('moveY').value = selectedBlock.position.y.toFixed(2);
    document.getElementById('moveZ').value = selectedBlock.position.z.toFixed(2);
    document.getElementById('rotX').value = (selectedBlock.rotation.x * 180/Math.PI).toFixed(0);
    document.getElementById('rotY').value = (selectedBlock.rotation.y * 180/Math.PI).toFixed(0);
    document.getElementById('rotZ').value = (selectedBlock.rotation.z * 180/Math.PI).toFixed(0);
    document.getElementById('scaleX').value = selectedBlock.scale.x.toFixed(2);
    document.getElementById('scaleY').value = selectedBlock.scale.y.toFixed(2);
    document.getElementById('scaleZ').value = selectedBlock.scale.z.toFixed(2);
}

function moveSelected(dx, dy, dz) {
    if (!selectedBlock) return;
    selectedBlock.position.x += dx;
    selectedBlock.position.y += dy;
    selectedBlock.position.z += dz;
    updateTransformInputs();
}

function rotateSelected(rx, ry, rz) {
    if (!selectedBlock) return;
    selectedBlock.rotation.x += rx * Math.PI/180;
    selectedBlock.rotation.y += ry * Math.PI/180;
    selectedBlock.rotation.z += rz * Math.PI/180;
    updateTransformInputs();
}

function scaleSelected(sx, sy, sz) {
    if (!selectedBlock) return;
    selectedBlock.scale.x += sx;
    selectedBlock.scale.y += sy;
    selectedBlock.scale.z += sz;
    selectedBlock.scale.x = Math.max(0.2, selectedBlock.scale.x);
    selectedBlock.scale.y = Math.max(0.2, selectedBlock.scale.y);
    selectedBlock.scale.z = Math.max(0.2, selectedBlock.scale.z);
    updateTransformInputs();
}

function resetScale() {
    if (!selectedBlock) return;
    selectedBlock.scale.set(1,1,1);
    updateTransformInputs();
}

function duplicateSelected() {
    if (!selectedBlock) return;
    const newBlock = createMesh(selectedBlock.userData.shape || 'cube', selectedBlock.scale, parseInt(selectedBlock.userData.color.slice(1),16), selectedBlock.userData.opacity);
    newBlock.position.copy(selectedBlock.position);
    newBlock.position.x += 1;
    newBlock.rotation.copy(selectedBlock.rotation);
    newBlock.userData = { ...selectedBlock.userData };
    editorScene.add(newBlock);
    editorBlocks.push(newBlock);
    selectBlock(newBlock);
}

function applyPropertiesToSelected() {
    if (!selectedBlock) return;
    const colorHex = document.getElementById('blockColor').value;
    const opacity = parseFloat(document.getElementById('blockOpacity').value);
    const physType = document.getElementById('blockPhysType').value;
    const texture = document.getElementById('blockTexture').value;
    selectedBlock.material.color.set(colorHex);
    selectedBlock.material.transparent = opacity < 1;
    selectedBlock.material.opacity = opacity;
    selectedBlock.userData.color = colorHex;
    selectedBlock.userData.opacity = opacity;
    selectedBlock.userData.physType = physType;
    selectedBlock.userData.texture = texture;
    document.getElementById('opacityVal').innerText = opacity.toFixed(2);
}

function applyScriptToSelected() {
    if (!selectedBlock) return;
    const script = document.getElementById('blockScript').value;
    selectedBlock.userData.script = script;
    alert('Скрипт сохранён (будет выполняться в игре)');
}

function applyLightSettings() {
    const intensity = parseFloat(document.getElementById('lightIntensity').value);
    const color = document.getElementById('lightColor').value;
    const height = parseFloat(document.getElementById('lightHeight').value);
    const angleX = parseFloat(document.getElementById('lightAngleX').value);
    const angleY = parseFloat(document.getElementById('lightAngleY').value);
    let dirLight = editorScene.children.find(c => c instanceof THREE.DirectionalLight);
    if (!dirLight) {
        dirLight = new THREE.DirectionalLight(color, intensity);
        editorScene.add(dirLight);
    }
    dirLight.intensity = intensity;
    dirLight.color.set(color);
    const radX = angleX * Math.PI/180;
    const radY = angleY * Math.PI/180;
    const x = Math.cos(radY) * Math.cos(radX);
    const y = Math.sin(radX);
    const z = Math.sin(radY) * Math.cos(radX);
    dirLight.position.set(x * height, y * height, z * height);
    dirLight.target.position.set(0,0,0);
    editorScene.add(dirLight.target);
    document.getElementById('lightIntensityVal').innerText = intensity.toFixed(2);
    document.getElementById('lightHeightVal').innerText = height.toFixed(1);
    document.getElementById('lightAngleXVal').innerText = angleX;
    document.getElementById('lightAngleYVal').innerText = angleY;
}

function setTransformMode(mode) {
    currentTransformMode = mode;
    document.getElementById('moveControls').style.display = mode === 'move' ? 'block' : 'none';
    document.getElementById('rotateControls').style.display = mode === 'rotate' ? 'block' : 'none';
    document.getElementById('scaleControls').style.display = mode === 'scale' ? 'block' : 'none';
    document.getElementById('modeMove').classList.toggle('active', mode === 'move');
    document.getElementById('modeRotate').classList.toggle('active', mode === 'rotate');
    document.getElementById('modeScale').classList.toggle('active', mode === 'scale');
}

function setCurrentShape(shape) {
    currentShape = shape;
    document.getElementById('shapeCube').classList.toggle('active', shape === 'cube');
    document.getElementById('shapeSphere').classList.toggle('active', shape === 'sphere');
    document.getElementById('shapeCylinder').classList.toggle('active', shape === 'cylinder');
    document.getElementById('shapeCone').classList.toggle('active', shape === 'cone');
    document.getElementById('shapeWedge').classList.toggle('active', shape === 'wedge');
}

function addDefaultBlock() {
    const color = parseInt(currentColor.slice(1), 16);
    const block = createMesh(currentShape, { x:0.9, y:0.9, z:0.9 }, color, currentOpacity);
    block.position.set(0, 1, 0);
    block.userData = {
        shape: currentShape,
        color: currentColor,
        opacity: currentOpacity,
        physType: currentPhysType,
        texture: currentTexture,
        script: ''
    };
    editorScene.add(block);
    editorBlocks.push(block);
    selectBlock(block);
}

function saveGameToStorage() {
    const gameName = prompt('Введите название игры:');
    if (!gameName) return;
    const blocksData = editorBlocks.map(block => ({
        shape: block.userData.shape || 'cube',
        scale: { x: block.scale.x, y: block.scale.y, z: block.scale.z },
        color: block.userData.color || '#8B5A2B',
        opacity: block.userData.opacity || 1,
        x: block.position.x,
        y: block.position.y,
        z: block.position.z,
        rotation: { x: block.rotation.x, y: block.rotation.y, z: block.rotation.z },
        physType: block.userData.physType || 'solid',
        texture: block.userData.texture || 'wood',
        script: block.userData.script || ''
    }));
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

function publishGame() {
    const gameName = prompt('Введите название игры для публикации:');
    if (!gameName) return;
    const blocksData = editorBlocks.map(block => ({
        shape: block.userData.shape || 'cube',
        scale: { x: block.scale.x, y: block.scale.y, z: block.scale.z },
        color: block.userData.color ? parseInt(block.userData.color.slice(1),16) : 0x8B5A2B,
        opacity: block.userData.opacity || 1,
        x: block.position.x,
        y: block.position.y,
        z: block.position.z,
        rotation: { x: block.rotation.x, y: block.rotation.y, z: block.rotation.z }
    }));
    const gameData = { blocks: blocksData };
    // Вызываем функцию создания на сервере (если доступна)
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

function loadGameForEditing(game) {
    clearEditor();
    if (!game.data || !game.data.blocks) return;
    game.data.blocks.forEach(blockData => {
        const color = typeof blockData.color === 'number' ? '#' + blockData.color.toString(16).padStart(6,'0') : blockData.color;
        const block = createMesh(blockData.shape, blockData.scale, parseInt(color.slice(1),16), blockData.opacity);
        block.position.set(blockData.x, blockData.y, blockData.z);
        block.rotation.set(blockData.rotation.x, blockData.rotation.y, blockData.rotation.z);
        block.userData = {
            shape: blockData.shape,
            color: color,
            opacity: blockData.opacity,
            physType: blockData.physType || 'solid',
            texture: blockData.texture || 'wood',
            script: blockData.script || ''
        };
        editorScene.add(block);
        editorBlocks.push(block);
    });
    selectBlock(null);
}

function clearEditor() {
    editorBlocks.forEach(block => editorScene.remove(block));
    editorBlocks = [];
    selectedBlock = null;
}

export async function openEditor(gameToEdit = null) {
    gameBeingEdited = gameToEdit;
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('editorScreen').classList.remove('hidden');
    initEditor();
}

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

    const ambientLight = new THREE.AmbientLight(0x404060);
    editorScene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
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

    document.getElementById('modeMove').onclick = () => setTransformMode('move');
    document.getElementById('modeRotate').onclick = () => setTransformMode('rotate');
    document.getElementById('modeScale').onclick = () => setTransformMode('scale');
    document.getElementById('shapeCube').onclick = () => setCurrentShape('cube');
    document.getElementById('shapeSphere').onclick = () => setCurrentShape('sphere');
    document.getElementById('shapeCylinder').onclick = () => setCurrentShape('cylinder');
    document.getElementById('shapeCone').onclick = () => setCurrentShape('cone');
    document.getElementById('shapeWedge').onclick = () => setCurrentShape('wedge');
    document.getElementById('duplicateBtn').onclick = duplicateSelected;
    document.getElementById('addCubeBtn').onclick = addDefaultBlock;
    document.getElementById('applyPropsBtn').onclick = applyPropertiesToSelected;
    document.getElementById('applyScriptBtn').onclick = applyScriptToSelected;
    document.getElementById('applyLightBtn').onclick = applyLightSettings;
    document.getElementById('resetScale').onclick = resetScale;
    document.getElementById('publishGameBtn').onclick = publishGame;

    document.getElementById('moveXm').onclick = () => moveSelected(-0.5,0,0);
    document.getElementById('moveXp').onclick = () => moveSelected(0.5,0,0);
    document.getElementById('moveYm').onclick = () => moveSelected(0,-0.5,0);
    document.getElementById('moveYp').onclick = () => moveSelected(0,0.5,0);
    document.getElementById('moveZm').onclick = () => moveSelected(0,0,-0.5);
    document.getElementById('moveZp').onclick = () => moveSelected(0,0,0.5);
    document.getElementById('rotXm').onclick = () => rotateSelected(-15,0,0);
    document.getElementById('rotXp').onclick = () => rotateSelected(15,0,0);
    document.getElementById('rotYm').onclick = () => rotateSelected(0,-15,0);
    document.getElementById('rotYp').onclick = () => rotateSelected(0,15,0);
    document.getElementById('rotZm').onclick = () => rotateSelected(0,0,-15);
    document.getElementById('rotZp').onclick = () => rotateSelected(0,0,15);
    document.getElementById('scaleXm').onclick = () => scaleSelected(-0.1,0,0);
    document.getElementById('scaleXp').onclick = () => scaleSelected(0.1,0,0);
    document.getElementById('scaleYm').onclick = () => scaleSelected(0,-0.1,0);
    document.getElementById('scaleYp').onclick = () => scaleSelected(0,0.1,0);
    document.getElementById('scaleZm').onclick = () => scaleSelected(0,0,-0.1);
    document.getElementById('scaleZp').onclick = () => scaleSelected(0,0,0.1);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    editorRenderer.domElement.addEventListener('click', (event) => {
        const rect = editorRenderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, editorCamera);
        const intersects = raycaster.intersectObjects(editorBlocks);
        if (intersects.length > 0) {
            selectBlock(intersects[0].object);
        } else {
            selectBlock(null);
        }
    });

    document.querySelectorAll('.block-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.block-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            currentBlockType = opt.dataset.type;
            if (currentBlockType === 'wood') currentColor = '#8B5A2B';
            else if (currentBlockType === 'stone') currentColor = '#808080';
            else if (currentBlockType === 'concrete') currentColor = '#B0B0B0';
            else if (currentBlockType === 'dirt') currentColor = '#6B4C3B';
            document.getElementById('blockColor').value = currentColor;
        });
    });
    document.querySelector('.block-option').classList.add('selected');

    if (gameBeingEdited) {
        loadGameForEditing(gameBeingEdited);
        gameBeingEdited = null;
    } else {
        addDefaultBlock();
    }

    function animateEditor() {
        if (!editorActive) return;
        editorAnimationId = requestAnimationFrame(animateEditor);
        editorRenderer.render(editorScene, editorCamera);
    }
    editorActive = true;
    animateEditor();

    window.addEventListener('resize', () => {
        const container = document.getElementById('editorCanvasContainer');
        editorCamera.aspect = container.clientWidth / container.clientHeight;
        editorCamera.updateProjectionMatrix();
        editorRenderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Мобильные события для панели редактора
    if (window.attachMobileEvents) window.attachMobileEvents();
}