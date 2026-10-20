import assert from 'node:assert/strict';

/** Reproduce canvas gestures, modal retries, and constrained window layouts. */
export async function checkInterface(page) {
    const fill = (selector, text) => page.$eval(selector, (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    await page.setViewport({ width: 1000, height: 700 });
    await page.evaluate(async () => {
        const app = window.__whiteboard;
        app._dismissPendingDialogs();
        app._cancelPointerInteraction();
        app.elements = [];
        app.history.clear();
        app.camera.x = app.camera.y = 0;
        app.camera.zoom = 1;
        app.toolbar.setTool('select');
        const { MatrixElement } = await import('/js/elements/MatrixElement.js');
        const matrix = new MatrixElement(100, 100);
        matrix.setFromText('1 2 3\n4 5 6\n7 8 9');
        app.elements.push(matrix);
        app.selectionManager.clear();
        app.layerManager._reindex();
        app._refreshUI();
    });
    await page.mouse.move(131, 131);
    await page.mouse.down();
    await page.mouse.move(215, 215, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].selectedCells.size), 9,
        'Dragging across a matrix must select its rectangular cell range.');
    assert.equal(await page.$eval('#selected-cells-status', el => el.textContent), '已選取 9 格');
    await page.mouse.click(131, 131, { count: 2 });
    const batchOpened = await page.evaluate(() => ({
        open: Boolean(document.querySelector('.modal-overlay textarea')),
        tool: window.__whiteboard.toolbar.currentTool,
        selected: [...window.__whiteboard.elements[0].selectedCells],
        target: document.elementFromPoint(131, 131)?.id,
        active: document.activeElement.id
    }));
    assert.equal(batchOpened.open, true, JSON.stringify(batchOpened));
    await fill('.modal-overlay textarea', '42');
    await page.click('.modal-actions .btn-primary');
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].data.flat().every(value => value === '42')), true,
        'Double-clicking a selected range must edit the complete selection.');

    await page.click('#edit-element-data');
    await fill('.modal-overlay textarea', '6 7');
    await page.evaluate(() => window.__whiteboard.textInputDialog.flushPreview());
    await page.mouse.click(5, 5);
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].data.flat().every(value => value === '42')), true,
        'Dismissing a matrix dialog through its background must restore the saved data.');
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app.selectionManager.select(app.elements[0]);
        app._refreshUI();
    });
    await page.click('#property-panel .color-swatch-custom');
    await page.waitForSelector('.custom-color-popup');
    const beforeColor = await page.evaluate(() => window.__whiteboard.elements[0].color);
    await fill('.ccp-hex', '#xyzxyz');
    assert.equal(await page.$eval('.ccp-apply', button => button.disabled), true);
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].color), beforeColor);
    await fill('.ccp-hex', 'abc');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].color), '#aabbcc');
    assert.equal(await page.$('.custom-color-popup'), null);

    await page.evaluate(() => window.__whiteboard._createGraph(350, 100));
    await fill('.modal-overlay textarea', '3 2\n1 2');
    await page.click('.modal-actions .btn-primary');
    assert.equal(await page.$eval('.modal-overlay textarea', input => input.value), '3 2\n1 2');
    assert.equal(await page.$eval('.dialog-error', error => !error.hidden && Boolean(error.textContent)), true,
        'Invalid graph input must remain editable with an inline error.');
    assert.equal(await page.$eval('#toolbar', el => el.inert), true);
    await page.focus('.modal-actions .btn-primary');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '圖的輸入格式');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '確認');
    await fill('.modal-overlay textarea', '3 2\n1 2\n2 3');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    assert.equal(await page.$('.modal-overlay'), null);
    assert.equal(await page.evaluate(() => window.__whiteboard.elements.at(-1).nodes.size), 3);
    assert.equal(await page.$eval('#toolbar', el => el.inert), false);

    const centerStable = await page.evaluate(() => {
        const app = window.__whiteboard;
        app.camera.x = 250; app.camera.y = -100; app.camera.zoom = 3;
        const before = app.camera.screenToWorld(500, 350);
        document.getElementById('zoom-display').click();
        const after = app.camera.screenToWorld(500, 350);
        return app.camera.zoom === 1.5 && Math.hypot(before.x - after.x, before.y - after.y) < 1e-8;
    });
    assert.equal(centerStable, true, 'Resetting zoom must keep the visible board center fixed.');
    await page.evaluate(() => {
        const app = window.__whiteboard;
        const matrix = app.elements[0];
        app._editMatrixCell(matrix, 0, 0);
        document.getElementById('text-edit-overlay').value = 'zoom-safe edit';
        app.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].data[0][0]), 'zoom-safe edit');
    assert.equal(await page.$eval('#text-edit-overlay', el => el.style.display), 'none');
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app.selectionManager.select(app.elements[0]); app._refreshUI();
    });
    await page.focus('#prop-x');
    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[0].x), 100,
        'An empty coordinate field must not move an element to zero.');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#prop-x', input => input.value), '100');
    await page.focus('#prop-x');
    await page.focus('#main-canvas');
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app.selectionManager.select(app.elements[1]); app._refreshUI();
    });
    await page.focus('#prop-x');
    await fill('#prop-x', '370');
    await page.$eval('#prop-x', input => input.dispatchEvent(new Event('change', { bubbles: true })));
    assert.deepEqual(await page.evaluate(() => window.__whiteboard.elements.map(el => el.x)), [100, 370],
        'Refocusing a coordinate after switching selection must edit the newly selected object.');
    await fill('#prop-x', '450');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__whiteboard.elements[1].x), 370,
        'Escape must cancel the current property preview without changing its prior commit.');

    for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewport(viewport);
        const layout = await page.evaluate(async () => {
            const app = window.__whiteboard;
            const { ShapeElement } = await import('/js/elements/ShapeElement.js');
            app.elements = Array.from({ length: 25 }, (_, index) => new ShapeElement('rectangle', index * 10, 20, 50, 50));
            app.selectionManager.select(app.elements[0]);
            app.layerManager._reindex(); app._refreshUI();
            const rect = id => document.getElementById(id).getBoundingClientRect();
            const toolbar = rect('toolbar'), property = rect('property-panel'), layer = rect('layer-panel');
            const top = rect('top-bar'), zoom = rect('zoom-bar');
            const separate = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
            return {
                toolbarBounded: toolbar.top >= 0 && toolbar.bottom <= innerHeight,
                panelsSeparate: property.bottom <= layer.top,
                topClear: separate(top, property) && separate(top, layer),
                zoomClear: separate(zoom, property) && separate(zoom, layer)
            };
        });
        assert.ok(Object.values(layout).every(Boolean), JSON.stringify({ viewport, layout }));
        await page.click('#toggle-properties');
        assert.equal(await page.$eval('#toggle-properties', el => el.getAttribute('aria-expanded')), 'false');
        await page.click('#toggle-properties');
        await page.$eval('[data-tool="graph"]', el => el.scrollIntoView({ block: 'nearest' }));
        await page.hover('[data-tool="graph"]');
        assert.equal(await page.$eval('.app-tooltip', el => {
            const r = el.getBoundingClientRect();
            return !el.hidden && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        }), true);
        await page.click('#property-panel .color-swatch-custom');
        await page.waitForSelector('.custom-color-popup');
        assert.equal(await page.$eval('.custom-color-popup', el => {
            const r = el.getBoundingClientRect();
            return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        }), true, 'The custom color editor must stay inside short and narrow windows.');
        await page.keyboard.press('Escape');
        const stableLayers = await page.evaluate(() => {
            const list = document.getElementById('layer-list');
            list.scrollTop = list.scrollHeight;
            const before = list.scrollTop;
            const button = list.lastElementChild.querySelector('.layer-lock');
            const id = button.closest('.layer-item').dataset.elId;
            button.focus(); button.click();
            return Math.abs(before - list.scrollTop) <= 1 &&
                document.activeElement.classList.contains('layer-lock') &&
                document.activeElement.closest('.layer-item').dataset.elId === id;
        });
        assert.equal(stableLayers, true, 'Updating a layer must preserve scroll position and keyboard focus.');
    }
    await page.setViewport({ width: 844, height: 390 });
    await page.evaluate(async () => {
        const app = window.__whiteboard;
        const { MatrixElement } = await import('/js/elements/MatrixElement.js');
        app.camera.x = app.camera.y = 0; app.camera.zoom = 1;
        const matrix = new MatrixElement(400, 280); matrix.setFromText('1 2 3\n4 5 6');
        app.elements = [matrix]; app.selectionManager.clear(); app.layerManager._reindex(); app._refreshUI();
    });
    await page.mouse.click(450, 320, { button: 'right' });
    assert.equal(await page.$eval('#context-menu', el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    }), true, 'The full matrix context menu must remain within the viewport.');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ctx-delete');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ctx-rename');
    await page.keyboard.press('Escape');
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => window.__whiteboard._createMarkdown(100, 100));
    await fill('.markdown-editor-pane textarea', '# 題解\n[連結](https://example.com)\n\n```cpp\nint value = 1;\n```');
    await page.waitForFunction(() => document.querySelector('.markdown-preview-content h1')?.textContent === '題解');
    assert.equal(await page.evaluate(() => {
        const editor = document.querySelector('.markdown-editor-pane').getBoundingClientRect();
        const preview = document.querySelector('.markdown-preview-pane').getBoundingClientRect();
        const footer = document.querySelector('.markdown-dialog-footer').getBoundingClientRect();
        return editor.bottom <= preview.top + 1 && editor.height > 80 && preview.height > 80 && footer.bottom <= innerHeight;
    }), true, 'The Markdown editor and preview must stack within narrow windows.');
    const oldURL = page.url();
    await page.click('.markdown-preview-content a');
    assert.equal(page.url(), oldURL, 'A preview link must not navigate away from an unfinished edit.');
    await page.keyboard.press('Escape');
    await page.click('#btn-settings');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-close');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#settings-modal', el => el.classList.contains('open')), false);
    assert.equal(await page.$eval('#toolbar', el => el.inert), false);
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app._cancelPointerInteraction(); app.elements = []; app.selectionManager.clear();
        app.history.clear(); app.layerManager._reindex(); app._refreshUI();
    });
    await page.setViewport({ width: 1000, height: 700 });
    await checkMultilineText(page);
    await checkCellEditing(page);
    await checkMatrixClipboard(page);
    await checkFitView(page);
}

