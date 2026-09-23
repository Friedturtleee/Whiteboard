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
    page.on('pageerror', error => pageErrors.push(error));
    page.on('request', request => {
        if (/clerk|whiteboard-server\.friedturtleee\.workers\.dev/i.test(request.url())) {
            collaborationRequests.push(request.url());
        }
    });
    const port = server.address().port;
    const response = await page.goto(`http://127.0.0.1:${port}/index.html`, {
        waitUntil: 'domcontentloaded'
    });
    if (!response?.ok()) {
        throw new Error(`Whiteboard page returned HTTP ${response?.status() ?? 'no response'}.`);
    }
    await page.waitForSelector('#main-canvas');
    await new Promise(resolve => setTimeout(resolve, 300));
    const collaborationUiPresent = await page.evaluate(() => Boolean(
        document.querySelector('#collab-status, #collab-status-text, [data-clerk-publishable-key]') ||
        window.Clerk
    ));
    if (collaborationUiPresent || collaborationRequests.length) {
        throw new Error('The local-only page unexpectedly loaded collaboration UI or services.');
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
            '<img src=x onerror="window.__whiteboardXss = true"><script>window.__whiteboardXss = true</script>\n\n' +
            '[unsafe](javascript:alert(1)) ![unsafe image](javascript:alert(1)) ' +
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
    if (pageErrors.length) {
        throw new AggregateError(pageErrors, 'The page reported uncaught JavaScript errors.');
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
