import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as API from './api.js';

let editorScene, editorCamera, editorRenderer, editorControls, transformControls;
let editorObjects = [];
let selectedObjects = [];
let currentTransformMode = 'translate';
let currentShape = 'cube';
let currentColor = '#8B5A2B';
let currentOpacity = 1;
let editorActive = false;
let editorAnimationId = null;

// Системные папки
const systemFolders = [
    { id: 'workspace', name: 'Workspace', icon: '🌐' },
    { id: 'lighting', name: 'Lighting', icon: '☀️' },
    { id: 'serverStorage', name: 'ServerStorage', icon: '📦' },
    { id: 'starterGui', name: 'StarterGui', icon: '🖥️' }
];

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
let timelineCanvas, timelineCtx;
let currentAnimationTime = 0;
let isDraggingTimeline = false;
let currentAnimationDuration = 1;

// GUI
let guiElements = [];

// NPC
let npcs = [];
let selectedNpc = null;

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
    mesh.userData = { type, shape, color: '#' + (typeof color === 'number' ? color.toString(16).padStart(6,'0') : color.slice(1)), opacity, anchor: false, collision: true };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// Шаблоны
function loadTemplate(templateType) {
    clearEditor();
    if (templateType === 'platformer') {
        // Добавляем платформы
        const ground = createBlockMesh('cube', { x: 20, y: 1, z: 20 }, 0x6B8E23, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Земля', type: 'block', parentId: 'workspace', threeObject: ground, userData: { type: 'block', shape: 'cube', color: '#6B8E23', opacity: 1, collision: true } });
        for (let i = -3; i <= 3; i++) {
            const plat = createBlockMesh('cube', { x: 2, y: 0.5, z: 2 }, 0xaa8866, 1);
            plat.position.set(i * 2.5, 0.5 + Math.abs(i) * 0.5, 0);
            addObject({ id: generateId(), name: 'Платформа', type: 'block', parentId: 'workspace', threeObject: plat, userData: { type: 'block', shape: 'cube', color: '#aa8866', opacity: 1, collision: true } });
        }
    } else if (templateType === 'racing') {
        // Круговая трасса
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const road = createBlockMesh('cube', { x: 2, y: 0.2, z: 2 }, 0x555555, 1);
            road.position.set(Math.cos(angle) * 8, -0.3, Math.sin(angle) * 8);
            addObject({ id: generateId(), name: 'Дорога', type: 'block', parentId: 'workspace', threeObject: road, userData: { type: 'block', shape: 'cube', color: '#555555', opacity: 1, collision: true } });
        }
    } else if (templateType === 'rpg') {
        const ground = createBlockMesh('cube', { x: 30, y: 1, z: 30 }, 0x4a7a4a, 1);
        ground.position.set(0, -0.5, 0);
        addObject({ id: generateId(), name: 'Трава', type: 'block', parentId: 'workspace', threeObject: ground, userData: { type: 'block', shape: 'cube', color: '#4a7a4a', opacity: 1, collision: true } });
        const house = createBlockMesh('cube', { x: 3, y: 2, z: 3 }, 0xaa8866, 1);
        house.position.set(5, 0, 5);
        addObject({ id: generateId(), name: 'Дом', type: 'block', parentId: 'workspace', threeObject: house, userData: { type: 'block', shape: 'cube', color: '#aa8866', opacity: 1, collision: true } });
        const tree = createBlockMesh('cylinder', { x: 1, y: 2, z: 1 }, 0x8B5A2B, 1);
        tree.position.set(-4, 0, -4);
        addObject({ id: generateId(), name: 'Дерево', type: 'block', parentId: 'workspace', threeObject: tree, userData: { type: 'block', shape: 'cylinder', color: '#8B5A2B', opacity: 1, collision: true } });
    }
    // empty – ничего не добавляем
}

// VFX
function createParticleSystem(config) {
    const geometry = new THREE.BufferGeometry();
    const count = config.count || 100;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        positions[i*3] = 0;
        positions[i*3+1] = 0;
        positions[i*3+2] = 0;
        velocities.push({ x: (Math.random() - 0.5) * (config.spread || 1), y: Math.random() * (config.speedY || 2), z: (Math.random() - 0.5) * (config.spread || 1) });
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: config.color || 0xffaa44, size: config.size || 0.2, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geometry, material);
    points.userData = { type: 'particleSystem', config, velocities, lifetimes: new Array(count).fill(0).map(() => Math.random() * (config.lifetime || 1)), age: 0 };
    return points;
}

function addParticleSystem(config) {
    const ps = createParticleSystem(config);
    const obj = { id: generateId(), name: config.name || 'Система частиц', type: 'particle', parentId: 'workspace', childrenIds: [], threeObject: ps, userData: { config } };
    addObject(obj);
    return obj;
}

function addParticlePreset(type) {
    const presets = {
        fire: { name:'Огонь', count:200, color:0xff6600, size:0.15, speedY:3, spread:0.8, lifetime:0.8 },
        water: { name:'Вода', count:150, color:0x3399ff, size:0.1, speedY:1.5, spread:1.2, lifetime:1.2 },
        air: { name:'Воздух', count:100, color:0xaaccff, size:0.2, speedY:2, spread:2, lifetime:1.5 },
        smoke: { name:'Дым', count:80, color:0x888888, size:0.3, speedY:1.2, spread:1.5, lifetime:2 }
    };
    addParticleSystem(presets[type]);
}

// NPC
function createNPC(name = "NPC") {
    const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const material = new THREE.MeshStandardMaterial({ color: 0x88aa88 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.6;
    mesh.userData = { type: 'npc', name, behavior: 'idle', speed: 2, dialog: '', parentId: null };
    const obj = { id: generateId(), name, type: 'npc', parentId: 'workspace', childrenIds: [], threeObject: mesh, userData: mesh.userData };
    addObject(obj);
    npcs.push(obj);
    renderNpcList();
    return obj;
}

function renderNpcList() {
    const container = document.getElementById('npcList');
    if (!container) return;
    container.innerHTML = '';
    npcs.forEach(npc => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#2c2f36; padding:4px 8px; margin:2px 0; border-radius:4px; cursor:pointer;';
        div.textContent = npc.userData.name;
        div.onclick = () => selectNPC(npc);
        container.appendChild(div);
    });
}

function selectNPC(npc) {
    selectedNpc = npc;
    document.getElementById('npcName').value =