async function checkFitView(page) {
    await page.setViewport({ width: 1000, height: 700 });
    await page.evaluate(() => window.__whiteboard._createTree(100, 100));
    await page.$eval('.modal-overlay textarea', input => {
        input.value = ['7', ...Array.from({ length: 6 }, (_, i) => `1 ${i + 2} ${i + 1}000000000`)].join('\n');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('.modal-actions .btn-primary');
    const framed = () => page.evaluate(() => {
        const app = window.__whiteboard;
        const left = document.getElementById('toolbar').getBoundingClientRect().right;
        const right = document.getElementById('right-panels').getBoundingClientRect().left;
        const top = document.getElementById('top-bar').getBoundingClientRect().bottom;
        const bottom = document.getElementById('zoom-bar').getBoundingClientRect().top;
        return app.elements.filter(el => !el.hidden).every(el => {
            const b = el.getRotatedBounds();
            const p = app.camera.worldToScreen(b.x, b.y), q = app.camera.worldToScreen(b.x + b.w, b.y + b.h);
            return p.x >= left && q.x <= right && p.y >= top && q.y <= bottom;
        });
    });
    assert.equal(await framed(), true, 'Confirming a large weighted tree must immediately show its complete frame.');
    const before = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const { MatrixElement } = await import('/js/elements/MatrixElement.js');
        const matrix = new MatrixElement(-4000, 3000); matrix.rotation = 0.4;
        app.elements.push(matrix); app._refreshUI();
        const state = app.elements.map(el => el.serialize());
        app.camera.x = 10000; app.camera.y = -10000;
        return JSON.stringify(state);
    });
    await page.click('#btn-fit-view');
    assert.equal(await framed(), true, 'Show all must include distant and rotated objects.');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__whiteboard.elements.map(el => el.serialize()))), before,
        'Fitting the view must change only the camera, preserving every element proportion.');
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app.elements = []; app.history.clear(); app.selectionManager.clear(); app.camera.reset(); app._refreshUI();
    });
}

