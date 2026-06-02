const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
app.use(express.static(__dirname));

const server = app.listen(3000, async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        
        await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0' });
        await browser.close();
        server.close();
    } catch(e) {
        console.error(e);
        server.close();
    }
});
