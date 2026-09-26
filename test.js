import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
app.use(express.static(fileURLToPath(new URL('.', import.meta.url))));

const server = app.listen(0, '127.0.0.1');
let browser;

function findBrowserExecutable() {
    const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH];
    if (process.platform === 'win32') {
        for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]) {
            if (!root) continue;
            candidates.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
            candidates.push(join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        }
        if (process.env.LOCALAPPDATA) {
            candidates.push(join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
            candidates.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    } else {
        candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    }
    return candidates.find(path => path && existsSync(path));
}

try {
    await once(server, 'listening');
    const launchOptions = { headless: true };
    const executablePath = findBrowserExecutable();
    if (executablePath) launchOptions.executablePath = executablePath;
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    const pageErrors = [];
    const collaborationRequests = [];
    const localResourceFailures = [];
    page.on('pageerror', error => pageErrors.push(error));
    page.on('request', request => {
        if (/clerk|whiteboard-server\.friedturtleee\.workers\.dev|esm\.sh\/(?:yjs|y-websocket)/i
            .test(request.url())) {
            collaborationRequests.push(request.url());
        }
    });
    const port = server.address().port;
    const localOrigin = `http://127.0.0.1:${port}/`;
    page.on('response', response => {
        if (response.url().startsWith(localOrigin) && response.status() >= 400) {
            localResourceFailures.push(`${response.status()} ${response.url()}`);
        }
    });
    const response = await page.goto(`${localOrigin}index.html`, {
        waitUntil: 'domcontentloaded'
    });
    if (!response?.ok()) {
        throw new Error(`Whiteboard page returned HTTP ${response?.status() ?? 'no response'}.`);
    }
    const cdnIntegrity = await page.evaluate(() => [...document.querySelectorAll(
        'script[src^="https://cdn."], link[rel="stylesheet"][href^="https://cdn."]'
    )].every(element => /^sha384-[A-Za-z0-9+/]+=*$/.test(element.integrity) &&
        element.crossOrigin === 'anonymous'));
    if (!cdnIntegrity) {
        throw new Error('External CDN assets must use SHA-384 Subresource Integrity and anonymous CORS.');
    }
    await page.waitForSelector('#main-canvas');
    await page.waitForFunction(() => Boolean(window.__whiteboard), { timeout: 15000 });
    const duplicateIds = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    });
    if (duplicateIds.length) {
        throw new Error('The page contains duplicate element IDs: ' + duplicateIds.join(', '));
    }
    const collaborationUiPresent = await page.evaluate(() => Boolean(
        document.querySelector('#collab-status, #collab-status-text, [data-clerk-publishable-key]') ||
        window.Clerk
    ));
    if (collaborationUiPresent || collaborationRequests.length) {
        throw new Error('The local-only page unexpectedly loaded collaboration UI or services.');
    }
    const unusedMermaidRuntimeLoaded = await page.evaluate(() => Boolean(
        window.mermaid || document.querySelector('script[src*="/mermaid"]')
    ));
    if (unusedMermaidRuntimeLoaded) {
        throw new Error('The unused Mermaid runtime should not be loaded by the local-only page.');
    }
    await page.setViewport({ width: 1000, height: 700 });
    await page.evaluate(() => {
        document.getElementById('loading-screen')?.remove();
        window.__whiteboard.toolbar.setTool('rectangle');
    });
    const settingsValidation = await page.evaluate(() => {
        const app = window.__whiteboard;
        const previousRaw = localStorage.getItem('wb_settings');
        const previousSettings = { ...app.settings };
        const previousSpacing = app.grid.baseSpacing;
        localStorage.setItem('wb_settings',
            '{"showGrid":"false","gridSpacing":45,"defaultPenSize":1000,' +
            '"defaultPenSmoothing":null,"defaultStrokeWidth":-1,"__proto__":{"polluted":true}}');
        Object.assign(app.settings, {
            showGrid: true, gridSpacing: 40, defaultPenSize: 2,
            defaultPenSmoothing: 3, defaultStrokeWidth: 2
        });
        app._loadSettings();
        const valid = app.settings.showGrid === true && app.settings.gridSpacing === 40 &&
            app.settings.defaultPenSize === 2 && app.settings.defaultPenSmoothing === 3 &&
            app.settings.defaultStrokeWidth === 2 && app.grid.baseSpacing === 40 &&
            Object.prototype.polluted === undefined;
        if (previousRaw === null) localStorage.removeItem('wb_settings');
        else localStorage.setItem('wb_settings', previousRaw);
        Object.assign(app.settings, previousSettings);
        app.grid.baseSpacing = previousSpacing;
        return valid;
    });
    if (!settingsValidation) {
        throw new Error('Invalid persisted settings must not corrupt rendering or application defaults.');
    }
    const defaultStrokeWidth = await page.evaluate(() => {
        const app = window.__whiteboard;
        const previousWidth = app.settings.defaultStrokeWidth;
        app.settings.defaultStrokeWidth = 7;
        app._startCreating('rectangle', 0, 0);
        const applied = app._creatingElement.strokeWidth;
        app._cancelPointerInteraction();
        app.settings.defaultStrokeWidth = previousWidth;
        return applied;
    });
    if (defaultStrokeWidth !== 7) {
        throw new Error('New drawing elements must inherit the configured default stroke width.');
    }
    const cameraAutosave = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const key = app.autosaveKey;
        const originalCamera = { x: app.camera.x, y: app.camera.y, zoom: app.camera.zoom };
        const originalAutosave = localStorage.getItem(key);
        if (app._autosaveTimer) clearTimeout(app._autosaveTimer);
        app._autosaveTimer = null;
        localStorage.removeItem(key);
        app.canvas.dispatchEvent(new WheelEvent('wheel', {
            deltaX: 32, deltaY: 0, bubbles: true, cancelable: true
        }));
        const changedCamera = { x: app.camera.x, y: app.camera.y, zoom: app.camera.zoom };
        await new Promise(resolve => setTimeout(resolve, 1300));
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        localStorage.setItem(key, JSON.stringify({
            version: 1, elements: [], camera: { x: 123, y: -456, zoom: 2 }
        }));
        app.camera.x = 0;
        app.camera.y = 0;
        app.camera.zoom = 1.5;
        app._tryLoadAutosave();
        const emptyBoardCameraRestored = app.elements.length === 0 &&
            app.camera.x === 123 && app.camera.y === -456 && app.camera.zoom === 2;
        app.camera.x = originalCamera.x;
        app.camera.y = originalCamera.y;
        app.camera.zoom = originalCamera.zoom;
        app._autosaveTimer = null;
        if (originalAutosave === null) localStorage.removeItem(key);
        else localStorage.setItem(key, originalAutosave);
        app.renderer.markDirty();
        return Boolean(saved?.camera && emptyBoardCameraRestored &&
            Object.keys(changedCamera).every(key => saved.camera[key] === changedCamera[key]));
    });
    if (!cameraAutosave) {
        throw new Error('Panning the canvas must persist the updated camera in autosave data.');
    }
    const importAutosave = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const key = app.autosaveKey;
        const previousRaw = localStorage.getItem(key);
        const previousCamera = { x: app.camera.x, y: app.camera.y, zoom: app.camera.zoom };
        if (app._autosaveTimer) clearTimeout(app._autosaveTimer);
        app._autosaveTimer = null;
        localStorage.removeItem(key);
        const toastSeen = new Promise(resolve => {
            const findToast = () => [...document.querySelectorAll('.toast')]
                .some(toast => toast.textContent.includes('已匯入'));
            const observer = new MutationObserver(() => {
                if (findToast()) {
                    observer.disconnect();
                    resolve(true);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            if (findToast()) {
                observer.disconnect();
                resolve(true);
            }
            setTimeout(() => { observer.disconnect(); resolve(false); }, 3000);
        });
        const payload = {
            version: 1,
            elements: [{ type: 'rectangle', x: 11, y: 22, width: 90, height: 55 }],
            camera: { x: 11, y: 22, zoom: 1.75 }
        };
        const transfer = new DataTransfer();
        transfer.items.add(new File([JSON.stringify(payload)], 'autosave-check.json', {
            type: 'application/json'
        }));
        const input = document.getElementById('json-file-input');
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const showedImportToast = await toastSeen;
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (app._autosaveTimer) clearTimeout(app._autosaveTimer);
        app._autosaveTimer = null;
        const { Serializer } = await import('/js/core/Serializer.js');
        Serializer.loadJSONData(app, { elements: [], camera: previousCamera });
        if (previousRaw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previousRaw);
        return Boolean(showedImportToast && saved?.elements?.length === 1 &&
            saved.camera?.x === 11 && saved.camera?.y === 22 && saved.camera?.zoom === 1.75);
    });
    if (!importAutosave) {
        throw new Error('A successfully imported board must be saved before the import flow finishes.');
    }
    const layerLockControl = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const [{ ShapeElement }, { TextElement }, { TreeElement }, { HitTest }] = await Promise.all([
            import('/js/elements/ShapeElement.js'),
            import('/js/elements/TextElement.js'),
            import('/js/tree/TreeElement.js'),
            import('/js/canvas/HitTest.js')
        ]);
        const element = new ShapeElement('rectangle', 0, 0, 30, 30);
        app.elements.push(element);
        app.selectionManager.select(element);
        app.layerPanel.update();
        const getLockButton = () => document.querySelector(
            `.layer-item[data-el-id="${element.id}"] .layer-lock`
        );
        const getVisibilityButton = () => document.querySelector(
            `.layer-item[data-el-id="${element.id}"] .layer-visibility`
        );
        const layerName = `${element.label || element.type} #${element.id}`;
        const visibilityButton = getVisibilityButton();
        const visibilityAccessible = visibilityButton?.tagName === 'BUTTON' &&
            visibilityButton.getAttribute('aria-label') === `圖層可見 ${layerName}` &&
            visibilityButton.getAttribute('aria-pressed') === 'true';
        visibilityButton?.click();
        const hidden = element.hidden &&
            getVisibilityButton()?.getAttribute('aria-label') === `圖層可見 ${layerName}` &&
            getVisibilityButton()?.getAttribute('aria-pressed') === 'false';
        getVisibilityButton()?.click();
        const shown = !element.hidden &&
            getVisibilityButton()?.getAttribute('aria-label') === `圖層可見 ${layerName}`;
        const initialButton = getLockButton();
        const buttonAvailable = initialButton?.getAttribute('aria-label') === `圖層鎖定 ${layerName}` &&
            initialButton.getAttribute('aria-pressed') === 'false';
        app.selectionManager.select(element);
        const opacityInput = document.getElementById('prop-opacity');
        const previousOpacityValue = opacityInput.value;
        opacityInput.dispatchEvent(new Event('focus'));
        initialButton?.click();
        const locked = element.locked && !app.selectionManager.isSelected(element) &&
            HitTest.hitTestAll([element], 5, 5, app.camera) === null &&
            getLockButton()?.getAttribute('aria-label') === `圖層鎖定 ${layerName}` &&
            getLockButton()?.getAttribute('aria-pressed') === 'true';
        // A remote lock can arrive after a property edit captured its start state.
        opacityInput.value = '35';
        opacityInput.dispatchEvent(new Event('input', { bubbles: true }));
        const lockedPropertyUnchanged = element.opacity === 1;
        opacityInput.value = previousOpacityValue;
        app.selectionManager.selectedElements = [];
        app.propertyPanel.update();
        app.selectionManager.selectedElements = [element];
        const beforeLockedDuplicate = app.elements.length;
        app._duplicateSelected();
        const lockedDuplicateBlocked = app.elements.length === beforeLockedDuplicate;
        app.selectionManager.selectedElements = [];
        getLockButton()?.click();
        const unlocked = !element.locked && HitTest.hitTestAll([element], 5, 5, app.camera) === element &&
            getLockButton()?.getAttribute('aria-label') === `圖層鎖定 ${layerName}`;
        app.history.undo();
        app.layerPanel.update();
        const undoRestoresLock = element.locked;
        app.history.redo();
        app.layerPanel.update();
        const redoRestoresUnlock = !element.locked &&
            getLockButton()?.getAttribute('aria-label') === `圖層鎖定 ${layerName}`;
        app.selectionManager.select(element);
        const focusedVisibilityButton = getVisibilityButton();
        focusedVisibilityButton?.focus();
        focusedVisibilityButton?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Delete', bubbles: true, cancelable: true
        }));
        const focusedControlDoesNotDelete = app.elements.includes(element);

        const editingText = new TextElement(40, 40);
        editingText.text = 'Before lock';
        app.elements.push(editingText);
        app.layerManager._reindex();
        app.layerPanel.update();
        app._startTextEditing(editingText);
        const textOverlay = document.getElementById('text-edit-overlay');
        textOverlay.value = 'Uncommitted preview';
        textOverlay.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector(`.layer-item[data-el-id="${editingText.id}"] .layer-lock`)?.click();
        const lockingCancelsTextEdit = editingText.locked && editingText.text === 'Before lock' &&
            !editingText.isEditing && app._textEditing !== editingText;

        const editingTree = new TreeElement(80, 80);
        editingTree.buildFromText('1 2 3', 'values');
        const originalRootValue = editingTree.root.value;
        app.elements.push(editingTree);
        app.layerManager._reindex();
        app.layerPanel.update();
        app._editTreeNodeValue(editingTree, editingTree.root, 80, 80);
        const treeOverlay = document.getElementById('text-edit-overlay');
        treeOverlay.value = 'Uncommitted tree value';
        treeOverlay.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector(`.layer-item[data-el-id="${editingTree.id}"] .layer-lock`)?.click();
        const lockingCancelsTreeEdit = editingTree.locked && editingTree.root.value === originalRootValue &&
            !editingTree.isEditingNode && app._inlineEdit?.element !== editingTree;

        const startingPosition = { x: element.x, y: element.y };
        app.selectionManager.select(element);
        app.transform.startDrag(startingPosition.x, startingPosition.y);
        app.transform.update(startingPosition.x + 12, startingPosition.y + 8);
        getLockButton()?.click();
        const lockingCancelsDrag = element.locked && !app.transform.mode &&
            element.x === startingPosition.x && element.y === startingPosition.y;

        app.history.clear();
        app.selectionManager.clear();
        app.elements = app.elements.filter(item =>
            item !== element && item !== editingText && item !== editingTree);
        if (app._autosaveTimer) clearTimeout(app._autosaveTimer);
        app._autosaveTimer = null;
        app.layerManager._reindex();
        app.layerPanel.update();
        return visibilityAccessible && hidden && shown && buttonAvailable && locked &&
            lockedPropertyUnchanged && lockedDuplicateBlocked && unlocked &&
            undoRestoresLock && redoRestoresUnlock && focusedControlDoesNotDelete &&
            lockingCancelsTextEdit && lockingCancelsTreeEdit && lockingCancelsDrag;
    });
    if (!layerLockControl) {
        throw new Error('Layer lock controls must block editing and support undo/redo.');
    }
    const lockedDataStructureDelete = await page.evaluate(async () => {
        const [{ MatrixElement }, { StackElement }] = await Promise.all([
            import('/js/elements/MatrixElement.js'),
            import('/js/elements/StackElement.js')
        ]);
        const app = window.__whiteboard;
        const matrix = new MatrixElement(0, 0);
        matrix.data = [['1', '2']];
        matrix.rows = 1;
        matrix.cols = 2;
        matrix.selectedCells = new Set(['0,0']);
        matrix.locked = true;
        const stack = new StackElement(0, 0);
        stack.items = ['1', '2'];
        stack.selectedIndices = new Set([0]);
        stack.locked = true;
        const historyLength = app.history.undoStack.length;
        app._deleteSelectedMatrixCells(matrix);
        app._deleteSelectedItems(stack);
        return matrix.data[0][0] === '1' && stack.items[0] === '1' &&
            app.history.undoStack.length === historyLength;
    });
    if (!lockedDataStructureDelete) {
        throw new Error('Locked matrix cells and stack items must ignore delete operations.');
    }
    const hiddenSnapTargetIgnored = await page.evaluate(async () => {
        const { ShapeElement } = await import('/js/elements/ShapeElement.js');
        const app = window.__whiteboard;
        const hidden = new ShapeElement('rectangle', 100, 100, 40, 40);
        const visible = new ShapeElement('rectangle', 120, 100, 40, 40);
        hidden.hidden = true;
        const previousElements = app.elements;
        const previousZoom = app.camera.zoom;
        app.elements = [hidden, visible];
        app.camera.zoom = 1;
        const result = app._findSnapPort(120, 120, null);
        app.elements = previousElements;
        app.camera.zoom = previousZoom;
        return result?.elementId === visible.id;
    });
    if (!hiddenSnapTargetIgnored) {
        throw new Error('Connection snapping must ignore hidden elements.');
    }
    await page.mouse.move(500, 300);
    await page.mouse.down();
    await page.mouse.move(560, 350);
    const previewStarted = await page.evaluate(() => {
        const app = window.__whiteboard;
        return app._isCreating && app.elements.includes(app._creatingElement);
    });
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app.canvas.dispatchEvent(new PointerEvent('pointercancel', {
            bubbles: true, pointerId: app._activePointerId, button: 0
        }));
    });
    const previewCleared = await page.evaluate(() => {
        const app = window.__whiteboard;
        return !app._isCreating && !app._creatingElement &&
            app.elements.length === 0 && app._activePointerId === null;
    });
    await page.mouse.up();
    if (!previewStarted || !previewCleared) {
        throw new Error('Cancelling an in-progress shape must remove its preview and reset creation state.');
    }

    const pointerIsolation = await page.evaluate(() => {
        const app = window.__whiteboard;
        const originalCapture = app.canvas.setPointerCapture;
        app.canvas.setPointerCapture = () => {};
        try {
            app.toolbar.setTool('rectangle');
            const pointer = pointerId => ({
                pointerId, button: 0, clientX: 500, clientY: 300, shiftKey: false
            });
            app._onPointerDown(pointer(11));
            const firstPreview = app._creatingElement;
            app._onPointerDown(pointer(12));
            app._cancelPointerInteraction(12);
            const secondPointerIgnored = app._activePointerId === 11 &&
                app._creatingElement === firstPreview && app.elements.length === 1;
            app._cancelPointerInteraction(11);
            return secondPointerIgnored && app.elements.length === 0 && app._activePointerId === null;
        } finally {
            app.canvas.setPointerCapture = originalCapture;
        }
    });
    if (!pointerIsolation) {
        throw new Error('A second pointer must not replace or cancel the active canvas interaction.');
    }

    const transformCancelled = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const { ShapeElement } = await import('/js/elements/ShapeElement.js');
        const element = new ShapeElement('rectangle', 100, 100, 50, 40);
        app.elements.push(element);
        app.selectionManager.select(element);
        app.transform.startDrag(0, 0);
        app.transform.update(20, 30);
        app.canvas.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
        return element.x === 100 && element.y === 100 && app.transform.mode === null;
    });
    if (!transformCancelled) {
        throw new Error('Unexpected pointer-capture loss must restore an in-progress transform.');
    }

    const connectedRotatedLine = await page.evaluate(async () => {
        const { ShapeElement } = await import('/js/elements/ShapeElement.js');
        const app = window.__whiteboard;
        const previousElements = app.elements;
        const target = new ShapeElement('rectangle', 100, 100, 80, 50);
        const line = new ShapeElement('arrow', 0, 0, 40, 20);
        target.rotation = 0.35;
        line.rotation = -0.6;
        const port = target.getConnectionPorts().find(candidate => candidate.id === 'right');
        line.setEndpointWorld(0, port);
        line.connections.p1 = { elementId: target.id, portId: 'right' };
        const fixedEndpoint = line.getEndpointWorld(1);
        app.elements = [target, line];
        target.x += 25;
        target.y -= 10;
        app._updateConnectedLines([target.id]);
        const movedPort = target.getConnectionPorts().find(candidate => candidate.id === 'right');
        const attachedEndpoint = line.getEndpointWorld(0);
        const finalFixedEndpoint = line.getEndpointWorld(1);
        app.elements = previousElements;
        return Math.hypot(attachedEndpoint.x - movedPort.x, attachedEndpoint.y - movedPort.y) < 1e-7 &&
            Math.hypot(finalFixedEndpoint.x - fixedEndpoint.x, finalFixedEndpoint.y - fixedEndpoint.y) < 1e-7;
    });
    if (!connectedRotatedLine) {
        throw new Error('A rotated connector must track a moved shape port without moving its other endpoint.');
    }

    const detachedLineHistory = await page.evaluate(async () => {
        const { ShapeElement } = await import('/js/elements/ShapeElement.js');
        const app = window.__whiteboard;
        const previousElements = app.elements;
        const previousSelection = app.selectionManager.selectedElements.slice();
        const previousUndo = app.history.undoStack;
        const previousRedo = app.history.redoStack;
        const target = new ShapeElement('rectangle', 100, 100, 80, 50);
        const line = new ShapeElement('line', 0, 0, 50, 20);
        const port = target.getConnectionPorts().find(candidate => candidate.id === 'right');
        line.setEndpointWorld(0, port);
        line.connections.p1 = { elementId: target.id, portId: 'right' };
        const originalEndpoint = line.getEndpointWorld(0);
        app.elements = [target, line];
        app.history.undoStack = [];
        app.history.redoStack = [];

        try {
            app.transform.startEndpoint(port.x, port.y, 0, line);
            app.transform.update(port.x + 30, port.y + 25);
            app._snapPreview = null;
            app._finishPointerUp({ clientX: 0, clientY: 0, button: 0, pointerId: null, shiftKey: false });
            const disconnected = line.connections.p1 === null;
            app.history.undo();
            const undoRestoredConnection = line.connections.p1?.elementId === target.id &&
                line.connections.p1?.portId === 'right';
            const undoRestoredEndpoint = Math.hypot(
                line.getEndpointWorld(0).x - originalEndpoint.x,
                line.getEndpointWorld(0).y - originalEndpoint.y
            ) < 1e-7;
            return disconnected && undoRestoredConnection && undoRestoredEndpoint;
        } finally {
            app.elements = previousElements;
            app.selectionManager.selectedElements = previousSelection;
            app.history.undoStack = previousUndo;
            app.history.redoStack = previousRedo;
            app._autosave();
        }
    });
    if (!detachedLineHistory) {
        throw new Error('Dragging an attached endpoint free must disconnect it, and undo must restore the connection.');
    }

    const propertyResizeHistory = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const { MatrixElement } = await import('/js/elements/MatrixElement.js');
        const matrix = new MatrixElement(0, 0);
        matrix.rows = 2;
        matrix.cols = 2;
        matrix._initData();
        app.history.clear();
        app.elements = [matrix];
        app.selectionManager.select(matrix);
        app.propertyPanel.update();

        const widthInput = document.getElementById('prop-w');
        widthInput.dispatchEvent(new Event('focus'));
        widthInput.value = '80';
        widthInput.dispatchEvent(new Event('input', { bubbles: true }));
        widthInput.dispatchEvent(new Event('change', { bubbles: true }));
        const resized = { width: matrix.width, height: matrix.height, cellSize: matrix.cellSize };
        app.history.undo();
        const undone = { width: matrix.width, height: matrix.height, cellSize: matrix.cellSize };
        app.history.redo();
        const redone = { width: matrix.width, height: matrix.height, cellSize: matrix.cellSize };
        return { resized, undone, redone };
    });
    if (propertyResizeHistory.undone.width !== 104 ||
        propertyResizeHistory.undone.height !== 104 ||
        propertyResizeHistory.undone.cellSize !== 42 ||
        propertyResizeHistory.redone.width !== 80 ||
        propertyResizeHistory.redone.height !== 80 ||
        propertyResizeHistory.redone.cellSize !== 30) {
        throw new Error('Property-panel matrix resize undo/redo did not restore complete geometry: ' +
            JSON.stringify(propertyResizeHistory));
    }

    const rendered = await page.evaluate(async () => {
        const [
            { ShapeElement }, { TextElement }, { MatrixElement }, { QueueElement },
            { StackElement }, { TreeElement }, { GraphElement }, { PenElement },
            { MermaidElement }, { MarkdownElement }
        ] = await Promise.all([
            import('/js/elements/ShapeElement.js'),
            import('/js/elements/TextElement.js'),
            import('/js/elements/MatrixElement.js'),
            import('/js/elements/QueueElement.js'),
            import('/js/elements/StackElement.js'),
            import('/js/tree/TreeElement.js'),
            import('/js/graph/GraphElement.js'),
            import('/js/elements/PenElement.js'),
            import('/js/elements/MermaidElement.js'),
            import('/js/elements/MarkdownElement.js')
        ]);
        const shape = new ShapeElement('rectangle', 10, 10);
        shape.width = 80;
        shape.height = 50;
        const text = new TextElement(110, 10);
        text.text = 'smoke test';
        const matrix = new MatrixElement(10, 100);
        matrix.setFromText('1 2\n3 4');
        const queue = new QueueElement(150, 100);
        queue.setFromText('front back');
        const stack = new StackElement(280, 100);
        stack.setFromText('bottom top');
        const tree = new TreeElement(400, 30);
        const treeError = tree.buildFromText('3\n1 2\n1 3', 'rooted');
        const graph = new GraphElement(600, 30);
        const graphError = graph.buildFromText('3 2\n1 2\n2 3');
        if (treeError || graphError) throw new Error(treeError || graphError);
        const pen = new PenElement();
        pen.addPoint(20, 340);
        pen.addPoint(90, 370);
        const mermaid = new MermaidElement(130, 330);
        const markdown = new MarkdownElement(360, 330);

        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        const elements = [shape, text, matrix, queue, stack, tree, graph, pen, mermaid, markdown];
        for (const element of elements) {
            element.rotation = Math.PI / 18;
            element.draw(ctx, { zoom: 1 });
        }
        return elements.map(element => element.type);
    });
    if (rendered.length !== 10) throw new Error('Not all representative element types rendered.');
    const markdownSecurity = await page.evaluate(async () => {
        const { MarkdownElement } = await import('/js/elements/MarkdownElement.js');
        const preview = document.createElement('div');
        preview.innerHTML = MarkdownElement.renderToHTML(
            '<img src=x onerror="window.__whiteboardXss = true"><script>window.__whiteboardXss = true</script>' +
            '<a href="javascript:alert(1)">raw link</a>\n\n' +
            '[unsafe](javascript:alert(1)) [entity](javascript&#58;alert(1)) ' +
            '![unsafe image](javascript:alert(1)) ' +
            '[safe](https://example.com) **bold** $x$'
        );
        return {
            imageCount: preview.querySelectorAll('img').length,
            scriptCount: preview.querySelectorAll('script').length,
            unsafeLinks: preview.querySelectorAll('a[href^="javascript:"]').length,
            scriptExecuted: window.__whiteboardXss === true,
            safeLink: preview.querySelector('a[href="https://example.com"]') !== null,
            boldText: preview.querySelector('strong')?.textContent === 'bold',
            formula: preview.querySelector('.katex') !== null
        };
    });
    if (markdownSecurity.imageCount || markdownSecurity.scriptCount || markdownSecurity.unsafeLinks ||
        markdownSecurity.scriptExecuted ||
        !markdownSecurity.safeLink || !markdownSecurity.boldText || !markdownSecurity.formula) {
        throw new Error('Markdown sanitization or safe formatting browser check failed: ' +
            JSON.stringify(markdownSecurity));
    }
    const katexVersion = await page.evaluate(() => window.katex?.version || '');
    const [katexMajor, katexMinor, katexPatch] = katexVersion.split('.').map(Number);
    if (!(katexMajor > 0 || katexMinor > 16 || (katexMinor === 16 && katexPatch >= 10))) {
        throw new Error('KaTeX must be at least the patched 0.16.10 release; loaded version: ' +
            (katexVersion || 'unavailable'));
    }
    const highlightVersion = await page.evaluate(() => window.hljs?.versionString || '');
    if (highlightVersion !== '11.11.2') {
        throw new Error('Highlight.js must load the pinned 11.11.2 release; loaded version: ' +
            (highlightVersion || 'unavailable'));
    }
    const markdownCodeHighlight = await page.evaluate(async () => {
        const { MarkdownElement } = await import('/js/elements/MarkdownElement.js');
        const sample = '#include <iostream>\nint main() { return 0; }';
        return ['```cpp\n' + sample + '\n```', '```\n' + sample + '\n```'].map(source => {
            const probe = document.createElement('div');
            probe.innerHTML = MarkdownElement.renderToHTML(source);
            MarkdownElement._applyRenderStyles(probe);
            const includeToken = [...probe.querySelectorAll('span')]
                .find(token => token.textContent.includes('#include'));
            return {
                includeText: includeToken?.textContent ?? null,
                includeColor: includeToken?.style.color ?? null,
                tokenClass: includeToken?.className ?? null,
                languageClass: probe.querySelector('pre code')?.className ?? null
            };
        });
    });
    if (markdownCodeHighlight.some(result => !result.includeText || !result.includeColor)) {
        throw new Error('C++ include directive did not receive syntax highlighting: ' +
            JSON.stringify(markdownCodeHighlight));
    }
    const markdownGfm = await page.evaluate(async () => {
        const { MarkdownElement } = await import('/js/elements/MarkdownElement.js');
        const preview = document.createElement('div');
        preview.innerHTML = MarkdownElement.renderToHTML(
            '| Item | Count |\n| --- | ---: |\n| apple | 2 |\n\n' +
            '- [x] done\n- [ ] pending\n\n~~removed~~\n\nhttps://example.com'
        );
        return {
            tableCell: preview.querySelector('table tbody td')?.textContent,
            checkedTask: preview.querySelector('input[type="checkbox"]')?.checked,
            deletedText: preview.querySelector('del')?.textContent,
            autolink: preview.querySelector('a[href="https://example.com"]')?.textContent
        };
    });
    if (markdownGfm.tableCell !== 'apple' || markdownGfm.checkedTask !== true ||
        markdownGfm.deletedText !== 'removed' || markdownGfm.autolink !== 'https://example.com') {
        throw new Error('GitHub-flavored Markdown coverage regressed: ' + JSON.stringify(markdownGfm));
    }
    const markdownAppearance = await page.evaluate(async () => {
        const { MarkdownElement } = await import('/js/elements/MarkdownElement.js');
        const probe = document.createElement('div');
        probe.innerHTML = MarkdownElement.renderToHTML('# Heading\n\n**Bold** and `code`');
        MarkdownElement._applyRenderStyles(probe);

        const emptyMarkdown = new MarkdownElement();
        const emptyDrawOps = [];
        emptyMarkdown.draw({
            save() {}, restore() {}, translate() {}, rotate() {},
            drawImage() { emptyDrawOps.push('image'); },
            fillText() { emptyDrawOps.push('text'); },
            fill() { emptyDrawOps.push('fill'); },
            stroke() { emptyDrawOps.push('stroke'); }
        }, { zoom: 1 });

        const markdown = new MarkdownElement(0, 0, '# Transparent\n\n**colored** text');
        const deadline = Date.now() + 12000;
        while (markdown._rendering && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (!markdown.img) return { ready: false };
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(markdown.width);
        canvas.height = Math.ceil(markdown.height);
        markdown.draw(canvas.getContext('2d'), { zoom: 1 });
        const edgePixel = canvas.getContext('2d').getImageData(
            canvas.width - 1, Math.floor(canvas.height / 2), 1, 1
        ).data;
        return {
            ready: true,
            headingHasNoRule: !probe.querySelector('h1').style.borderBottom,
            inlineCodeHasNoFill: probe.querySelector('code').style.backgroundColor === 'transparent',
            emptyElementHasNoDecoration: emptyDrawOps.length === 0,
            rightEdgeIsTransparent: edgePixel[3] === 0
        };
    });
    if (!markdownAppearance.ready || !markdownAppearance.headingHasNoRule ||
        !markdownAppearance.inlineCodeHasNoFill || !markdownAppearance.emptyElementHasNoDecoration ||
        !markdownAppearance.rightEdgeIsTransparent) {
        throw new Error('Markdown transparent text-style browser check failed: ' +
            JSON.stringify(markdownAppearance));
    }
    const mermaidLoadCount = await page.evaluate(async () => {
        const { Serializer } = await import('/js/core/Serializer.js');
        const app = {
            elements: [],
            camera: { x: 0, y: 0, zoom: 1 },
            history: { clear() {} },
            selectionManager: { clear() {} },
            renderer: { markDirty() {} }
        };
        const originalCreateObjectURL = URL.createObjectURL;
        let loadCount = 0;
        URL.createObjectURL = function (...args) {
            loadCount++;
            return originalCreateObjectURL.apply(this, args);
        };
        try {
            Serializer.loadJSONData(app, {
                elements: [{
                    type: 'mermaid', x: 0, y: 0, width: 200, height: 200,
                    svgString: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>'
                }]
            });
            return loadCount;
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
        }
    });
    if (mermaidLoadCount !== 1) throw new Error('Imported Mermaid content was loaded more than once.');
    const mermaidSanitization = await page.evaluate(async () => {
        const { MermaidElement } = await import('/js/elements/MermaidElement.js');
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
            '<script>alert(2)</script><image href="https://tracker.example/pixel.png"/>' +
            '<rect onmouseover="alert(3)" style="fill:url(https://tracker.example/paint.svg#x)"/>' +
            '</svg>';
        const element = new MermaidElement(0, 0, svg);
        return {
            hasScript: /<script/i.test(element.svgString),
            hasEventHandler: /\son[a-z]+\s*=/i.test(element.svgString),
            hasExternalResource: element.svgString.includes('https://tracker.example')
        };
    });
    if (Object.values(mermaidSanitization).some(Boolean)) {
        throw new Error('Imported Mermaid SVG retained active or external content: ' +
            JSON.stringify(mermaidSanitization));
    }
    const mermaidLoadRace = await page.evaluate(async () => {
        const { MermaidElement } = await import('/js/elements/MermaidElement.js');
        const OriginalImage = window.Image;
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;
        const images = [];
        const revoked = [];
        window.Image = class {
            constructor() { images.push(this); this.width = 0; this.height = 0; }
            set src(value) { this.source = value; }
        };
        URL.createObjectURL = () => `blob:mermaid-test-${images.length}`;
        URL.revokeObjectURL = value => revoked.push(value);
        try {
            const element = new MermaidElement(0, 0,
                '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
            element.deserialize({
                type: 'mermaid', x: 0, y: 0, width: 200, height: 200,
                svgString: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"></svg>'
            });
            const staleImage = images[0];
            const currentImage = images[1];
            staleImage.width = 900;
            staleImage.height = 800;
            staleImage.onload();
            const staleLoadIgnored = element.width === 200 && element.height === 200;
            currentImage.width = 20;
            currentImage.height = 30;
            currentImage.onload();
            const currentLoadPreservedBounds = element.width === 200 && element.height === 200;

            const freshElement = new MermaidElement(0, 0,
                '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"></svg>');
            const freshImage = images[2];
            freshImage.width = 20;
            freshImage.height = 30;
            freshImage.onload();
            return {
                staleLoadIgnored,
                currentLoadPreservedBounds,
                freshCreationFitsIntrinsic: freshElement.width === 20 && freshElement.height === 30,
                allObjectUrlsRevoked: revoked.length === 3
            };
        } finally {
            window.Image = OriginalImage;
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        }
    });
    if (Object.values(mermaidLoadRace).some(result => !result)) {
        throw new Error('Mermaid image loading or saved-size preservation failed: ' +
            JSON.stringify(mermaidLoadRace));
    }
    const historyRoundTrip = await page.evaluate(async () => {
        const [{ MatrixElement }, { QueueElement }] = await Promise.all([
            import('/js/elements/MatrixElement.js'),
            import('/js/elements/QueueElement.js')
        ]);
        const app = window.__whiteboard;
        const matrix = new MatrixElement(20, 20);
        matrix.setFromText('7');
        app.elements.push(matrix);
        app.layerManager._reindex();
        app.history.clear();
        matrix.selectedCells.add('0,0');
        app._deleteSelectedMatrixCells(matrix);
        const matrixDeleted = !app.elements.includes(matrix);
        app.history.undo();
        const matrixRestored = app.elements.includes(matrix) && matrix.data[0][0] === '7';
        app.history.redo();
        const matrixRedone = !app.elements.includes(matrix);

        const queue = new QueueElement(20, 20);
        queue.setFromText('7');
        app.elements.push(queue);
        app.layerManager._reindex();
        app.history.clear();
        queue.selectedIndices.add(0);
        app._deleteSelectedItems(queue);
        const queueDeleted = !app.elements.includes(queue);
        app.history.undo();
        const queueRestored = app.elements.includes(queue) && queue.items[0] === '7';
        app.history.redo();
        const queueRedone = !app.elements.includes(queue);
        app.history.clear();
        return { matrixDeleted, matrixRestored, matrixRedone, queueDeleted, queueRestored, queueRedone };
    });
    if (Object.values(historyRoundTrip).some(value => !value)) {
        throw new Error('A data-structure delete/undo/redo browser check failed.');
    }
    const inlineEditing = await page.evaluate(async () => {
        const [{ TreeElement }, { TextElement }] = await Promise.all([
            import('/js/tree/TreeElement.js'),
            import('/js/elements/TextElement.js')
        ]);
        const app = window.__whiteboard;
        const overlay = document.getElementById('text-edit-overlay');

        const tree = new TreeElement(40, 40);
        tree.buildFromText('2\n1 2 7', 'rooted');
        const node = tree.root.children[0];
        app.elements.push(tree);
        app.selectionManager.select(tree);
        app.history.clear();
        app._editTreeNodeValue(tree, node, 0, 0);
        const style = getComputedStyle(overlay);
        const nodeHasNoEditorFrame = style.borderTopWidth === '0px' &&
            style.backgroundColor === 'rgba(0, 0, 0, 0)';
        const originalDrawElementHandles = app.renderer._drawElementHandles;
        let handleDrawCount = 0;
        app.renderer._drawElementHandles = () => { handleDrawCount++; };
        const selectionCtx = { save() {}, restore() {} };
        app.renderer._drawSelectionOverlay(selectionCtx, 1);
        const selectionFrameHidden = handleDrawCount === 0;
        overlay.value = '9';
        overlay.dispatchEvent(new Event('input', { bubbles: true }));
        const nodePreviewSynced = node.value === '9';
        overlay.blur();
        app.renderer._drawSelectionOverlay(selectionCtx, 1);
        const selectionFrameRestored = handleDrawCount === 1;
        app.renderer._drawElementHandles = originalDrawElementHandles;
        const nodeCommitSynced = node.value === '9';
        app.history.undo();
        const nodeUndoSynced = node.value === '2';
        app.history.redo();
        const nodeRedoSynced = node.value === '9';
        const savedTree = tree.serialize();
        const restoredTree = TreeElement.fromData(savedTree);
        restoredTree.deserialize(savedTree);
        const nodeSaveSynced = restoredTree.root.children[0].value === '9';
        app.elements.splice(app.elements.indexOf(tree), 1);
        app.selectionManager.clear();

        const edgeTree = new TreeElement(40, 40);
        edgeTree.buildFromText('2\n1 2 7', 'rooted');
        const edgeNode = edgeTree.root.children[0];
        app.elements.push(edgeTree);
        app.layerManager._reindex();
        app.selectionManager.select(edgeTree);
        app.history.clear();
        const { offsetX, offsetY } = edgeTree._getCurrentOffsets();
        const midpoint = edgeTree.toWorldPoint(
            (edgeTree.root.x + edgeNode.x) / 2 + offsetX,
            (edgeTree.root.y + edgeNode.y) / 2 + offsetY
        );
        const edgeScreenPos = app.camera.worldToScreen(midpoint.x, midpoint.y);
        const canvasRect = app.canvas.getBoundingClientRect();
        app.toolbar.setTool('select');
        app._onDoubleClick({
            clientX: canvasRect.left + edgeScreenPos.x,
            clientY: canvasRect.top + edgeScreenPos.y
        });
        const edgeEditorHasNoFrame = getComputedStyle(overlay).borderTopWidth === '0px' &&
            getComputedStyle(overlay).backgroundColor === 'rgba(0, 0, 0, 0)';
        const edgeEditorCentered = Math.abs(
            parseFloat(overlay.style.left) + parseFloat(overlay.style.width) / 2 -
            canvasRect.left - edgeScreenPos.x
        ) < 0.5;
        let edgeHandleDrawCount = 0;
        const originalEdgeHandleDraw = app.renderer._drawElementHandles;
        app.renderer._drawElementHandles = () => { edgeHandleDrawCount++; };
        app.renderer._drawSelectionOverlay(selectionCtx, 1);
        const edgeSelectionFrameHidden = edgeHandleDrawCount === 0;
        overlay.value = '9';
        overlay.dispatchEvent(new Event('input', { bubbles: true }));
        const edgePreviewSynced = edgeNode.meta.edgeWeight === '9';
        overlay.blur();
        app.renderer._drawSelectionOverlay(selectionCtx, 1);
        const edgeSelectionFrameRestored = edgeHandleDrawCount === 1;
        app.renderer._drawElementHandles = originalEdgeHandleDraw;
        const edgeCommitSynced = edgeNode.meta.edgeWeight === '9';
        app.history.undo();
        const edgeUndoSynced = edgeNode.meta.edgeWeight === '7';
        app.history.redo();
        const edgeRedoSynced = edgeNode.meta.edgeWeight === '9';
        const savedEdgeTree = edgeTree.serialize();
        const restoredEdgeTree = TreeElement.fromData(savedEdgeTree);
        restoredEdgeTree.deserialize(savedEdgeTree);
        const edgeSaveSynced = restoredEdgeTree.root.children[0].meta.edgeWeight === '9';
        app.elements.splice(app.elements.indexOf(edgeTree), 1);
        app.selectionManager.clear();

        const text = new TextElement(80, 80);
        text.text = 'before';
        text.autoSize(app.renderer.ctx);
        text.width *= 1.5;
        text.height *= 1.25;
        const savedText = text.serialize();
        const restoredText = TextElement.fromData(savedText);
        restoredText.deserialize(savedText);
        app.elements.push(restoredText);
        app.history.clear();
        app._startTextEditing(restoredText);
        overlay.value = 'a much longer string';
        overlay.dispatchEvent(new Event('input', { bubbles: true }));
        const textPreviewSynced = restoredText.text === overlay.value &&
            restoredText.width > savedText.width;
        app._finishTextEditing();
        const editedWidth = restoredText.width;
        app.history.undo();
        const textUndoSynced = restoredText.text === 'before' && restoredText.width < editedWidth;
        app.history.redo();
        const textRedoSynced = restoredText.text === 'a much longer string' &&
            restoredText.width === editedWidth;
        app.elements.splice(app.elements.indexOf(restoredText), 1);
        app.history.clear();
        app.renderer.markDirty();

        return {
            nodeHasNoEditorFrame, selectionFrameHidden, selectionFrameRestored,
            nodePreviewSynced, nodeCommitSynced,
            nodeUndoSynced, nodeRedoSynced, nodeSaveSynced,
            edgeEditorHasNoFrame, edgeEditorCentered, edgeSelectionFrameHidden, edgeSelectionFrameRestored,
            edgePreviewSynced, edgeCommitSynced, edgeUndoSynced, edgeRedoSynced,
            edgeSaveSynced, textPreviewSynced,
            textUndoSynced, textRedoSynced
        };
    });
    if (Object.values(inlineEditing).some(value => !value)) {
        throw new Error('An inline tree/text editing synchronization check failed: ' +
            JSON.stringify(inlineEditing));
    }
    const pointerCaptureCancellation = await page.evaluate(() => {
        const app = window.__whiteboard;
        const originalRelease = app.canvas.releasePointerCapture;
        let releases = 0;
        app._activePointerId = 999;
        app.canvas.releasePointerCapture = pointerId => {
            releases++;
            app._cancelPointerInteraction(pointerId);
        };
        try {
            app._cancelPointerInteraction(999);
            return releases === 1 && app._activePointerId === null;
        } finally {
            app.canvas.releasePointerCapture = originalRelease;
            app._activePointerId = null;
        }
    });
    if (!pointerCaptureCancellation) {
        throw new Error('Pointer cancellation must clear its active ID before releasing capture.');
    }
    if (pageErrors.length) {
        throw new AggregateError(pageErrors, 'The page reported uncaught JavaScript errors.');
    }
    if (localResourceFailures.length) {
        throw new Error('The page requested missing local project resources: ' +
            localResourceFailures.join('; '));
    }
    console.log('Browser smoke test passed.');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await browser?.close();
    if (server.listening) {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}
