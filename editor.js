<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>BlockVerse Studio — Roblox Studio Clone</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            font-family: 'Segoe UI', 'Poppins', system-ui, sans-serif;
            background: #1e1f24;
            color: #cccccc;
            overflow: hidden;
            height: 100vh;
            width: 100%;
            position: fixed;
        }

        #loadingScreen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #1e1f24;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 20px;
        }
        .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #ff5722;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .screen {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        .hidden { display: none; }

        /* ========== ROBOXL STUDIO ИНТЕРФЕЙС ========== */
        .studio-layout {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #1e1f24;
        }

        /* TOP DOCK - Главное меню */
        .top-dock {
            display: flex;
            flex-direction: column;
            background: #2c2f36;
            border-bottom: 1px solid #3a3e47;
        }
        .main-menu {
            display: flex;
            gap: 4px;
            padding: 4px 12px;
            background: #25282e;
            border-bottom: 1px solid #3a3e47;
            height: 28px;
        }
        .menu-item {
            padding: 4px 12px;
            cursor: pointer;
            font-size: 12px;
            border-radius: 4px;
            color: #e0e0e0;
        }
        .menu-item:hover { background: #3a3e47; }

        /* RIBBON - Лента инструментов */
        .ribbon {
            background: #2c2f36;
        }
        .ribbon-tabs {
            display: flex;
            padding: 0 12px;
            gap: 2px;
        }
        .ribbon-tab {
            padding: 6px 16px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            border-radius: 6px 6px 0 0;
            background: #2c2f36;
            color: #e0e0e0;
        }
        .ribbon-tab.active {
            background: #1e1f24;
            color: white;
        }
        .ribbon-content {
            padding: 6px 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            border-top: 1px solid #3a3e47;
            background: #1e1f24;
            min-height: 56px;
        }
        .ribbon-group {
            display: flex;
            gap: 2px;
            background: #2c2f36;
            border-radius: 4px;
            padding: 4px 6px;
        }
        .ribbon-btn {
            background: none;
            border: none;
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        .ribbon-btn:hover { background: #4a4e55; }
        .ribbon-btn.active { background: #ff5722; }

        /* MEZZANINE - Антресоль */
        .mezzanine {
            padding: 4px 12px;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background: #25282e;
            border-top: 1px solid #3a3e47;
            height: 36px;
            align-items: center;
        }
        .play-btn, .stop-btn {
            border: none;
            padding: 4px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
        }
        .play-btn { background: #4caf50; color: white; }
        .stop-btn { background: #f44336; color: white; }

        /* MAIN DOCKS */
        .main-docks {
            display: flex;
            flex: 1;
            overflow: hidden;
            position: relative;
        }

        /* LEFT DOCK - Toolbox */
        .left-dock {
            width: 280px;
            background: #25282e;
            border-right: 1px solid #3a3e47;
            display: flex;
            flex-direction: column;
        }
        .toolbox-header {
            padding: 8px 12px;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
            color: #aaa;
            border-bottom: 1px solid #3a3e47;
        }
        .toolbox-categories {
            display: flex;
            gap: 4px;
            padding: 8px;
            border-bottom: 1px solid #3a3e47;
        }
        .toolbox-cat {
            background: #3a3e47;
            padding: 4px 12px;
            border-radius: 16px;
            cursor: pointer;
            font-size: 11px;
        }
        .toolbox-cat.active { background: #ff5722; }
        .asset-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 8px;
            padding: 12px;
            overflow-y: auto;
            flex: 1;
        }
        .asset-item {
            background: #1a1f2e;
            border-radius: 8px;
            padding: 8px;
            text-align: center;
            cursor: pointer;
            font-size: 11px;
            transition: 0.1s;
        }
        .asset-item:hover { background: #3a3e47; }

        /* RIGHT DOCK - Explorer + Properties */
        .right-dock {
            width: 360px;
            background: #25282e;
            border-left: 1px solid #3a3e47;
            display: flex;
            flex-direction: column;
        }
        .right-dock-header {
            display: flex;
            border-bottom: 1px solid #3a3e47;
        }
        .dock-tab {
            flex: 1;
            text-align: center;
            padding: 6px;
            cursor: pointer;
            font-size: 11px;
            font-weight: bold;
            background: #25282e;
        }
        .dock-tab.active {
            background: #0e639c;
            color: white;
        }
        .explorer-panel, .properties-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .explorer-search {
            width: calc(100% - 16px);
            margin: 8px;
            background: #1a1f2e;
            border: 1px solid #3a3e47;
            border-radius: 4px;
            padding: 4px 8px;
            color: white;
            font-size: 11px;
        }
        .explorer-tree {
            flex: 1;
            overflow-y: auto;
            padding: 4px;
            font-size: 12px;
        }
        .explorer-item {
            padding: 4px 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            border-radius: 4px;
        }
        .explorer-item:hover { background: #2a2a2a; }
        .explorer-item.selected { background: #0e639c; }
        .explorer-children { margin-left: 20px; }

        .properties-content {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }
        .prop-group { margin-bottom: 12px; }
        .prop-group label {
            display: block;
            font-size: 11px;
            color: #aaa;
            margin-bottom: 4px;
        }
        .prop-group input, .prop-group select {
            width: 100%;
            background: #1a1f2e;
            border: 1px solid #3a3e47;
            border-radius: 4px;
            padding: 6px 8px;
            color: white;
            font-size: 12px;
        }

        /* CENTER - 3D Viewport */
        .center-viewport {
            flex: 1;
            position: relative;
            background: #1a1d24;
        }
        .canvas-container {
            width: 100%;
            height: 100%;
        }
        .viewport-controls {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0,0,0,0.6);
            padding: 4px 8px;
            border-radius: 4px;
            display: flex;
            gap: 8px;
            font-size: 11px;
        }
        .viewport-controls button {
            background: #3a3e47;
            border: none;
            padding: 2px 6px;
            border-radius: 3px;
            color: white;
            cursor: pointer;
        }

        /* BOTTOM DOCK - Output */
        .bottom-dock {
            height: 150px;
            background: #25282e;
            border-top: 1px solid #3a3e47;
            display: flex;
            flex-direction: column;
        }
        .output-header {
            padding: 4px 12px;
            background: #1e1f24;
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #3a3e47;
            font-size: 11px;
        }
        .output-content {
            flex: 1;
            overflow-y: auto;
            font-family: monospace;
            font-size: 11px;
            padding: 8px;
        }
        .command-bar {
            display: flex;
            border-top: 1px solid #3a3e47;
        }
        .command-input {
            flex: 1;
            background: #1a1f2e;
            border: none;
            padding: 6px 12px;
            color: white;
            font-family: monospace;
            font-size: 11px;
        }

        /* RESIZERS */
        .left-resizer, .right-resizer, .bottom-resizer {
            position: absolute;
            background: transparent;
            z-index: 10;
        }
        .left-resizer { right: -3px; top: 0; width: 6px; height: 100%; cursor: ew-resize; }
        .right-resizer { left: -3px; top: 0; width: 6px; height: 100%; cursor: ew-resize; }
        .bottom-resizer { top: -3px; left: 0; width: 100%; height: 6px; cursor: ns-resize; }

        @media (max-width: 768px) {
            .left-dock, .right-dock { width: 220px; }
            .ribbon-content { display: none; }
        }
    </style>
</head>
<body>
<div id="loadingScreen"><div class="spinner"></div><div>Загрузка BlockVerse Studio...</div></div>

<div id="studioScreen" class="screen">
    <div class="studio-layout">
        <!-- TOP DOCK -->
        <div class="top-dock">
            <div class="main-menu">
                <div class="menu-item" data-action="file">File</div>
                <div class="menu-item" data-action="edit">Edit</div>
                <div class="menu-item" data-action="view">View</div>
                <div class="menu-item" data-action="insert">Insert</div>
                <div class="menu-item" data-action="model">Model</div>
                <div class="menu-item" data-action="avatar">Avatar</div>
                <div class="menu-item" data-action="test">Test</div>
                <div class="menu-item" data-action="plugins">Plugins</div>
                <div class="menu-item" data-action="help">Help</div>
            </div>
            <div class="ribbon">
                <div class="ribbon-tabs">
                    <div class="ribbon-tab active" data-tab="home">Home</div>
                    <div class="ribbon-tab" data-tab="model">Model</div>
                    <div class="ribbon-tab" data-tab="avatar">Avatar</div>
                    <div class="ribbon-tab" data-tab="test">Test</div>
                    <div class="ribbon-tab" data-tab="view">View</div>
                    <div class="ribbon-tab" data-tab="plugins">Plugins</div>
                </div>
                <div id="ribbonHome" class="ribbon-content">
                    <div class="ribbon-group">
                        <button class="ribbon-btn" id="modeMoveBtn">Move</button>
                        <button class="ribbon-btn" id="modeRotateBtn">Rotate</button>
                        <button class="ribbon-btn" id="modeScaleBtn">Scale</button>
                    </div>
                    <div class="ribbon-group">
                        <button class="ribbon-btn" id="addPartBtn">Part</button>
                        <button class="ribbon-btn" id="addSphereBtn">Sphere</button>
                        <button class="ribbon-btn" id="addCylinderBtn">Cylinder</button>
                    </div>
                    <div class="ribbon-group">
                        <input type="color" id="colorPicker" value="#ffaa44" style="width:32px; height:24px; border:none;">
                        <select id="materialSelect"><option>Plastic</option><option>Metal</option></select>
                    </div>
                </div>
                <div id="ribbonModel" class="ribbon-content hidden">
                    <div class="ribbon-group"><button class="ribbon-btn">Align</button><button class="ribbon-btn">Union</button></div>
                </div>
                <div id="ribbonAvatar" class="ribbon-content hidden">
                    <div class="ribbon-group"><button class="ribbon-btn">Create Rig</button></div>
                </div>
                <div id="ribbonTest" class="ribbon-content hidden">
                    <div class="ribbon-group"><button class="ribbon-btn" id="playTestBtn">Play</button><button class="ribbon-btn" id="stopTestBtn">Stop</button></div>
                </div>
                <div id="ribbonView" class="ribbon-content hidden">
                    <div class="ribbon-group"><button class="ribbon-btn" id="toggleGridBtn">Grid</button><button class="ribbon-btn" id="toggleWireframeBtn">Wireframe</button></div>
                </div>
                <div id="ribbonPlugins" class="ribbon-content hidden">
                    <div class="ribbon-group"><button class="ribbon-btn">Plugin 1</button></div>
                </div>
            </div>
            <div class="mezzanine">
                <button class="play-btn" id="playBtn">▶ Play</button>
                <button class="stop-btn" id="stopBtn">⏹ Stop</button>
                <span>🤖 Assistant</span>
                <span>👤 User</span>
            </div>
        </div>

        <!-- MAIN DOCKS -->
        <div class="main-docks">
            <!-- LEFT DOCK - Toolbox -->
            <div class="left-dock" id="leftDock">
                <div class="toolbox-header">📦 TOOLBOX</div>
                <div class="toolbox-categories">
                    <div class="toolbox-cat active" data-cat="marketplace">Marketplace</div>
                    <div class="toolbox-cat" data-cat="inventory">Inventory</div>
                    <div class="toolbox-cat" data-cat="recent">Recent</div>
                </div>
                <div id="toolboxMarketplace" class="asset-grid">
                    <div class="asset-item" data-asset="cube">🧊 Cube</div>
                    <div class="asset-item" data-asset="sphere">⚪ Sphere</div>
                    <div class="asset-item" data-asset="cylinder">📦 Cylinder</div>
                    <div class="asset-item" data-asset="lamp">💡 Lamp</div>
                </div>
                <div id="toolboxInventory" class="asset-grid hidden"></div>
                <div id="toolboxRecent" class="asset-grid hidden"></div>
                <div class="left-resizer" id="leftResizer"></div>
            </div>

            <!-- CENTER - 3D Viewport -->
            <div class="center-viewport">
                <div id="editorCanvasContainer" class="canvas-container"></div>
                <div class="viewport-controls">
                    <button id="toggleGridBtn2">🔲 Grid</button>
                    <button id="toggleWireframeBtn2">📐 Wireframe</button>
                    <select id="coordSystem"><option value="global">Global</option><option value="local">Local</option></select>
                </div>
            </div>

            <!-- RIGHT DOCK - Explorer + Properties -->
            <div class="right-dock" id="rightDock">
                <div class="right-dock-header">
                    <div class="dock-tab active" id="explorerTabBtn">Explorer</div>
                    <div class="dock-tab" id="propertiesTabBtn">Properties</div>
                </div>
                <div id="explorerContainer" class="explorer-panel">
                    <input type="text" id="explorerSearch" class="explorer-search" placeholder="🔍 Search...">
                    <div id="explorerTree" class="explorer-tree"></div>
                </div>
                <div id="propertiesContainer" class="properties-panel" style="display: none;">
                    <div id="propertiesContent" class="properties-content"></div>
                </div>
                <div class="right-resizer" id="rightResizer"></div>
            </div>
        </div>

        <!-- BOTTOM DOCK - Output -->
        <div class="bottom-dock" id="bottomDock">
            <div class="output-header">
                <span>Output</span>
                <button id="clearOutputBtn">Clear</button>
            </div>
            <div id="outputContent" class="output-content"></div>
            <div class="command-bar">
                <span style="padding:6px 12px;">&gt;</span>
                <input type="text" id="commandInput" class="command-input" placeholder="Lua command...">
            </div>
            <div class="bottom-resizer" id="bottomResizer"></div>
        </div>
    </div>
</div>

<script type="importmap">
    {
        "imports": {
            "three": "https://unpkg.com/three@0.128.0/build/three.module.js",
            "three/addons/": "https://unpkg.com/three@0.128.0/examples/jsm/"
        }
    }
</script>

<script>
    // Скрываем загрузку после полной загрузки страницы
    window.addEventListener('load', function() {
        setTimeout(function() {
            var loading = document.getElementById('loadingScreen');
            if (loading) loading.style.display = 'none';
        }, 500);
    });
    
    // Проверка сессии
    if (!sessionStorage.getItem('blockverse_session')) {
        window.location.href = 'login.html';
    }
</script>

<script type="module" src="platform.js"></script>
<script type="module" src="editor.js"></script>
</body>
</html>