async function checkMatrixClipboard(page) {
    const result = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const { MatrixElement } = await import('/js/elements/MatrixElement.js');
        const matrix = new MatrixElement(100, 100);
        matrix.setFromText('1 2 3\n4 5 6\n7 8 9'); app.elements.push(matrix);
        app.selectionManager.select(matrix); app._refreshUI(); app.canvas.focus();
        const event = (type, text = '') => {
            const data = new DataTransfer(); data.setData('text/plain', text);
            app.canvas.dispatchEvent(new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }));
            return data.getData('text/plain');
        };
        matrix.selectedCells = new Set(['0,0', '0,1', '1,0', '1,1']);
        const copied = event('copy');
        event('paste', '11\t12\n13\t14');
        const pasted = matrix.data.map(row => [...row]);
        event('cut');
        const cutClearedOnlyCells = matrix.data[0][0] === '' && matrix.data[1][1] === '' &&
            matrix.rows === 3 && matrix.cols === 3 && matrix.data[2][2] === '9';
        app.history.undo();
        const cutUndo = matrix.data[0][0] === '11' && matrix.data[1][1] === '14';
        matrix.selectedCells = new Set(['0,0']);
        event('paste', '21\t\t23\n24\ttext with spaces\t26');
        const rectangle = matrix.data.map(row => [...row]);
        const beforeInvalid = JSON.stringify(matrix.data);
        matrix.selectedCells = new Set(['2,2']);
        event('paste', '1 2 3');
        const rejected = JSON.stringify(matrix.data) === beforeInvalid;
        app.elements = []; app.history.clear(); app.selectionManager.clear(); app._refreshUI();
        return { copied, pasted, cutClearedOnlyCells, cutUndo, rectangle, rejected };
    });
    assert.equal(result.copied, '1\t2\n4\t5');
    assert.deepEqual(result.pasted, [['11', '12', '3'], ['13', '14', '6'], ['7', '8', '9']]);
    assert.equal(result.cutClearedOnlyCells && result.cutUndo && result.rejected, true);
    assert.deepEqual(result.rectangle, [['21', '', '23'], ['24', 'text with spaces', '26'], ['7', '8', '9']]);
}

