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