async function checkCellEditing(page) {
    const results = await page.evaluate(async () => {
        const app = window.__whiteboard;
        app.camera.x = app.camera.y = 0; app.camera.zoom = 1.5;
        const { MatrixElement } = await import('/js/elements/MatrixElement.js');
        const { StackElement } = await import('/js/elements/StackElement.js');
        const { QueueElement } = await import('/js/elements/QueueElement.js');
        const results = [];
        for (const ElementClass of [MatrixElement, StackElement, QueueElement]) {
            const element = new ElementClass(100, 100);
            element.setFromText('1 2 3'); app.elements.push(element);
            const size = { width: element.width, height: element.height };
            if (element.type === 'matrix') app._editMatrixCell(element, 0, 0);
            else app._editSequenceItem(element, 0);
            const editor = document.getElementById('text-edit-overlay');
            const shortFont = Number.parseFloat(editor.style.fontSize);
            const longValue = 'a value much longer than one cell';
            editor.value = longValue; editor.dispatchEvent(new Event('input', { bubbles: true }));
            const longFont = Number.parseFloat(editor.style.fontSize);
            editor.value = 'first row\nsecond row\nthird row';
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            const multilineFits = Number.parseFloat(editor.style.lineHeight) * 3 <= editor.clientHeight;
            editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
            const composingKeptOpen = app._inlineEdit?.element === element;
            app._finishInlineEditing();
            const value = element.type === 'matrix' ? element.data[0][0] : element.items[0];
            const stable = element.width === size.width && element.height === size.height;
            app.history.undo();
            const restored = (element.type === 'matrix' ? element.data[0][0] : element.items[0]) === '1';
            results.push({ type: element.type, shortFont, longFont, value, stable, restored, composingKeptOpen, multilineFits });
        }
        app.elements = []; app.history.clear(); app.selectionManager.clear(); app._refreshUI();
        return results;
    });
    for (const result of results) {
        assert.ok(result.longFont > 0 && result.longFont < result.shortFont, JSON.stringify(result));
        assert.equal(result.value, 'first row\nsecond row\nthird row');
        assert.equal(result.stable && result.restored && result.composingKeptOpen && result.multilineFits, true, JSON.stringify(result));
    }
}

async function checkMultilineText(page) {
    const layout = await page.evaluate(async () => {
        const app = window.__whiteboard;
        const { TextElement } = await import('/js/elements/TextElement.js');
        app.camera.x = app.camera.y = 0; app.camera.zoom = 1.25;
        const text = new TextElement(100, 80);
        text.text = '多行文字 Hello\n第二行文字 abcdefghij\n第三行 0123456789';
        text.fontSize = 24; text.autoSize(app.ctx);
        text.width *= 1.2; text.height *= 1.5; text.rotation = 0.15;
        app.elements.push(text); app._startTextEditing(text);
        const editor = document.getElementById('text-edit-overlay');
        const style = getComputedStyle(editor);
        const matrix = new DOMMatrix(style.transform);
        const result = {
            fontSize: style.fontSize, lineHeight: style.lineHeight,
            scaleX: Math.hypot(matrix.a, matrix.b), scaleY: Math.hypot(matrix.c, matrix.d),
            color: style.color, whiteSpace: style.whiteSpace,
            width: text.width, height: text.height
        };
        app._finishTextEditing();
        result.stable = text.width === result.width && text.height === result.height;
        text.rotation = 0;
        app._startTextEditing(text);
        editor.value = Array.from({ length: 500 }, (_, i) => `第 ${i} 行文字`).join('\n');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.setSelectionRange(editor.value.length, editor.value.length);
        return result;
    });
    assert.equal(layout.fontSize, '24px');
    assert.equal(layout.whiteSpace, 'pre');
    assert.notEqual(layout.color, 'rgba(0, 0, 0, 0)');
    assert.ok(Math.abs(layout.scaleX - 1.5) < 1e-5);
    assert.ok(Math.abs(layout.scaleY - 1.875) < 1e-5);
    assert.equal(layout.stable, true, 'Committing multiline text must preserve its geometry.');
    await page.keyboard.press('End');
    await page.keyboard.type(' appended');
    const longText = await page.$eval('#text-edit-overlay', editor => ({
        scrolled: editor.scrollTop > 0,
        atEnd: editor.scrollHeight - editor.scrollTop - editor.clientHeight < 3,
        bounded: editor.getBoundingClientRect().bottom <= innerHeight,
        value: editor.value
    }));
    assert.equal(longText.scrolled && longText.atEnd && longText.bounded, true,
        'Hundreds of lines must keep the caret visible in a bounded scrolling editor.');
    assert.ok(longText.value.endsWith(' appended'));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__whiteboard.elements.at(-1).text.split('\n').length), 3,
        'Canceling a long edit must restore the original multiline text.');
    const pannedEditor = await page.evaluate(() => {
        const app = window.__whiteboard;
        const text = app.elements.at(-1);
        text.text = Array.from({ length: 500 }, (_, i) => `第 ${i} 行文字`).join('\n');
        text.autoSize(app.ctx);
        app.camera.y = 5000;
        app._startTextEditing(text);
        const editor = document.getElementById('text-edit-overlay');
        const bounds = editor.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, scrollTop: editor.scrollTop };
    });
    assert.ok(pannedEditor.top >= 0 && pannedEditor.bottom <= 700 && pannedEditor.scrollTop > 1000,
        'Reopening the visible middle of long text must keep the editor onscreen.');
    await page.evaluate(() => {
        const app = window.__whiteboard;
        app._finishTextEditing();
        app.elements = []; app.history.clear(); app.selectionManager.clear(); app._refreshUI();
    });
}
