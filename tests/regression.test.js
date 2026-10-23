import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueueElement } from '../js/elements/QueueElement.js';
import { StackElement } from '../js/elements/StackElement.js';
import { MatrixElement } from '../js/elements/MatrixElement.js';
import { fitCanvasTextFontSize, drawCanvasCellText } from '../js/core/CanvasTextFit.js';
import { parsePastedMatrixRows } from '../js/core/DataTokens.js';
import { TextElement } from '../js/elements/TextElement.js';
import { PenElement } from '../js/elements/PenElement.js';
import { Serializer } from '../js/core/Serializer.js';
import { validateWhiteboardElement } from '../js/core/WhiteboardElementValidation.js';
import { History } from '../js/core/History.js';
import { SelectionManager } from '../js/core/SelectionManager.js';
import { Transform } from '../js/core/Transform.js';
import { HitTest } from '../js/canvas/HitTest.js';
import { Renderer } from '../js/canvas/Renderer.js';
import { Camera } from '../js/canvas/Camera.js';
import { Grid } from '../js/canvas/Grid.js';
import { ShapeElement } from '../js/elements/ShapeElement.js';
import { GraphElement } from '../js/graph/GraphElement.js';
import { GraphParser } from '../js/graph/GraphParser.js';
import { GraphLayout } from '../js/graph/GraphLayout.js';
import { GraphRenderer } from '../js/graph/GraphRenderer.js';
import { TreeElement } from '../js/tree/TreeElement.js';
import { TreeLayout } from '../js/tree/TreeLayout.js';
import { TreeParser } from '../js/tree/TreeParser.js';
import { TreeRenderer } from '../js/tree/TreeRenderer.js';
import { MarkdownElement } from '../js/elements/MarkdownElement.js';
import { authorizeRequest, getRoomId } from '../server/src/auth.mjs';
import { formatDataToken, splitDataTokens } from '../js/core/DataTokens.js';
import { i18n, translateText } from '../js/ui/I18n.js';
import { labelTooltipControls } from '../js/ui/Interface.js';

function fakeI18nElement(className = '', childNodes = []) {
    const element = {
        nodeType: 1,
        className,
        childNodes,
        parentElement: null,
        matches: () => false,
        getAttribute: () => null,
        setAttribute() {},
        closest(selector) {
            const classes = new Set([...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]));
            for (let current = this; current; current = current.parentElement) {
                if (current.className.split(/\s+/).some(name => classes.has(name))) return current;
            }
            return null;
        },
        querySelectorAll() {
            const descendants = [];
            const visit = parent => {
                for (const child of parent.childNodes) {
                    if (child.nodeType !== 1) continue;
                    descendants.push(child);
                    visit(child);
                }
            };
            visit(this);
            return descendants;
        }
    };
    for (const child of childNodes) child.parentElement = element;
    return element;
}

test('English is the default UI language and Traditional Chinese is selectable', () => {
    assert.equal(translateText('設定'), 'Settings');
    assert.equal(translateText('載入更多白板'), 'Load more boards');
    assert.equal(translateText('Owner', 'zh-TW'), '擁有者');
    assert.equal(translateText('編輯者', 'en'), 'Editor');
    assert.equal(translateText('Viewer', 'zh-TW'), '檢視者');
    assert.equal(translateText('帳號已切換。請先匯出尚未同步的白板 JSON。', 'en'), 'Account changed. Export the unsynced board as JSON first.');
    assert.equal(translateText('Settings', 'zh-TW'), '設定');
    assert.equal(translateText('確認', 'en'), 'Confirm');
    assert.equal(translateText('Confirm', 'zh-TW'), '確認');
    assert.equal(translateText('套用', 'en'), 'Apply');
    assert.equal(translateText('Apply', 'zh-TW'), '套用');
    assert.equal(translateText('改名', 'en'), 'Rename board');
    assert.equal(translateText('Rename board', 'zh-TW'), '改名');
    assert.equal(translateText('Rename', 'zh-TW'), '重新命名');
    assert.equal(translateText('樹資料格式無效。', 'en'), 'Tree data format is invalid.');
    assert.equal(translateText('Tree data format is invalid.', 'zh-TW'), '樹資料格式無效。');
    assert.equal(translateText('切換白板前，請先匯出或清除舊帳號的復原草稿。', 'en'), 'Before switching boards, export or clear the previous account\'s recovery draft.');
    assert.equal(translateText('Before switching boards, export or clear the previous account\'s recovery draft.', 'zh-TW'), '切換白板前，請先匯出或清除舊帳號的復原草稿。');
    assert.equal(translateText('編輯矩陣'), 'Edit matrix');
    assert.equal(translateText('繁體中文'), 'Traditional Chinese');
    assert.equal(translateText('必要模組載入失敗'), 'A required module failed to load');
    assert.equal(translateText('Traditional Chinese', 'zh-TW'), '繁體中文');
    assert.equal(translateText('A required module failed to load', 'zh-TW'), '必要模組載入失敗');
    assert.equal(translateText('編輯堆疊'), 'Edit stack');
    assert.equal(translateText('編輯佇列'), 'Edit queue');
    assert.equal(translateText('編輯文字'), 'Edit text');
    assert.equal(translateText('文字編輯器'), 'Text editor');
    assert.equal(translateText('編輯儲存格內容'), 'Edit cell content');
    assert.equal(translateText('Markdown 編輯器'), 'Markdown editor');
    assert.equal(translateText('Markdown 原始碼'), 'Markdown source');
    assert.equal(translateText('編輯矩陣內容'), 'Edit matrix content');
    assert.equal(translateText('編輯堆疊內容'), 'Edit stack content');
    assert.equal(translateText('編輯佇列內容'), 'Edit queue content');
    assert.equal(translateText('輸入矩陣資料；單一字元會填滿全部格子。'), 'Enter matrix data. One character fills every cell.');
    assert.equal(translateText('Enter matrix data. One character fills every cell.', 'zh-TW'), '輸入矩陣資料；單一字元會填滿全部格子。');
    assert.equal(translateText('數值以空格或換行分隔。'), 'Separate values with spaces or new lines.');
    assert.equal(translateText('編輯選取的 3 格'), 'Edit 3 selected cells');
    assert.equal(translateText('單一值填滿所有選取格；或輸入 3 個值。'), 'One value fills all selected cells; enter 3 values to set them individually.');
    assert.equal(translateText('輸入 1 個值套用全部，或輸入 3 個值。'), 'Enter one value for all selected cells or enter 3 values.');
    assert.equal(translateText('例：1 2 3'), 'Example: 1 2 3');
    assert.equal(translateText('Example: 1 2 3', 'zh-TW'), '例：1 2 3');
    assert.equal(translateText('Edit 3 selected cells', 'zh-TW'), '編輯選取的 3 格');
    assert.equal(translateText('編輯選取的 3 格內容', 'en'), 'Edit values in 3 selected cells');
    assert.equal(translateText('Edit values in 3 selected cells', 'zh-TW'), '編輯選取的 3 格內容');
    assert.equal(translateText('Edit queue content', 'zh-TW'), '編輯佇列內容');
    assert.equal(translateText('Edit cell content', 'zh-TW'), '編輯儲存格內容');
    assert.equal(translateText('N M 後接 M 行邊：u v [w]', 'en'), 'N M followed by M edges: u v [w]');
    assert.equal(translateText('第 1 行權重須為有限數值。', 'en'), 'Weight on line 1 must be a finite number.');
    assert.equal(translateText('Weight on line 1 must be a finite number.', 'zh-TW'), '第 1 行權重須為有限數值。');
    assert.equal(translateText('標頭宣告 1 條邊，實際有 0 行。', 'en'), 'Header declares 1 edge, but 0 rows were found.');
    assert.equal(translateText('Header declares 1 edge, but 0 rows were found.', 'zh-TW'), '標頭宣告 1 條邊，實際有 0 行。');
    assert.equal(translateText('有 1 個節點無法從根節點到達。', 'en'), '1 node is unreachable from the root.');
    assert.equal(translateText('1 node is unreachable from the root.', 'zh-TW'), '有 1 個節點無法從根節點到達。');
    assert.equal(translateText('1 node is unreachable from node 4.', 'zh-TW'), '有 1 個節點無法從節點 4 到達。');
    assert.equal(translateText('1 node is disconnected.', 'zh-TW'), '有 1 個節點無法連通。');
    assert.equal(translateText('鄰接列表須有 1 行非空資料。', 'en'), 'Adjacency list must contain 1 non-empty row.');
    assert.equal(translateText('Adjacency list must contain 1 non-empty row.', 'zh-TW'), '鄰接列表須有 1 行非空資料。');
    assert.equal(translateText('N=2 時，需提供 1 條邊。', 'en'), 'For N=2, provide 1 edge.');
    assert.equal(translateText('For N=2, provide 1 edge.', 'zh-TW'), 'N=2 時，需提供 1 條邊。');
    assert.equal(translateText('Tree edge data limit: 20000 rows.', 'zh-TW'), '樹邊資料上限為 20000 行。');
    assert.equal(translateText('Node IDs on line 3 must be positive integers.', 'zh-TW'), '第 3 行節點編號須為正整數。');
    assert.equal(translateText('N 後接 N−1 行：u v [w]', 'en'), 'N followed by N−1 edges: u v [w]');
    assert.equal(translateText('第 2 行格式錯誤，應為 u v [w]。', 'en'), 'Invalid format on line 2. Expected u v [w].');
    assert.equal(translateText('第 2 行格式錯誤，應為 父節點 子節點 [w]。', 'en'), 'Invalid format on line 2. Expected parent child [w].');
    assert.equal(translateText('有 2 個節點無法連通。', 'en'), '2 nodes are disconnected.');
    assert.equal(translateText('標頭宣告 2 條邊，實際有 1 行。', 'en'), 'Header declares 2 edges, but 1 row was found.');
    assert.equal(translateText('第 2 行鄰居數宣告 1，實際有 0 個。', 'en'), 'Line 2 declares 1 neighbor but has 0 neighbors.');
    assert.equal(translateText('Selected 3 cells', 'zh-TW'), '已選取 3 格');
    assert.equal(translateText('已選取 1 格', 'en'), 'Selected 1 cell');
    assert.equal(translateText('Selected 1 cell', 'zh-TW'), '已選取 1 格');
    assert.equal(translateText('第 3 行：鄰居數 須為非負整數。', 'en'), 'Line 3: neighbor count must be a non-negative integer.');
    assert.equal(translateText('Line 3: neighbor count must be a non-negative integer.', 'zh-TW'), '第 3 行：鄰居數 須為非負整數。');
    assert.equal(translateText('未知的圖輸入格式：edge-list', 'en'), 'Unknown graph input format: edge-list');
    assert.equal(translateText('Cloud service returned 503', 'zh-TW'), '雲端服務回應 503');
    assert.equal(translateText('Markdown is too large to render. Shorten it to show the canvas preview.', 'zh-TW'), 'Markdown 資料過大，無法產生畫布預覽；請縮短內容。');
    assert.equal(translateText('確定清除「草稿」的未同步草稿？此操作無法復原。', 'en'), 'Clear unsynced draft “草稿”? This cannot be undone.');
    assert.equal(translateText('N 後接 N−1 行：u v [w]\n例：\n4\n1 2', 'en'), 'N followed by N−1 edges: u v [w]\nExample:\n4\n1 2');
});

test('translation dictionary has no conflicting reverse labels', () => {
    const source = readFileSync(new URL('../js/ui/I18n.js', import.meta.url), 'utf8');
    const dictionary = source.match(/const translationLines = String\.raw`([\s\S]*?)`\.trim\(\)\.split\("\\n"\);/);
    assert.ok(dictionary, 'translation dictionary must remain available for both-language switching');

    const forward = new Map();
    const reverse = new Map();
    for (const line of dictionary[1].split('\n')) {
        const separator = line.indexOf('|');
        if (separator < 0) continue;
        const traditional = line.slice(0, separator);
        const english = line.slice(separator + 1);
        const previousEnglish = forward.get(traditional);
        assert.ok(!previousEnglish || previousEnglish === english,
            `${JSON.stringify(traditional)} maps to both ${JSON.stringify(previousEnglish)} and ${JSON.stringify(english)}`);
        forward.set(traditional, english);
        const previous = reverse.get(english);
        assert.ok(!previous || previous === traditional,
            `${JSON.stringify(english)} maps to both ${JSON.stringify(previous)} and ${JSON.stringify(traditional)}`);
        reverse.set(english, traditional);
        if (!traditional.includes('\\n') && !english.includes('\\n')) {
            assert.equal(translateText(traditional, 'en'), english, `English translation for ${traditional}`);
            assert.equal(translateText(english, 'zh-TW'), traditional, `Traditional Chinese translation for ${english}`);
        }
    }
});

test('static HTML interface text and labels have English translations', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const strings = [];
    for (const match of html.matchAll(/(aria-label|aria-description|title|placeholder|alt|data-tooltip)\s*=\s*(['\"])(.*?)\2/gs)) {
        if (/\p{Script=Han}/u.test(match[3])) strings.push({ kind: match[1], value: match[3] });
    }
    for (const match of html.matchAll(/>([^<>]+)</g)) {
        if (/\p{Script=Han}/u.test(match[1])) strings.push({ kind: 'text', value: match[1] });
    }

    const untranslated = strings.filter(({ value }) => translateText(value, 'en') === value);
    const brokenRoundTrips = strings.filter(({ value }) =>
        translateText(translateText(value, 'en'), 'zh-TW') !== value
    );
    assert.deepEqual(untranslated, []);
    assert.deepEqual(brokenRoundTrips, []);
});

test('icon-only HTML buttons have accessible names', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
        .replace(/<!--([\s\S]*?)-->/g, '');
    const unlabeled = [];
    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
        const [, attributes, content] = match;
        if (!content.includes('material-symbols-outlined')) continue;
        const visibleText = content
            .replace(/<span\b[^>]*class=["'][^"']*material-symbols-outlined[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
            .replace(/<[^>]*>/g, '')
            .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, '')
            .trim();
        const ariaLabel = attributes.match(/\baria-label\s*=\s*(["'])(.*?)\1/i)?.[2];
        if (!visibleText && !ariaLabel?.trim()) {
            unlabeled.push(match[0].slice(0, 180));
        }
    }
    assert.deepEqual(unlabeled, []);
});

test('visible static form controls have programmatic labels', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)];
    const labelFor = new Set(labels.map(([, attributes]) => attributes.match(/\bfor=["']([^"']+)["']/i)?.[1]).filter(Boolean));
    const wrappedControls = new Set(labels.flatMap(([, , content]) =>
        [...content.matchAll(/<(?:input|select|textarea)\b[^>]*\bid=["']([^"']+)["']/gi)].map((match) => match[1])));
    const unlabeled = [];

    for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
        const [, tag, attributes] = match;
        const get = name => attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? '';
        const id = get('id');
        if (/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(get('style'))) continue;
        if (get('aria-label') || get('aria-labelledby') || (id && (labelFor.has(id) || wrappedControls.has(id)))) continue;
        unlabeled.push({ tag, id, type: get('type') });
    }

    assert.deepEqual(unlabeled, []);
});

test('dynamic accessible names and placeholders have bilingual translations', () => {
    const sourceRoot = fileURLToPath(new URL('../js/', import.meta.url));
    const files = [];
    const collect = directory => {
        for (const name of readdirSync(directory)) {
            if (name === 'node_modules') continue;
            const path = join(directory, name);
            if (statSync(path).isDirectory()) collect(path);
            else if (name.endsWith('.js')) files.push(path);
        }
    };
    collect(sourceRoot);
    const patterns = [
        /setAttribute\(['"]aria-label['"]\s*,\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/gs,
        /\.placeholder\s*=\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/gs,
        /\.title\s*=\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/gs
    ];
    const decode = value => value.replace(/\\([nrt\\'"`])/g, (_, character) => ({
        n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"', '`': '`'
    })[character]);
    const untranslated = [];

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const pattern of patterns) {
            for (const match of source.matchAll(pattern)) {
                const value = decode(match[2]);
                if (!/\p{Script=Han}/u.test(value) || value.includes('${')) continue;
                const english = translateText(value, 'en');
                if (english === value || translateText(english, 'zh-TW') !== value) {
                    untranslated.push({ file: relative(sourceRoot, file), value });
                }
            }
        }
    }

    assert.deepEqual(untranslated, []);
});

test('explicit accessible names are preserved when tooltips are attached', () => {
    const control = ({ tooltip, title, ariaLabel } = {}) => {
        const attributes = new Map(ariaLabel ? [['aria-label', ariaLabel]] : []);
        return {
            dataset: tooltip ? { tooltip } : {},
            title,
            hasAttribute: name => attributes.has(name),
            setAttribute: (name, value) => attributes.set(name, value),
            getAttribute: name => attributes.get(name) ?? null,
            querySelectorAll: () => []
        };
    };
    const concise = control({ tooltip: '選取 (V)', ariaLabel: '選取' });
    const inferred = control({ tooltip: '復原 (Ctrl+Z)' });
    const empty = control({ tooltip: '放大 (Ctrl+=)', ariaLabel: ' ' });
    const titled = control({ title: '上移' });
    const emptyTitle = control({ title: '下移', ariaLabel: ' ' });
    const root = {
        querySelectorAll(selector) {
            if (selector === '[data-tooltip]') return [concise, inferred, empty];
            if (selector === 'button[title]') return [titled, emptyTitle];
            return [];
        }
    };

    labelTooltipControls(root);

    assert.equal(concise.getAttribute('aria-label'), '選取');
    assert.equal(inferred.getAttribute('aria-label'), '復原 (Ctrl+Z)');
    assert.equal(empty.getAttribute('aria-label'), '放大 (Ctrl+=)');
    assert.equal(titled.getAttribute('aria-label'), '上移');
    assert.equal(emptyTitle.getAttribute('aria-label'), '下移');
});

test('dynamic color-picker labels translate without changing their values', () => {
    for (const color of ['#b34d4d', '#aabbcc']) {
        assert.equal(translateText('顏色 ' + color, 'en'), 'Color ' + color);
        assert.equal(translateText('Color ' + color, 'zh-TW'), '顏色 ' + color);
    }
    for (const channel of ['R', 'G', 'B']) {
        assert.equal(translateText(channel + ' 色彩分量', 'en'), channel + ' color component');
        assert.equal(translateText(channel + ' color component', 'zh-TW'), channel + ' 色彩分量');
    }
});

test('static user-facing messages have bilingual translations', () => {
    const files = ['../js/app.js', '../js/network/CloudBoards.js', '../js/network/Collaboration.js'];
    const callPattern = /(?:new\s+Error|alert|confirm|prompt|_toast)\s*\(\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/gs;
    const decodeString = value => value.replace(/\\([nrt\\'"`])/g, (_, character) => ({
        n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"', '`': '`'
    })[character]);
    const untranslated = [];

    for (const file of files) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8');
        for (const match of source.matchAll(callPattern)) {
            const rawMessage = match[2];
            if (rawMessage.includes('${')) continue;
            const message = decodeString(rawMessage);
            const english = translateText(message, 'en');
            if (/\p{Script=Han}/u.test(message) &&
                (english === message || translateText(english, 'zh-TW') !== message)) {
                untranslated.push({ file, message });
            }
        }
    }

    assert.deepEqual(untranslated, []);
});

test('cloud and collaboration prompts translate in both languages', () => {
    const messages = [
        ['輸入協作房間編號：\n使用相同編號即可共同編輯。', 'Enter a collaboration room ID:\nUse the same ID to collaborate.'],
        ['新的白板名稱：', 'New board name:'],
        ['確定刪除白板「Demo」？', 'Delete board “Demo”?'],
        ['雲端服務回應 503；新白板的清理尚未完成：雲端服務回應 500', 'Cloud service returned 503; cleanup of the new board is still pending: Cloud service returned 500'],
        ['未同步草稿：', 'Unsynced draft:'],
        ['分享選項：1 建立唯讀連結；2 邀請／更新成員；3 管理連結；4 管理成員。', 'Sharing: 1) Create read-only link; 2) Invite/update member; 3) Manage links; 4) Manage members.'],
        ['連結有效天數（1–90）：', 'Link expiry in days (1–90):'],
        ['唯讀分享連結：', 'Read-only share link:'],
        ['輸入已註冊且驗證的帳號電子郵件：', 'Enter a verified account email:'],
        ['權限（editor 或 viewer）：', 'Role (editor or viewer):'],
        ['權限須為 editor 或 viewer。', 'Choose editor or viewer.'],
        ['成員權限已新增或更新。對方須完成註冊與電子郵件驗證。', 'Member invited or updated. They must register and verify their email.'],
        ['分享連結已撤銷。', 'Share link revoked.'],
        ['目前沒有有效的分享連結。', 'No active share links.'],
        ['目前沒有受邀成員。', 'No invited members.'],
        ['成員已移除。', 'Member removed.'],
        ['成員權限已更新。', 'Member role updated.'],
        ['帳號已切換。未同步修改已存為舊帳號的本機草稿。', 'Account changed. Unsynced edits are saved locally under the previous account.'],
        ['白板過大，無法保存在本機。已設為唯讀，請匯出 JSON。', 'This board is too large to save locally. It is read-only; export a JSON backup.'],
        ['貼上資料不得超過 1 MB。', 'Pasted data must not exceed 1 MB.'],
        ['貼上資料超出矩陣範圍，或每列欄數不一致。', 'Pasted data exceeds the matrix bounds or has inconsistent row widths.'],
        ['輸入資料不得超過 1 MB。已保留原值。', 'Input exceeds 1 MB. Original value retained.'],
        ['邊權重必須是有限數值。', 'Edge weight must be a finite number.'],
        ['已匯出 JSON', 'JSON export complete.'],
        ['發生未知錯誤。', 'An unknown error occurred.']
    ];

    for (const [traditional, english] of messages) {
        assert.equal(translateText(traditional, 'en'), english, traditional);
        assert.equal(translateText(english, 'zh-TW'), traditional, english);
    }
    assert.equal(translateText('1. user@example.com (編輯者)', 'en'), '1. user@example.com (Editor)');
    assert.equal(translateText('1. user@example.com (Editor)', 'zh-TW'), '1. user@example.com (編輯者)');
    assert.equal(translateText('貼上 1 個值，或剛好 3 個值。', 'en'), 'Paste one value or exactly 3 values.');
    assert.equal(translateText('Paste one value or exactly 3 values.', 'zh-TW'), '貼上 1 個值，或剛好 3 個值。');
    assert.equal(translateText('貼上 1 個值，或剛好 1 個值。', 'en'), 'Paste one value or exactly 1 value.');
    assert.equal(translateText('Paste one value or exactly 1 value.', 'zh-TW'), '貼上 1 個值，或剛好 1 個值。');
    assert.equal(translateText('1. 到期 tomorrow (link-id)', 'en'), '1. Expires tomorrow (link-id)');
    assert.equal(translateText('1. Expires tomorrow (link-id)', 'zh-TW'), '1. 到期 tomorrow (link-id)');
});

test('graph and tree validation errors translate in both languages', () => {
    const errors = [
        [GraphParser.parse('2 1\nx 2').error, 'Node IDs on line 2 must be safe integers.'],
        [GraphParser.parse('2\n9007199254740992 1 2\n0', false, false, 'adj-list').error, 'Line 2: neighbor count is out of range.'],
        [GraphParser.parse('\n9007199254740992\n0', false, false, 'adj-list').error, 'Line 2: N is out of range.'],
        [GraphParser.parse('\n2\nx\n0', false, false, 'adj-list').error, 'Line 3: neighbor count must be a non-negative integer.'],
        [TreeParser.parseContestFormat(['2', 'x 2']).error, 'Node IDs on line 2 must be non-negative integers.'],
        [TreeParser.parseContestFormat(['2', '1 1']).error, 'Self-edges are not allowed on line 2.'],
        [TreeParser.autoDetectAndParse('0\n3\n2\n3').error, '3 nodes are unreachable from the root.']
    ];

    for (const [traditional, english] of errors) {
        assert.equal(translateText(traditional, 'en'), english);
        assert.equal(translateText(english, 'zh-TW'), traditional);
    }
});

test('recovery draft label translates when it is an isolated text node', () => {
    const previousLocale = i18n.locale;
    const label = { nodeType: 3, data: '未同步草稿：', parentElement: null };
    const parent = fakeI18nElement('', [label]);

    try {
        i18n.locale = 'en';
        i18n.applyText(label);
        assert.equal(label.data, 'Unsynced draft:');
        i18n.locale = 'zh-TW';
        i18n.applyText(label);
        assert.equal(label.data, '未同步草稿：');
    } finally {
        i18n.locale = previousLocale;
        label.parentElement = null;
    }
    assert.equal(parent.childNodes[0], label);
});

test('native prompts use the active language and preserve their default value', () => {
    const previousLocale = i18n.locale;
    const previousWindow = globalThis.window;
    const calls = [];
    globalThis.window = {
        alert: message => calls.push(['alert', message]),
        confirm: message => { calls.push(['confirm', message]); return true; },
        prompt: (message, value) => { calls.push(['prompt', message, value]); return value; }
    };

    try {
        i18n.locale = 'en';
        i18n.patchNativeDialogs();
        assert.equal(window.prompt('新的白板名稱：', 'Demo'), 'Demo');
        assert.equal(window.confirm('確定刪除白板「Demo」？'), true);
        i18n.locale = 'zh-TW';
        assert.equal(window.prompt('New board name:', 'Demo'), 'Demo');
        assert.deepEqual(calls, [
            ['prompt', 'New board name:', 'Demo'],
            ['confirm', 'Delete board “Demo”?'],
            ['prompt', '新的白板名稱：', 'Demo']
        ]);
    } finally {
        i18n.locale = previousLocale;
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('textarea labels translate while user-entered content remains unchanged', () => {
    const previousLocale = i18n.locale;
    const previousDocument = globalThis.document;
    const previousNodeFilter = globalThis.NodeFilter;
    globalThis.document = { createTreeWalker: () => ({ nextNode: () => null }) };
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    const attributes = new Map([
        ['aria-label', '編輯矩陣內容'],
        ['placeholder', '請輸入資料…']
    ]);
    const textarea = {
        nodeType: 1,
        value: 'user-entered matrix data',
        matches: () => false,
        closest(selector) { return selector.includes('textarea') ? this : null; },
        getAttribute(name) { return attributes.get(name) ?? null; },
        setAttribute(name, value) { attributes.set(name, value); },
        querySelectorAll: () => []
    };
    const textNode = { data: '使用者輸入', parentElement: textarea };
    const editableAttributes = new Map([['aria-label', '使用者內容']]);
    const editable = {
        matches: () => false,
        closest(selector) { return selector.includes("[contenteditable='true']") ? this : null; },
        getAttribute(name) { return editableAttributes.get(name) ?? null; },
        setAttribute(name, value) { editableAttributes.set(name, value); }
    };

    try {
        i18n.locale = 'en';
        i18n.apply(textarea);
        i18n.applyAttributes(editable);
        i18n.applyText(textNode);
        assert.equal(attributes.get('aria-label'), 'Edit matrix content');
        assert.equal(attributes.get('placeholder'), 'Enter data…');
        assert.equal(editableAttributes.get('aria-label'), '使用者內容');
        assert.equal(textNode.data, '使用者輸入');
        assert.equal(textarea.value, 'user-entered matrix data');
        i18n.locale = 'zh-TW';
        i18n.apply(textarea);
        assert.equal(attributes.get('aria-label'), '編輯矩陣內容');
        assert.equal(attributes.get('placeholder'), '請輸入資料…');
        assert.equal(textNode.data, '使用者輸入');
        assert.equal(textarea.value, 'user-entered matrix data');
    } finally {
        i18n.locale = previousLocale;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
        else globalThis.NodeFilter = previousNodeFilter;
    }
});

test('Markdown preview labels translate while authored markup remains unchanged', () => {
    const previousLocale = i18n.locale;
    const previousDocument = globalThis.document;
    const previousNodeFilter = globalThis.NodeFilter;
    const previewAttributes = new Map([
        ['aria-label', 'Markdown 預覽'],
        ['title', '編輯文字']
    ]);
    const imageAttributes = new Map([
        ['alt', '編輯文字'],
        ['title', '編輯文字']
    ]);
    const previewText = { data: '使用者撰寫的內容', parentElement: null };
    const preview = {
        nodeType: 1,
        className: 'markdown-preview-content',
        matches: () => false,
        closest(selector) { return selector.includes('.markdown-preview-content') ? this : null; },
        getAttribute(name) { return previewAttributes.get(name) ?? null; },
        setAttribute(name, value) { previewAttributes.set(name, value); },
        querySelectorAll: () => [image]
    };
    const image = {
        matches: () => false,
        closest(selector) { return selector.includes('.markdown-preview-content') ? preview : null; },
        getAttribute(name) { return imageAttributes.get(name) ?? null; },
        setAttribute(name, value) { imageAttributes.set(name, value); }
    };
    previewText.parentElement = preview;
    globalThis.document = {
        createTreeWalker: () => {
            let visited = false;
            return { nextNode() { if (visited) return null; visited = true; return previewText; } };
        }
    };
    globalThis.NodeFilter = { SHOW_TEXT: 4 };

    try {
        i18n.locale = 'en';
        i18n.apply(preview);
        assert.equal(previewAttributes.get('aria-label'), 'Markdown preview');
        assert.equal(previewAttributes.get('title'), '編輯文字');
        assert.equal(imageAttributes.get('alt'), '編輯文字');
        assert.equal(imageAttributes.get('title'), '編輯文字');
        assert.equal(previewText.data, '使用者撰寫的內容');

        i18n.locale = 'zh-TW';
        i18n.apply(preview);
        assert.equal(previewAttributes.get('aria-label'), 'Markdown 預覽');
        assert.equal(previewAttributes.get('title'), '編輯文字');
        assert.equal(imageAttributes.get('alt'), '編輯文字');
        assert.equal(imageAttributes.get('title'), '編輯文字');
        assert.equal(previewText.data, '使用者撰寫的內容');
    } finally {
        i18n.locale = previousLocale;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
        else globalThis.NodeFilter = previousNodeFilter;
    }
});

test('changing the interface language updates and persists the setting', () => {
    const previousDocument = globalThis.document;
    const previousNodeFilter = globalThis.NodeFilter;
    const previousMutationObserver = globalThis.MutationObserver;
    const previousLocalStorage = globalThis.localStorage;
    const previousWindow = globalThis.window;
    const previousLocale = i18n.locale;
    const previousObserver = i18n.observer;
    const selector = {
        value: '',
        addEventListener(name, handler) { if (name === 'change') this.onChange = handler; }
    };
    const root = fakeI18nElement();
    let storedLanguage = null;
    let statusRenderCount = 0;
    let dateRefreshCount = 0;
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    globalThis.document = {
        body: {},
        documentElement: root,
        getElementById: id => id === 'settings-language' ? selector : null,
        createTreeWalker: () => ({ nextNode: () => null })
    };
    globalThis.MutationObserver = class {
        constructor(callback) { this.callback = callback; }
        observe() {}
    };
    globalThis.localStorage = { setItem: (key, value) => { if (key === 'wb_language') storedLanguage = value; } };
    globalThis.window = { appInstance: { cloudBoards: {
        _renderStatus() { statusRenderCount++; },
        _refreshLocalizedDates() { dateRefreshCount++; }
    } } };

    try {
        i18n.start();
        assert.equal(selector.value, previousLocale);

        selector.value = 'zh-TW';
        selector.onChange();
        assert.equal(root.lang, 'zh-TW');
        assert.equal(selector.value, 'zh-TW');
        assert.equal(storedLanguage, 'zh-TW');
        assert.equal(statusRenderCount, 1);
        assert.equal(dateRefreshCount, 1);

        selector.value = 'en';
        selector.onChange();
        assert.equal(root.lang, 'en');
        assert.equal(selector.value, 'en');
        assert.equal(storedLanguage, 'en');
        assert.equal(statusRenderCount, 2);
        assert.equal(dateRefreshCount, 2);
    } finally {
        i18n.locale = previousLocale;
        i18n.observer = previousObserver;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
        else globalThis.NodeFilter = previousNodeFilter;
        if (previousMutationObserver === undefined) delete globalThis.MutationObserver;
        else globalThis.MutationObserver = previousMutationObserver;
        if (previousLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousLocalStorage;
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('cloud identity labels translate while account names remain unchanged', () => {
    const previousDocument = globalThis.document;
    const previousNodeFilter = globalThis.NodeFilter;
    const previousLocale = i18n.locale;
    const label = { nodeType: 3, data: '登入後查看雲端白板。', parentElement: null };
    const accountName = { nodeType: 3, data: '設定', parentElement: null };
    const account = fakeI18nElement('whiteboard-user-content', [accountName]);
    const identity = fakeI18nElement('cloud-identity', [label, account]);
    label.parentElement = identity;

    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    globalThis.document = {
        createTreeWalker(root) {
            const textNodes = [];
            const visit = parent => {
                for (const child of parent.childNodes) {
                    if (child.nodeType === 3) textNodes.push(child);
                    else visit(child);
                }
            };
            visit(root);
            return { nextNode: () => textNodes.shift() || null };
        }
    };
    i18n.locale = 'en';
    try {
        i18n.apply(identity);
        assert.equal(label.data, 'Sign in to view cloud boards.');
        assert.equal(accountName.data, '設定');

        label.data = 'Sign in to view cloud boards.';
        accountName.data = 'Settings';
        i18n.locale = 'zh-TW';
        i18n.apply(identity);
        assert.equal(label.data, '登入後查看雲端白板。');
        assert.equal(accountName.data, 'Settings');
    } finally {
        i18n.locale = previousLocale;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousNodeFilter === undefined) delete globalThis.NodeFilter;
        else globalThis.NodeFilter = previousNodeFilter;
    }
});

test('layer action names translate without translating user-defined layer names', () => {
    const previousLocale = i18n.locale;
    const attributes = new Map([
        ['aria-label', '選取 設定 #1'],
        ['title', '設定 #1']
    ]);
    const layerText = { nodeType: 3, data: '設定 #1', parentElement: null };
    const layerButton = fakeI18nElement('layer-name', [layerText]);
    layerButton.getAttribute = name => attributes.get(name) ?? null;
    layerButton.setAttribute = (name, value) => attributes.set(name, value);

    try {
        i18n.locale = 'en';
        i18n.applyAttributes(layerButton);
        i18n.applyText(layerText);
        assert.equal(attributes.get('aria-label'), 'Select 設定 #1');
        assert.equal(attributes.get('title'), '設定 #1');
        assert.equal(layerText.data, '設定 #1');
        i18n.locale = 'zh-TW';
        i18n.applyAttributes(layerButton);
        i18n.applyText(layerText);
        assert.equal(attributes.get('aria-label'), '選取 設定 #1');
        assert.equal(attributes.get('title'), '設定 #1');
        assert.equal(layerText.data, '設定 #1');
    } finally {
        i18n.locale = previousLocale;
    }
});

test('explicit zoom preserves its screen pivot and ignores zero wheel deltas', () => {
    const camera = new Camera();
    camera.x = 300; camera.y = -200; camera.zoom = 4;
    const before = camera.screenToWorld(480, 320);
    camera.zoomTo(1.5, 480, 320);
    const after = camera.screenToWorld(480, 320);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1e-9);
    const state = { x: camera.x, y: camera.y, zoom: camera.zoom };
    camera.zoomAt(0, 480, 320);
    camera.zoomAt(NaN, 480, 320);
    camera.zoomTo(Infinity, 480, 320);
    assert.deepEqual({ x: camera.x, y: camera.y, zoom: camera.zoom }, state);
});

test('fit view uses one scale for both axes and frames large bounds', () => {
    const camera = new Camera();
    const bounds = { x: -5000, y: 10000, w: 500000, h: 300000 };
    const viewport = { x: 80, y: 70, width: 620, height: 540 };
    assert.equal(camera.fitBounds(bounds, viewport), true);
    const topLeft = camera.worldToScreen(bounds.x, bounds.y);
    const bottomRight = camera.worldToScreen(bounds.x + bounds.w, bounds.y + bounds.h);
    assert.ok(topLeft.x >= viewport.x - 1e-8 && topLeft.y >= viewport.y - 1e-8);
    assert.ok(bottomRight.x <= viewport.x + viewport.width + 1e-8);
    assert.ok(bottomRight.y <= viewport.y + viewport.height + 1e-8);
    assert.ok(Math.abs((bottomRight.x - topLeft.x) / (bottomRight.y - topLeft.y) - bounds.w / bounds.h) < 1e-9);
    const state = { x: camera.x, y: camera.y, zoom: camera.zoom };
    assert.equal(camera.fitBounds(bounds, { ...viewport, width: 0 }), false);
    assert.deepEqual({ x: camera.x, y: camera.y, zoom: camera.zoom }, state);
});

test('overview grid keeps a bounded number of lines at very small zoom', () => {
    const grid = new Grid(), camera = new Camera();
    camera.zoom = camera.minZoom;
    let lines = 0;
    grid.draw({ beginPath() {}, moveTo() {}, lineTo() {}, stroke() { lines++; } }, camera, 1200, 800);
    assert.ok(lines > 0 && lines < 110, `Unexpected grid work: ${lines}`);
});

test('stack and queue report the correct input and item limits', () => {
    for (const ElementType of [StackElement, QueueElement]) {
        const element = new ElementType();
        assert.match(element.setFromText('x'.repeat(1_000_001)), /1 MB/);
        assert.match(element.setFromText(Array.from({ length: 10_001 }, (_, index) => index).join(' ')), /10,000/);
    }
});

test('weighted star trees leave enough room between long sibling edge labels', () => {
    const tree = new TreeElement();
    tree.buildFromText(['7', ...Array.from({ length: 6 }, (_, i) => `1 ${i + 2} ${i + 1}000000000`)].join('\n'));
    const midpoints = tree.root.children.map(node => (tree.root.x + node.x) / 2).sort((a, b) => a - b);
    for (let i = 1; i < midpoints.length; i++) assert.ok(midpoints[i] - midpoints[i - 1] >= 76);
    const restored = new TreeElement().deserialize(tree.serialize());
    assert.equal(restored.width, tree.width);
    tree.setEdgeWeight(tree.root.children[0], '123456789012345');
    assert.ok(tree.width > restored.width);
});

test('weighted parallel graph lanes stay attached and are selectable at their labels', () => {
    const paths = [], labels = [];
    let path;
    const ctx = {
        beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        quadraticCurveTo(cx, cy, x, y) { path.push([cx, cy], [x, y]); },
        stroke() { if (path.length === 2 || path.length === 3) paths.push(path); },
        arc() {}, fill() {}, fillRect() {}, strokeRect() {}, save() {}, restore() {},
        measureText() { return { width: 8 }; },
        fillText(text, x, y) { if (this.font === '10px Consolas, monospace') labels.push({ text, x, y }); }
    };
    const nodes = new Map([['1', { x: 0, y: 0 }], ['2', { x: 200, y: 0 }]]);
    const edges = Array.from({ length: 15 }, (_, index) => ({ u: '1', v: '2', w: String(index + 1) }));
    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 20 });
    assert.equal(paths.length, edges.length);
    for (const points of paths) {
        assert.ok(Math.abs(Math.hypot(...points[0]) - 20) < 1e-6);
        const end = points.at(-1);
        assert.ok(Math.abs(Math.hypot(end[0] - 200, end[1]) - 20) < 1e-6);
    }
    labels.forEach((label, index) => {
        assert.equal(GraphRenderer.hitTestEdge(nodes, edges, label.x, label.y, { nodeRadius: 20 }), edges[index]);
        if (index) assert.ok(label.y - labels[index - 1].y >= 18);
    });
});

test('graph frames contain weighted self-loops after shrinking and JSON restore', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('1 2\n1 1 5\n1 1 6'), null);
    graph.onResizeStart();
    graph.width = graph.height = 80;
    graph.onResize(80, 80);
    for (const element of [graph, new GraphElement().deserialize(graph.serialize())]) {
        const bounds = GraphRenderer.getContentBounds(element.nodes, element.edges, { nodeRadius: element.nodeRadius });
        assert.ok(bounds.minX >= 4 && bounds.minY >= 4);
        assert.ok(bounds.maxX <= element.width - 44 && bounds.maxY <= element.height - 44);
    }
});

test('parallel edges in opposite directions have separated selectable label lanes', () => {
    const labels = [];
    const ctx = {
        beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {},
        arc() {}, fill() {}, fillRect() {}, strokeRect() {}, save() {}, restore() {},
        measureText() { return { width: 8 }; },
        fillText(text, x, y) {
            if (this.font === '10px Consolas, monospace') labels.push({ text, x, y });
        }
    };
    const nodes = new Map([['1', { x: 0, y: 0 }], ['2', { x: 200, y: 0 }]]);
    const edges = Array.from({ length: 12 }, (_, index) => ({
        u: index < 6 ? '1' : '2', v: index < 6 ? '2' : '1', w: String(index), directed: true
    }));
    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 20, directed: true });
    assert.equal(labels.length, 12);
    for (let index = 0; index < labels.length; index++) {
        const label = labels[index];
        assert.equal(GraphRenderer.hitTestEdge(nodes, edges, label.x, label.y, {
            nodeRadius: 20, directed: true
        }), edges[index]);
        for (let other = index + 1; other < labels.length; other++) {
            assert.ok(Math.hypot(label.x - labels[other].x, label.y - labels[other].y) > 18);
        }
    }
});

test('array placeholders remain distinct from ordinary user data', () => {
    const input = 'left\u3000__WHITEBOARD_EMPTY__\u3000right';
    const expected = ['left', '', '__WHITEBOARD_EMPTY__', '', 'right'];

    const queue = new QueueElement();
    const stack = new StackElement();
    assert.equal(queue.setFromText(input), null);
    assert.equal(stack.setFromText(input), null);
    assert.deepEqual(queue.items, expected);
    assert.deepEqual(stack.items, expected);
});

test('long cell values shrink proportionally without changing cell widths', () => {
    const ctx = {
        font: '14px Consolas, monospace',
        measureText(text) { return { width: String(text).length * 8 }; }
    };
    const shortSize = fitCanvasTextFontSize(ctx, '1', 14, 34, 34);
    const longSize = fitCanvasTextFontSize(ctx, 'a very long value', 14, 34, 34);
    assert.equal(shortSize, 14);
    assert.ok(longSize < shortSize);
    assert.ok(longSize > 0);
});

test('matrix clipboard rows retain blanks, quoted values, and tabular newlines', () => {
    assert.deepEqual(parsePastedMatrixRows('1 2 3\r\n4 5 6\r\n'), [['1', '2', '3'], ['4', '5', '6']]);
    assert.deepEqual(parsePastedMatrixRows('1\t\t3\n4\ttext with spaces\t6\n'),
        [['1', '', '3'], ['4', 'text with spaces', '6']]);
    assert.deepEqual(parsePastedMatrixRows('　\t"a b"\n"line\\nbreak"\t"say ""hi"""'),
        [['', 'a b'], ['line\nbreak', 'say "hi"']]);
    assert.deepEqual(parsePastedMatrixRows('"first\nsecond"\t9'), [['first\nsecond', '9']]);
    assert.deepEqual(parsePastedMatrixRows('a"b\t9'), [['a"b', '9']]);
});

test('spreadsheet quotes preserve trailing backslashes without swallowing adjacent cells', () => {
    const values = ['plain', 'a b', 'a\tb', 'a\nb', 'say "hi"', 'a\\b',
        'tab\tend\\', 'quote\\"', 'line\nend\\', ''];
    const encode = value => /[\t\n\r"]/.test(value)
        ? '"' + value.replace(/"/g, '""') + '"'
        : value;
    for (const first of values) for (const second of values) {
        const input = [first, second].map(encode).join('\t');
        assert.deepEqual(parsePastedMatrixRows(input), [[first, second]], input);
    }
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('"first\nend\\"\t3\nlast\t4'), null);
    assert.deepEqual(matrix.data, [['first\nend\\', '3'], ['last', '4']]);
});

test('single-column spreadsheet cells preserve physical newlines without a tab delimiter', () => {
    const input = 'first\n"second\nline\\"\n"say ""hi"""';
    const expected = [['first'], ['second\nline\\'], ['say "hi"']];
    assert.deepEqual(parsePastedMatrixRows(input), expected);
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText(input), null);
    assert.deepEqual(matrix.data, expected);
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, expected);
});

test('escaped JSON quotes do not turn ordinary matrix rows into a spreadsheet field', () => {
    const matrix = new MatrixElement();
    const expected = [['"', 'next'], ['last', 'cell']];
    matrix.data = expected.map(row => [...row]);
    matrix.rows = matrix.cols = 2;
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, expected);
});

test('multiline cell values fit as a centered block with consistent row spacing', () => {
    const drawn = [];
    const ctx = {
        measureText(value) {
            const size = Number.parseFloat(this.font);
            return { width: value.length * size * 0.6, fontBoundingBoxAscent: size, fontBoundingBoxDescent: size * 0.25 };
        },
        fillText(value, x, y) { drawn.push({ value, x, y }); }
    };
    const layout = drawCanvasCellText(ctx, 'first row\nsecond row\nthird row', 14, 34, 34, 100, 100);
    assert.equal(drawn.length, 3);
    assert.ok(layout.height <= 34 && layout.fontSize < 14);
    assert.ok(Math.abs(drawn[1].y - drawn[0].y - layout.lineHeight) < 1e-9);
    assert.ok(drawn.every(line => line.x === 100 && line.y > 83 && line.y < 117));
});

test('matrix, queue, and stack draw long values with smaller proportional fonts', () => {
    const makeContext = () => {
        const labels = [];
        const fonts = [];
        return {
            labels,
            save() { fonts.push(this.font); },
            restore() { this.font = fonts.pop() ?? this.font; },
            fillRect() {}, strokeRect() {}, beginPath() {},
            moveTo() {}, lineTo() {}, stroke() {}, translate() {}, rotate() {},
            measureText(text) {
                const size = Number.parseFloat(this.font) || 14;
                return { width: String(text).length * size * 0.6 };
            },
            fillText(text, x, y, maxWidth) {
                labels.push({ text: String(text), font: this.font, maxWidth });
            }
        };
    };
    const assertFit = (element, shortText, longText) => {
        const ctx = makeContext();
        const originalSize = { width: element.width, height: element.height };
        element.draw(ctx);
        assert.deepEqual({ width: element.width, height: element.height }, originalSize);
        const shortLabel = ctx.labels.find(label => label.text === shortText);
        const longLabel = ctx.labels.find(label => label.text === longText);
        assert.ok(shortLabel && longLabel);
        assert.ok(Number.parseFloat(longLabel.font) < Number.parseFloat(shortLabel.font));
        assert.equal(shortLabel.maxWidth, undefined);
        assert.equal(longLabel.maxWidth, undefined);
    };

    const matrix = new MatrixElement();
    matrix.data[0][0] = 'short';
    matrix.data[0][1] = 'a value much longer than one cell';
    assertFit(matrix, 'short', 'a value much longer than one cell');

    const queue = new QueueElement();
    queue.setFromText('short "a value much longer than one cell"');
    assertFit(queue, 'short', 'a value much longer than one cell');

    const stack = new StackElement();
    stack.setFromText('short "a value much longer than one cell"');
    assertFit(stack, 'short', 'a value much longer than one cell');
});

test('matrix placeholders preserve boundary cells and sentinel-like values', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('\u3000__WHITEBOARD_EMPTY__\u3000'), null);
    assert.deepEqual(matrix.data, [['', '__WHITEBOARD_EMPTY__', '']]);
});

test('quoted array tokens preserve spaces, commas, quotes, and line breaks', () => {
    const values = ['plain', 'two words', 'a,b', 'say "hi"', 'line\nbreak', '', '\u3000'];
    const encoded = values.map(formatDataToken).join(' ');
    assert.deepEqual(splitDataTokens(encoded, { multiline: true }), values.map(value =>
        value === '\u3000' ? '' : value
    ));

    const queue = new QueueElement();
    assert.equal(queue.setFromText('plain "two words" "a,b" "say \\\"hi\\\""'), null);
    const originalItems = [...queue.items];
    queue.updateTextFromData();
    assert.deepEqual(queue.setFromText(queue.inputText), null);
    assert.deepEqual(queue.items, originalItems);

    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('"single cell value"'), null);
    assert.deepEqual(matrix.data, [['single cell value']]);
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, [['single cell value']]);

    assert.equal(matrix.setFromText('"two words" 4\n"a,b" "line\\nbreak"'), null);
    const originalData = matrix.data.map(row => [...row]);
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, originalData);
});

test('matrix text snaps to the nearest horizontal or vertical reading direction', () => {
    const renderedAngle = rotation => {
        const matrix = new MatrixElement();
        matrix.rows = 1;
        matrix.cols = 1;
        matrix.data = [['A']];
        matrix.rotation = rotation;
        matrix._updateSize();
        let angle = 0;
        let textAngle = null;
        const angleStack = [];
        const ctx = {
            globalAlpha: 1,
            save() { angleStack.push(angle); },
            restore() { angle = angleStack.pop(); },
            translate() {},
            rotate(value) { angle += value; },
            fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            fillText() { textAngle = angle; }
        };
        matrix.draw(ctx, { zoom: 1 });
        return textAngle;
    };

    assert.ok(Math.abs(renderedAngle(Math.PI / 6)) < 1e-10);
    assert.ok(Math.abs(renderedAngle(Math.PI / 3) - Math.PI / 2) < 1e-10);
});

test('invalid oversized sequence input does not replace existing data', () => {
    const queue = new QueueElement();
    queue.setFromText('keep this');
    const result = queue.setFromText(new Array(10002).fill('x').join(' '));
    assert.match(result, /10,000/);
    assert.deepEqual(queue.items, ['keep', 'this']);
});

test('undirected adjacency rows collapse reciprocal references but retain parallel edges', () => {
    const input = ['3', '2 2 2', '2 1 1', '0'].join('\n');
    const result = GraphParser.parse(input, false, false, 'adj-list');
    assert.equal(result.error, undefined);
    assert.equal(result.edges.length, 2);
    assert.ok(result.edges.every(edge => !edge.directed));
});

test('directed adjacency rows preserve reciprocal arcs and self-loops', () => {
    const input = ['2', '2 1 2', '1 1'].join('\n');
    const result = GraphParser.parse(input, true, false, 'adj-list');
    assert.equal(result.error, undefined);
    assert.deepEqual(result.edges.map(({ u, v }) => [u, v]), [
        ['1', '1'], ['1', '2'], ['2', '1']
    ]);
});

test('adjacency parser rejects edge counts above its supported work limit', () => {
    const input = ['1', '100001'].join('\n');
    assert.match(GraphParser.parse(input, false, false, 'adj-list').error, /100,000/);
    assert.match(GraphParser.parse('x'.repeat(1000001)).error, /1 MB/);
});

test('contest graph input stores optional weights on edges', () => {
    assert.match(GraphParser.parse('2 1\n1 2 nope').error, /有限數值/);
    const graph = GraphParser.parse('4 4\n1 2 5\n3 2 6\n2 4 -3\n4 1 0');
    assert.equal(graph.error, undefined);
    assert.deepEqual(graph.edges.map(edge => edge.w), ['5', '6', '-3', '0']);
    assert.ok([...graph.nodes.values()].every(node => node.nodeWeight === null));
});

test('contest graph input supports zero-based node IDs when selected', () => {
    const input = '4 3\n0 1\n1 2 8\n2 3';
    assert.match(GraphParser.parse(input).error, /介於/);
    const graph = new GraphElement();
    assert.equal(graph.buildFromText(input, false, true), null);
    assert.deepEqual([...graph.nodes.keys()], ['0', '1', '2', '3']);
    assert.equal(graph.edges[1].w, '8');
    assert.equal(graph.zeroBased, true);

    const saved = graph.serialize();
    const restored = GraphElement.fromData(saved);
    restored.deserialize(saved);
    assert.equal(restored.zeroBased, true);
    assert.deepEqual([...restored.nodes.keys()], ['0', '1', '2', '3']);
});

test('contest tree input roots undirected weighted edges at node 1', () => {
    const input = '5\n2 1 7\n3 2 -2\n3 4\n5 4 0';
    const tree = new TreeElement();
    assert.equal(tree.buildFromText(input), null);
    assert.equal(tree.root.value, '1');
    assert.equal(tree.root.children[0].value, '2');
    assert.equal(tree.root.children[0].meta.edgeWeight, '7');
    assert.equal(tree.root.children[0].children[0].meta.edgeWeight, '-2');
    assert.equal(tree.hasWeights, true);
    assert.equal(TreeParser.autoDetectAndParse('1').root.value, '1');
});

test('contest tree input auto-detects zero-based vertex IDs', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('4\n1 0\n1 2\n3 1'), null);
    assert.equal(tree.root.value, '0');
    assert.deepEqual(tree.root.children.map(child => child.value), ['1']);
    assert.deepEqual(tree.root.children[0].children.map(child => child.value), ['2', '3']);
});

test('single-node contest trees honor explicit zero-based numbering', () => {
    const zeroBased = new TreeElement();
    assert.equal(zeroBased.buildFromText('1', 'auto', true), null);
    assert.equal(zeroBased.root.value, '0');

    const oneBased = new TreeElement();
    assert.equal(oneBased.buildFromText('1'), null);
    assert.equal(oneBased.root.value, '1');
});

test('single-node tree numbering survives JSON import and snapshot restoration', () => {
    const tree = new TreeElement();
    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    for (const zeroBased of [true, false, true]) {
        assert.equal(tree.buildFromText('1', 'auto', zeroBased), null);
        const saved = JSON.parse(JSON.stringify(tree.serialize()));
        assert.equal(saved.zeroBased, zeroBased);
        validateWhiteboardElement(saved);
        Serializer.loadJSONData(app, { elements: [saved] });
        assert.equal(app.elements[0].root.value, zeroBased ? '0' : '1');
        assert.equal(app.elements[0].zeroBased, zeroBased);
        assert.deepEqual(app.elements[0].getConnectionPorts(), tree.getConnectionPorts());
        delete saved.inputMode;
        assert.equal(new TreeElement().deserialize(saved).root.value, zeroBased ? '0' : '1');
    }
});

test('tree numbering follows source IDs while node labels remain editable', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n0 1'), null);
    assert.equal(tree.zeroBased, true);
    const legacy = tree.serialize();
    delete legacy.zeroBased;
    assert.equal(new TreeElement().deserialize(legacy).zeroBased, true);

    assert.equal(tree.buildFromText('1'), null);
    assert.equal(tree.setNodeValue(tree.root, '0'), true);
    const restored = new TreeElement().deserialize(tree.serialize());
    assert.equal(restored.root.value, '0');
    assert.equal(restored.zeroBased, false);
    assert.equal(tree.buildFromText('0\n1', 'parent'), null);
    assert.equal(tree.zeroBased, false);
});

test('tree snapshots reject invalid numbering flags', () => {
    const tree = new TreeElement();
    tree.buildFromText('1');
    for (const zeroBased of ['true', 1, null, {}]) {
        const saved = { ...tree.serialize(), zeroBased };
        assert.throws(() => validateWhiteboardElement(saved), /樹資料/);
        assert.throws(() => new TreeElement().deserialize(saved), /numbering/);
    }
});

test('tree input mode survives serialization for multiline value lists', () => {
    const tree = new TreeElement();
    tree.treeType = 'bst';
    assert.equal(tree.buildFromText('2\n1\n3', 'values'), null);
    const restored = new TreeElement();
    restored.deserialize(JSON.parse(JSON.stringify(tree.serialize())));
    assert.equal(restored.inputMode, 'values');
    assert.equal(restored.root.value, '2');
    assert.equal(restored.root.children[0].value, '1');
    assert.equal(restored.root.children[1].value, '3');
});

test('red-black tree type aliases build the same balanced tree', () => {
    const current = TreeParser._buildByType(['10', '5', '15', '2', '7'], 'rb');
    const legacy = TreeParser._buildByType(['10', '5', '15', '2', '7'], 'red-black');
    assert.deepEqual(legacy.root, current.root);
});

test('unknown tree input modes fail without replacing the existing tree', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2'), null);
    const previousRoot = tree.root;
    const previousText = tree.inputText;
    assert.match(tree.buildFromText('1', 'unsupported'), /未知.*輸入格式/);
    assert.equal(tree.root, previousRoot);
    assert.equal(tree.inputText, previousText);
    assert.equal(tree.inputMode, 'auto');
});

test('invalid graph edits leave the previous graph intact', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const previousNodes = [...graph.nodes.keys()];
    const previousText = graph.inputText;
    assert.match(graph.buildFromText('2 1\n1 3'), /介於/);
    assert.deepEqual([...graph.nodes.keys()], previousNodes);
    assert.equal(graph.inputText, previousText);
});

test('parallel graph edges do not distort force-directed node positions', () => {
    const makeNodes = () => new Map([
        ['1', { id: '1', x: 0, y: 0 }],
        ['2', { id: '2', x: 0, y: 0 }],
        ['3', { id: '3', x: 0, y: 0 }]
    ]);
    const singleEdgeLayout = makeNodes();
    const parallelEdgeLayout = makeNodes();
    const edge = { u: '1', v: '2' };

    GraphLayout.layout(singleEdgeLayout, [edge], { iterations: 80 });
    GraphLayout.layout(parallelEdgeLayout, new Array(100).fill(edge), { iterations: 80 });
    assert.deepEqual(
        [...parallelEdgeLayout.values()].map(({ x, y }) => [x, y]),
        [...singleEdgeLayout.values()].map(({ x, y }) => [x, y])
    );
});

test('graph layout refreshes cached topology after in-place edge edits', () => {
    const makeNodes = () => new Map(Array.from({ length: 5 }, (_, index) => {
        const id = String(index + 1);
        return [id, { id, x: 0, y: 0 }];
    }));
    const nodes = makeNodes();
    const edges = Array.from({ length: 4 }, (_, index) => ({
        u: '1', v: String(index + 2)
    }));
    const options = { width: 100, height: 100, nodeRadius: 10, iterations: 0, maxCollisionPasses: 0 };

    GraphLayout.layout(nodes, edges, options);
    edges[0].u = '1'; edges[0].v = '2';
    edges[1].u = '2'; edges[1].v = '3';
    edges[2].u = '3'; edges[2].v = '4';
    edges[3].u = '4'; edges[3].v = '5';
    for (const node of nodes.values()) { node.x = 0; node.y = 0; }
    GraphLayout.layout(nodes, edges, options);

    const freshNodes = makeNodes();
    GraphLayout.layout(freshNodes, edges.map(edge => ({ ...edge })), options);
    assert.deepEqual(
        [...nodes.values()].map(({ x, y }) => [x, y]),
        [...freshNodes.values()].map(({ x, y }) => [x, y])
    );
});

test('graph layout refreshes cached node indices after map reordering', () => {
    const makeNodes = () => new Map(Array.from({ length: 5 }, (_, index) => {
        const id = String(index + 1);
        return [id, { id, x: 0, y: 0 }];
    }));
    const nodes = makeNodes();
    const edges = Array.from({ length: 4 }, (_, index) => ({
        u: '1', v: String(index + 2)
    }));
    const options = { width: 100, height: 100, nodeRadius: 10, iterations: 0, maxCollisionPasses: 0 };
    GraphLayout.layout(nodes, edges, options);

    const secondNode = nodes.get('2');
    nodes.delete('2');
    nodes.set('2', secondNode);
    for (const node of nodes.values()) { node.x = 0; node.y = 0; }
    GraphLayout.layout(nodes, edges, options);

    const freshNodes = new Map([...nodes].map(([id, node]) => [id, { ...node, x: 0, y: 0 }]));
    GraphLayout.layout(freshNodes, edges.map(edge => ({ ...edge })), options);
    assert.deepEqual(
        [...nodes.values()].map(({ x, y }) => [x, y]),
        [...freshNodes.values()].map(({ x, y }) => [x, y])
    );
});

test('a one-node graph is centered in its layout area', () => {
    const nodes = new Map([['1', { id: '1', x: 0, y: 0 }]]);
    GraphLayout.layout(nodes, [], { width: 360, height: 310 });
    assert.deepEqual({ x: nodes.get('1').x, y: nodes.get('1').y }, { x: 180, y: 155 });
});

test('graph layout repairs non-finite starting coordinates deterministically', () => {
    const createNodes = () => new Map([
        ['1', { id: '1', x: NaN, y: Infinity }],
        ['2', { id: '2', x: 0, y: 0 }],
        ['3', { id: '3', x: 0, y: 0 }]
    ]);
    const first = createNodes();
    const second = createNodes();

    GraphLayout.layout(first, [], { iterations: 0 });
    GraphLayout.layout(second, [], { iterations: 0 });
    const positions = map => [...map.values()].map(({ x, y }) => [x, y]);
    assert.deepEqual(positions(first), positions(second));
    assert.ok([...first.values()].every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
    assert.ok(!GraphLayout.hasOverlaps(first, 48));
});

test('coincident graph nodes receive opposite deterministic separation vectors', () => {
    const forward = GraphLayout._stableDirection(2, 5, 3);
    const reverse = GraphLayout._stableDirection(5, 2, 3);
    assert.deepEqual(reverse, forward.map(value => -value));
});

test('large graph nodes keep their full radius inside a minimum-size layout area', () => {
    const graph = new GraphElement();
    graph.nodeRadius = 100;
    assert.equal(graph.buildFromText('2 1\n1 2'), null);

    const nodes = [...graph.nodes.values()];
    assert.ok(Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y) >= 208);
    for (const node of nodes) {
        assert.ok(node.x - graph.nodeRadius + 20 >= 0);
        assert.ok(node.y - graph.nodeRadius + 20 >= 0);
        assert.ok(node.x + graph.nodeRadius + 20 <= graph.width);
        assert.ok(node.y + graph.nodeRadius + 20 <= graph.height);
    }
});

test('dense graph layouts expand their frame and keep node circles apart', () => {
    const nodeCount = 50;
    const input = [`${nodeCount} ${nodeCount - 1}`, ...Array.from(
        { length: nodeCount - 1 }, (_, index) => `${index + 1} ${index + 2}`
    )].join('\n');
    const graph = new GraphElement();

    assert.equal(graph.buildFromText(input), null);
    assert.ok(graph.width > 400 || graph.height > 350);

    const assertClearance = () => {
        const nodes = [...graph.nodes.values()];
        const minimumDistance = graph.nodeRadius * 2 + 6;
        for (let first = 0; first < nodes.length; first++) {
            for (let second = first + 1; second < nodes.length; second++) {
                assert.ok(Math.hypot(
                    nodes[first].x - nodes[second].x,
                    nodes[first].y - nodes[second].y
                ) >= minimumDistance - 1e-6);
            }
        }
    };

    assertClearance();
    graph.onResizeStart();
    graph.onResize(100, 100);
    assert.ok(graph.width > 100 || graph.height > 100);
    assertClearance();
});

test('maximum-size star graph layout separates all 500 nodes', () => {
    const nodeCount = 500;
    const hubId = 250;
    const input = [`${nodeCount} ${nodeCount - 1}`, ...Array.from(
        { length: nodeCount - 1 }, (_, index) => {
            const targetId = index + 1 < hubId ? index + 1 : index + 2;
            return `${hubId} ${targetId}`;
        }
    )].join('\n');
    const graph = new GraphElement();

    assert.equal(graph.buildFromText(input), null);
    assert.equal(graph.nodes.size, nodeCount);
    assert.ok(graph.width < 2000);
    assert.ok(graph.height < 2000);
    const hub = graph.nodes.get(String(hubId));
    assert.ok(Math.hypot(
        hub.x - (graph.width - 40) / 2,
        hub.y - (graph.height - 40) / 2
    ) <= graph.nodeRadius * 2 + 8);
    const nodes = [...graph.nodes.values()];
    const minimumDistance = graph.nodeRadius * 2 + 6;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }

    graph.onResizeStart();
    graph.onResize(100, 100);
    assert.ok(graph.width > 100 || graph.height > 100);
    assert.ok(Math.hypot(
        hub.x - (graph.width - 40) / 2,
        hub.y - (graph.height - 40) / 2
    ) <= graph.nodeRadius * 2 + 8);
    assert.ok(!GraphLayout.hasOverlaps(graph.nodes, minimumDistance));
});

test('collision repair keeps a larger dense graph force-laid out without overlaps', () => {
    const nodeCount = 120;
    const nodes = new Map(Array.from({ length: nodeCount }, (_, index) => {
        const id = String(index);
        return [id, { id, x: 0, y: 0 }];
    }));
    const edges = [];
    for (let first = 0; first < nodeCount; first++) {
        for (let second = first + 1; second < nodeCount; second++) {
            if ((first * 31 + second * 17) % 37 < 4) {
                edges.push({ u: String(first), v: String(second) });
            }
        }
    }

    GraphLayout.layout(nodes, edges, { width: 400, height: 350, nodeRadius: 20 });

    assert.ok(edges.length > nodeCount * 5);
    assert.ok(!GraphLayout.hasOverlaps(nodes, 48));
    assert.ok(new Set([...nodes.values()].map(node => Math.round(node.x * 1e6))).size > 110);
});

test('graph preview relayout uses the requested frame size rather than its previous auto expansion', () => {
    const graph = new GraphElement();
    const crowdedInput = ['50 49', ...Array.from(
        { length: 49 }, (_, index) => `${index + 1} ${index + 2}`
    )].join('\n');

    assert.equal(graph.buildFromText(crowdedInput), null);
    assert.ok(graph.width > 400 || graph.height > 350);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    assert.equal(graph.width, 400);
    assert.equal(graph.height, 350);

    graph.onResizeStart();
    graph.onResize(600, 500);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    assert.equal(graph.width, 600);
    assert.equal(graph.height, 500);
});

test('graph base frame size survives JSON restore and controls later relayouts', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    graph.onResizeStart();
    graph.onResize(620, 480);

    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, { elements: [graph.serialize()] });
    const restored = app.elements[0];
    assert.equal(restored.buildFromText('2 1\n1 2'), null);
    assert.equal(restored.width, 620);
    assert.equal(restored.height, 480);
});

test('graph resize undo and redo restore the relayout base size', () => {
    const graph = new GraphElement();
    const input = '3 2\n1 2\n2 3';
    assert.equal(graph.buildFromText(input), null);
    const history = new History({ renderer: { markDirty() {} } });
    const fromBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };

    graph.onResizeStart();
    const fromState = graph.captureResizeState();
    graph.width = 620;
    graph.height = 480;
    graph.onResize(620, 480);
    const toBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    const toState = graph.captureResizeState();
    history.pushResize(graph, fromBounds, toBounds, null, null, null, fromState, toState);

    assert.equal(graph.buildFromText(input), null);
    history.undo();
    assert.equal(graph.buildFromText(input), null);
    assert.equal(graph.width, 400);
    assert.equal(graph.height, 350);
    history.redo();
    assert.equal(graph.buildFromText(input), null);
    assert.equal(graph.width, 620);
    assert.equal(graph.height, 480);
});

test('tree layout enforces node clearance when requested spacing is too small', () => {
    const root = {
        value: 'root',
        children: [
            { value: 'left', children: [], parent: null },
            { value: 'middle', children: [], parent: null },
            { value: 'right', children: [], parent: null }
        ]
    };
    for (const child of root.children) child.parent = root;

    TreeLayout.layout(root, {
        nodeRadius: 20,
        nodeSpacingX: 1,
        levelSpacingY: 1
    });
    const nodes = [root, ...root.children];
    const minimumDistance = 46;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }
});

test('tree resize keeps finite geometry when given non-finite bounds', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3'), null);
    tree.onResizeStart();
    tree.onResize(Number.NaN, Number.POSITIVE_INFINITY);

    assert.ok(Number.isFinite(tree.nodeRadius));
    assert.ok(Number.isFinite(tree.width) && Number.isFinite(tree.height));
    const nodes = [tree.root, ...tree.root.children];
    for (const node of nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
    const minimumDistance = tree.nodeRadius * 2 + 8;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }
});

test('a long unary BST is laid out vertically instead of using one column per node', () => {
    const tree = new TreeElement();
    tree.treeType = 'bst';
    const input = Array.from({ length: 200 }, (_, index) => String(index + 1)).join(' ');

    assert.equal(tree.buildFromText(input, 'values'), null);
    assert.ok(tree.width <= tree.nodeRadius * 2 + 20);
    let node = tree.root;
    let previousY = node.y;
    let count = 1;
    while (node.children[1]) {
        node = node.children[1];
        assert.equal(node.x, tree.root.x);
        assert.ok(node.y - previousY >= tree.nodeRadius * 2 + 8);
        previousY = node.y;
        count++;
    }
    assert.equal(count, 200);
});

test('balanced BST layout stays compact while preserving in-order node order', () => {
    const tree = new TreeElement();
    tree.treeType = 'bst';
    const values = [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15];
    assert.equal(tree.buildFromText(values.join(' '), 'values'), null);

    const inOrder = [];
    const visit = node => {
        if (!node) return;
        visit(node.children[0]);
        inOrder.push(node);
        visit(node.children[1]);
    };
    visit(tree.root);
    assert.deepEqual(inOrder.map(node => Number(node.value)), [...values].sort((a, b) => a - b));
    for (let index = 1; index < inOrder.length; index++) {
        assert.ok(inOrder[index].x > inOrder[index - 1].x);
    }
    assert.ok(tree.width < 500);
});

test('graph selection bounds avoid scanning nodes and edges on hover', () => {
    const graph = new GraphElement(10, 20);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const originalNodeHitTest = GraphRenderer.hitTestNode;
    const originalEdgeHitTest = GraphRenderer.hitTestEdge;
    try {
        GraphRenderer.hitTestNode = () => { throw new Error('unexpected node scan'); };
        GraphRenderer.hitTestEdge = () => { throw new Error('unexpected edge scan'); };
        assert.equal(graph.containsPoint(40, 40), true);
    } finally {
        GraphRenderer.hitTestNode = originalNodeHitTest;
        GraphRenderer.hitTestEdge = originalEdgeHitTest;
    }
});

test('tree selection bounds avoid scanning nodes and edges on hover', () => {
    const tree = new TreeElement(10, 20);
    assert.equal(tree.buildFromText('2\n1 2'), null);
    const originalNodeHitTest = TreeRenderer.hitTestNode;
    const originalEdgeHitTest = TreeRenderer.hitTestEdge;
    try {
        TreeRenderer.hitTestNode = () => { throw new Error('unexpected node scan'); };
        TreeRenderer.hitTestEdge = () => { throw new Error('unexpected edge scan'); };
        assert.equal(tree.containsPoint(tree.x + 1, tree.y + 1), true);
    } finally {
        TreeRenderer.hitTestNode = originalNodeHitTest;
        TreeRenderer.hitTestEdge = originalEdgeHitTest;
    }
});

test('tree edge parser rejects cycles and accepts a connected acyclic tree', () => {
    assert.match(TreeParser.parseEdgeFormat(['1 2', '2 3', '3 1']).error, /循環/);
    const valid = TreeParser.parseEdgeFormat(['1 2', '1 3', '2 4']);
    assert.equal(valid.error, null);
    assert.equal(valid.nodes.size, 4);
});

test('rooted tree weights are rendered on edges and reject non-numeric weights', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2 7', 'rooted'), null);
    const child = tree.root.children[0];
    assert.equal(child.meta.edgeWeight, '7');
    assert.equal(child.meta.nodeWeight, undefined);

    const labels = [];
    const labelPositions = [];
    const weightFrames = [];
    const ctx = {
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        fill() {},
        fillRect: () => weightFrames.push('fill'),
        strokeRect: () => weightFrames.push('stroke'), arc() {},
        fillText: (text, x, y) => {
            labels.push(String(text));
            labelPositions.push({ label: String(text), x, y });
        }
    };
    TreeRenderer.draw(ctx, tree.root, {
        nodeRadius: tree.nodeRadius,
        treeType: tree.treeType,
        hasWeights: tree.hasWeights,
        offsetX: 0,
        offsetY: 0
    });
    assert.ok(labels.includes('7'));
    assert.ok(!labels.includes('w:7'));
    assert.equal(weightFrames.length, 0);
    const weightLabel = labelPositions.find(({ label }) => label === '7');
    assert.equal(weightLabel.x, (tree.root.x + child.x) / 2);
    assert.equal(weightLabel.y, (tree.root.y + child.y) / 2);
    const { offsetX, offsetY } = tree._getCurrentOffsets();
    assert.equal(tree.hitTestEdgeNode(
        (tree.root.x + child.x) / 2 + offsetX,
        (tree.root.y + child.y) / 2 + offsetY
    ), child);
    assert.match(TreeParser.parseRootedFormat(['2', '1 2 nope']).error, /有限數值/);

    assert.equal(tree.setEdgeWeight(child, '2.5'), true);
    assert.equal(tree.setEdgeWeight(child, 'not a number'), false);

    assert.equal(tree.setNodeValue(child, 'updated'), true);
    const saved = tree.serialize();
    const restored = TreeElement.fromData(saved);
    restored.deserialize(saved);
    assert.equal(restored.root.children[0].value, 'updated');
    assert.equal(restored.root.children[0].meta.edgeWeight, '2.5');
    assert.equal(restored.setEdgeWeight(restored.root.children[0], ''), true);
    assert.equal(restored.root.children[0].meta.edgeWeight, undefined);
    const clearedWeightSave = restored.serialize();
    const restoredClearedWeight = TreeElement.fromData(clearedWeightSave);
    restoredClearedWeight.deserialize(clearedWeightSave);
    assert.equal(restoredClearedWeight.root.children[0].meta.edgeWeight, undefined);
    assert.equal(restoredClearedWeight.hasWeights, true);
});

test('weighted trees show a frame-free placeholder for empty edge weights', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2', 'rooted'), null);
    tree.hasWeights = true;
    const labels = [];
    let frameCount = 0;
    const ctx = {
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        fill() {}, fillRect() { frameCount++; }, strokeRect() { frameCount++; }, arc() {},
        fillText: (label, x, y) => labels.push({ label: String(label), x, y })
    };
    TreeRenderer.draw(ctx, tree.root, {
        nodeRadius: tree.nodeRadius,
        hasWeights: tree.hasWeights,
        offsetX: 0,
        offsetY: 0
    });
    const placeholder = labels.find(({ label }) => label === '?');
    assert.ok(placeholder);
    assert.equal(frameCount, 0);
    assert.equal(placeholder.x, (tree.root.x + tree.root.children[0].x) / 2);
    assert.equal(placeholder.y, (tree.root.y + tree.root.children[0].y) / 2);
});

test('text hydration normalizes legacy fonts without mutating saved data', () => {
    const data = {
        type: 'text', x: 10, y: 20, width: 100, height: 24,
        text: 'legacy text', fontFamily: 'Segoe UI', isBold: true
    };
    const element = TextElement.fromData(data);
    assert.equal(element.text, 'Text');
    element.deserialize(data);
    assert.equal(element.text, 'legacy text');
    assert.equal(element.fontFamily, "'Zen Maru Gothic', sans-serif");
    assert.equal(element.isBold, true);
    assert.equal(data.fontFamily, 'Segoe UI');
});

test('long text draws only visible rows and leaves editing glyphs to the native editor', () => {
    const text = new TextElement(0, 0);
    text.text = Array.from({ length: 50_000 }, (_, index) => String(index)).join('\n');
    const drawn = [];
    const ctx = {
        canvas: { width: 800, height: 600 },
        save() {}, restore() {}, translate() {}, scale() {},
        measureText: () => ({ width: 50, fontBoundingBoxAscent: 18, fontBoundingBoxDescent: 5 }),
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: -20_000 }),
        fillText: value => drawn.push(Number(value))
    };
    text.draw(ctx);
    assert.ok(drawn.length < 35);
    assert.ok(drawn[0] > 950);
    drawn.length = 0;
    text.isEditing = true;
    text.draw(ctx);
    assert.equal(drawn.length, 0);
});

test('dense seven-node layouts preserve node-to-edge clearance', () => {
    let seed = 1234;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let sample = 0; sample < 100; sample++) {
        const edges = [];
        const probability = 0.1 + (sample % 10) * 0.09;
        for (let u = 1; u <= 7; u++) for (let v = u + 1; v <= 7; v++) {
            if (random() < probability) edges.push(`${u} ${v}`);
        }
        const graph = new GraphElement();
        graph.buildFromText([`7 ${edges.length}`, ...edges].join('\n'));
        assert.equal(GraphLayout.hasOverlaps(graph.nodes, graph.nodeRadius * 2 + 8), false);
        assert.equal(GraphLayout.hasNodeEdgeOverlaps(graph.nodes, graph.edges, graph.nodeRadius), false,
            `Nodes must clear unrelated edges in sample ${sample}.`);
    }
});

test('text hydration restores scale bases so edits and resizing stay aligned', () => {
    const data = {
        type: 'text', x: 0, y: 0, width: 200, height: 48,
        text: 'abc', fontSize: 16, baseWidth: 100, baseHeight: 24
    };
    const element = TextElement.fromData(data);
    element.deserialize(data);
    assert.equal(element._baseWidth, 100);
    assert.equal(element._baseHeight, 24);

    element.autoSize({
        save() {}, restore() {},
        measureText: text => ({ width: text.length * 10 })
    });
    assert.equal(element.width, 60);
    assert.equal(element.height, 41.6);
});

test('maximum-length text stays within importable bounds after auto sizing', () => {
    const element = new TextElement(0, 0);
    element.text = 'W'.repeat(1_000_000);
    element.autoSize({
        save() {}, restore() {},
        measureText: text => ({ width: text.length * 16 })
    });

    assert.equal(element._baseWidth, 16_000_000);
    assert.equal(element.width, 10_000_000);
    const record = element.serialize();
    assert.doesNotThrow(() => validateWhiteboardElement(record));

    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, { elements: [record] });
    assert.equal(app.elements[0].text.length, 1_000_000);
    assert.equal(app.elements[0].width, 10_000_000);
    assert.equal(app.elements[0]._baseWidth, 16_000_000);
});

test('pen bounds handle large strokes without argument spreading or rescanning each point', () => {
    const pen = new PenElement();
    const recalculateBounds = pen._recalcBounds.bind(pen);
    pen._recalcBounds = () => { throw new Error('addPoint should update bounds incrementally'); };
    assert.equal(pen.addPoint(8, -3), true);
    assert.equal(pen.addPoint(-2, 10), true);
    assert.equal(pen.addPoint(4, 6), true);
    pen._recalcBounds = recalculateBounds;
    assert.deepEqual({ x: pen.x, y: pen.y, width: pen.width, height: pen.height },
        { x: -2, y: -3, width: 10, height: 13 });
    assert.equal(pen.addPoint(Infinity, 0), false);

    pen.points = Array.from({ length: 150000 }, (_, index) => ({ x: index - 75000, y: 12 }));
    assert.doesNotThrow(() => pen._recalcBounds());
    assert.deepEqual({ x: pen.x, y: pen.y, width: pen.width, height: pen.height },
        { x: -75000, y: 12, width: 149999, height: 0 });
    pen.optimize(0.1);
    assert.equal(pen.points.length, 2);
});

test('parallel undirected graph edges render on distinct lanes', () => {
    const paths = [];
    let path = null;
    const ctx = {
        beginPath() { path = []; paths.push(path); },
        moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        quadraticCurveTo(cx, cy, x, y) { path.push([cx, cy], [x, y]); },
        arc() {}, stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, fillText() {},
        measureText() { return { width: 0 }; }
    };
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }]
    ]);
    const edges = [
        { u: '1', v: '2', w: null, directed: false },
        { u: '2', v: '1', w: null, directed: false }
    ];

    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 10 });
    const edgePaths = paths.filter(points => points.length === 2 || points.length === 3);
    assert.equal(edgePaths.length, 2);
    assert.notEqual(edgePaths[0][0][1], edgePaths[1][0][1]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, -4, { nodeRadius: 10 }), edges[0]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, 4, { nodeRadius: 10 }), edges[1]);

    const loopEdges = [
        { u: '1', v: '1', directed: false },
        { u: '1', v: '1', directed: false }
    ];
    const loopNodes = new Map([['1', { id: '1', x: 0, y: 0, label: '1' }]]);
    assert.equal(GraphRenderer.hitTestEdge(loopNodes, loopEdges, 0, -25, {
        nodeRadius: 10
    }), loopEdges[0]);
    assert.equal(GraphRenderer.hitTestEdge(loopNodes, loopEdges, 0, -41, {
        nodeRadius: 10
    }), loopEdges[1]);
});

test('graph rendering measures repeated edge-weight labels once per frame', () => {
    let measureCalls = 0;
    const ctx = {
        beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, stroke() {}, fill() {},
        fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {},
        measureText(text) { if (text === '7' || text === '8') measureCalls++; return { width: 10 }; }
    };
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }]
    ]);
    const edges = [
        { u: '1', v: '2', w: '7' },
        { u: '2', v: '1', w: '7' },
        { u: '1', v: '2', w: '8' }
    ];

    GraphRenderer.draw(ctx, nodes, edges);
    assert.equal(measureCalls, 2);
});

test('graph edge lane metadata refreshes after in-place endpoint changes', () => {
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }],
        ['3', { id: '3', x: 0, y: 100, label: '3' }]
    ]);
    const edges = [
        { u: '1', v: '2', directed: false },
        { u: '1', v: '2', directed: false }
    ];

    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, -4, { nodeRadius: 10 }), edges[0]);
    edges[0].v = '3';
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 0, 50, { nodeRadius: 10 }), edges[0]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, 0, { nodeRadius: 10 }), edges[1]);

    edges[0].directed = true;
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 5, 50, {
        nodeRadius: 10, directed: true
    }), edges[0]);
});

test('connection drag rendering does not rebuild unused port arrays', () => {
    const renderer = new Renderer({}, {}, { zoom: 1 }, null, {
        elements: [{ getConnectionPorts() { throw new Error('unused port enumeration'); } }],
        transform: { mode: 'endpoint', targetElement: null }
    });
    assert.doesNotThrow(() => renderer._drawConnectionPortHints({}));
});

test('deep tree drawing and hit tests use iterative traversal', () => {
    const root = { value: '0', x: 0, y: 0, children: [], meta: {} };
    let current = root;
    for (let index = 1; index < 2000; index++) {
        const child = {
            value: String(index), x: 0, y: index * 50,
            children: [], parent: current, meta: {}
        };
        current.children.push(child);
        current = child;
    }
    let drawnNodes = 0;
    const ctx = {
        globalAlpha: 1, save() {}, restore() {}, beginPath() {}, arc() {},
        moveTo() {}, lineTo() {}, stroke() {}, fill() {},
        fillText() { drawnNodes++; }
    };

    assert.doesNotThrow(() => TreeRenderer.draw(ctx, root));
    assert.equal(drawnNodes, 2000);
    assert.equal(TreeRenderer.hitTestNode(root, 0, 1999 * 50, { nodeRadius: 18 }), current);
    assert.equal(TreeRenderer.hitTestEdge(root, 100000, 100000, { nodeRadius: 18 }), false);
    assert.equal(TreeRenderer.hitTestEdgeNode(root, 100000, 100000, { nodeRadius: 18 }), null);
});

test('deep tree layout and Euler timestamps avoid recursive stack limits', () => {
    const nodeCount = 15000;
    const root = { value: '0', children: [], meta: {} };
    let current = root;
    for (let index = 1; index < nodeCount; index++) {
        const child = { value: String(index), children: [], meta: {} };
        current.children.push(child);
        child.parent = current;
        current = child;
    }

    assert.doesNotThrow(() => TreeLayout.layout(root));
    assert.deepEqual(TreeLayout.getBounds(root), {
        x: 0,
        y: 0,
        w: 0,
        h: (nodeCount - 1) * 60
    });
    const tour = TreeParser.computeEulerTour(root);
    assert.equal(tour.length, nodeCount);
    assert.equal(root.meta.tin, 1);
    assert.equal(current.meta.tin, nodeCount);
    assert.equal(current.meta.tout, nodeCount + 1);
    assert.equal(root.meta.tout, nodeCount * 2);
});

test('reciprocal directed graph edges keep their offset lanes and hit tests', () => {
    const paths = [];
    let path = null;
    const ctx = {
        beginPath() { path = []; paths.push(path); },
        moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        quadraticCurveTo(cx, cy, x, y) { path.push([cx, cy], [x, y]); },
        arc() {}, stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, fillText() {},
        measureText() { return { width: 0 }; }
    };
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }]
    ]);
    const edges = [
        { u: '1', v: '2', directed: true },
        { u: '2', v: '1', directed: true }
    ];

    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 10, directed: true });
    const edgePaths = paths.filter(points => points.length === 2 || points.length === 3);
    assert.equal(edgePaths.length, 2);
    assert.notEqual(edgePaths[0][0][1], edgePaths[1][0][1]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, 10, {
        nodeRadius: 10, directed: true
    }), edges[0]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, -10, {
        nodeRadius: 10, directed: true
    }), edges[1]);

    const mixedEdges = [
        { u: '1', v: '2', directed: true },
        { u: '2', v: '1', directed: false }
    ];
    paths.length = 0;
    GraphRenderer.draw(ctx, nodes, mixedEdges, { nodeRadius: 10, directed: false });
    const mixedEdgePaths = paths.filter(points => points.length === 2 || points.length === 3);
    assert.equal(mixedEdgePaths.length, 2);
    assert.ok(mixedEdgePaths[0][0][1] > 0);
    assert.equal(mixedEdgePaths[1][0][1], 0);

    const customIdNodes = new Map([
        ['a->b', { id: 'a->b', x: 0, y: 0, label: 'a->b' }],
        ['c', { id: 'c', x: 100, y: 0, label: 'c' }],
        ['c->a', { id: 'c->a', x: 0, y: 0, label: 'c->a' }],
        ['b', { id: 'b', x: 100, y: 0, label: 'b' }]
    ]);
    const customIdEdges = [
        { u: 'a->b', v: 'c', directed: true },
        { u: 'c->a', v: 'b', directed: true }
    ];
    paths.length = 0;
    GraphRenderer.draw(ctx, customIdNodes, customIdEdges, {
        nodeRadius: 10, directed: true
    });
    const customIdPaths = paths.filter(points => points.length === 2 || points.length === 3);
    assert.deepEqual(customIdPaths.map(points => points[0][1]), [0, 0]);
});

test('BST, AVL, and red-black builders reject values that cannot be ordered numerically', () => {
    for (const build of [TreeParser.buildBST, TreeParser.buildAVL, TreeParser.buildRBTree]) {
        assert.match(build(['1', 'not-a-number']).error, /有限數值/);
        assert.match(build(['1', 'Infinity']).error, /有限數值/);
    }
});

test('AVL and red-black builders maintain ordering and balancing invariants', () => {
    const sequences = [
        Array.from({ length: 80 }, (_, i) => i),
        Array.from({ length: 80 }, (_, i) => 79 - i),
        Array.from({ length: 80 }, (_, i) => (i * 37) % 80),
        [5, 5, 5, 5, 5, 4, 6, 4, 6]
    ];
    let seed = 0x51A7;
    sequences.push(Array.from({ length: 160 }, () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed % 41 - 20;
    }));

    for (const sequence of sequences) {
        const values = sequence.map(String);
        for (const build of [TreeParser.buildAVL, TreeParser.buildRBTree]) {
            const { root } = build(values);
            assert.ok(root);
            assert.equal(root.parent, null);
            const inOrder = [];
            const visitOrder = node => {
                if (!node) return;
                visitOrder(node.children[0]);
                inOrder.push(Number(node.value));
                visitOrder(node.children[1]);
            };
            visitOrder(root);
            assert.deepEqual(inOrder, [...sequence].sort((a, b) => a - b));
        }

        const { root: avlRoot } = TreeParser.buildAVL(values);
        const checkAvl = node => {
            if (!node) return 0;
            const leftHeight = checkAvl(node.children[0]);
            const rightHeight = checkAvl(node.children[1]);
            assert.ok(Math.abs(leftHeight - rightHeight) <= 1);
            assert.equal(node.meta.height, 1 + Math.max(leftHeight, rightHeight));
            return node.meta.height;
        };
        checkAvl(avlRoot);

        const { root: rbRoot } = TreeParser.buildRBTree(values);
        assert.equal(rbRoot.meta.color, 'black');
        const checkRedBlack = node => {
            if (!node) return 1;
            if (node.meta.color === 'red') {
                assert.notEqual(node.children[0]?.meta.color, 'red');
                assert.notEqual(node.children[1]?.meta.color, 'red');
            }
            for (const child of node.children) {
                if (child) assert.equal(child.parent, node);
            }
            const leftBlackHeight = checkRedBlack(node.children[0]);
            const rightBlackHeight = checkRedBlack(node.children[1]);
            assert.equal(leftBlackHeight, rightBlackHeight);
            return leftBlackHeight + Number(node.meta.color === 'black');
        };
        checkRedBlack(rbRoot);
    }
});

test('tree parsing limits input size and preserves the previous tree on invalid edits', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3', 'rooted'), null);
    const root = tree.root;
    const previousText = tree.inputText;
    assert.match(tree.buildFromText('3\n1 4\n1 3', 'rooted'), /介於/);
    assert.equal(tree.root, root);
    assert.equal(tree.inputText, previousText);
    assert.match(TreeParser.parseParentFormat(new Array(2001).fill('1')).error, /2000/);

    const oversizedValues = Array.from({ length: 2001 }, (_, index) => String(index));
    assert.match(tree.buildFromText(oversizedValues.join(' '), 'auto'), /2000/);
    assert.equal(tree.root, root);
    assert.equal(tree.inputText, previousText);
    for (const build of [TreeParser.buildBST, TreeParser.buildAVL, TreeParser.buildRBTree]) {
        assert.match(build(oversizedValues).error, /2000/);
    }
});

test('tree layout visits deeper non-binary branches without dropping nodes', () => {
    const parsed = TreeParser.parseEdgeFormat([
        '1 2', '1 3', '2 4', '2 5', '2 6'
    ]);
    assert.equal(parsed.error, null);
    TreeLayout.layout(parsed.root);
    for (const node of parsed.nodes.values()) {
        assert.ok(Number.isFinite(node.x));
        assert.ok(Number.isFinite(node.y));
    }
    assert.ok(parsed.nodes.get('6').x > 0);
});

test('matrix dimensions reject invalid sizes without mutating existing cells', () => {
    const matrix = new MatrixElement();
    matrix.setFromText('1 2\n3 4');
    const previous = matrix.data.map(row => [...row]);
    assert.match(matrix.setFromText('201x2'), /200/);
    assert.deepEqual(matrix.data, previous);
    assert.match(matrix.setFromText('x'.repeat(1000001)), /1 MB/);
    assert.deepEqual(matrix.data, previous);
});

test('resizing an empty matrix keeps finite cell geometry', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText(''), null);
    matrix.width = 120;
    matrix.height = 90;
    matrix.onResize(120, 90);
    assert.equal(matrix.cellSize, 42);
    assert.equal(matrix.width, 120);
    assert.equal(matrix.height, 90);
    assert.equal(matrix.hitTestCell(30, 30), null);
});

test('failed JSON imports leave the current board and camera unchanged', () => {
    const existing = { id: 'keep-existing-board' };
    const app = {
        elements: [existing],
        camera: { x: 4, y: 5, zoom: 2 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    const input = {
        elements: [
            { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
            null
        ],
        camera: { x: 10, y: 20, zoom: 1 }
    };

    assert.throws(() => Serializer.loadJSONData(app, input), /無效的白板物件/);
    assert.deepEqual(app.elements, [existing]);
    assert.deepEqual(app.camera, { x: 4, y: 5, zoom: 2 });
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{ type: '__proto__', x: 0, y: 0, width: 1, height: 1 }]
    }), /不支援的白板物件類型/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'pen', x: 0, y: 0, width: 1, height: 1,
            points: [{ x: 'invalid', y: 0 }]
        }]
    }), /畫筆資料無效/);
    for (const camera of [
        { x: 1e20, y: 0, zoom: 1 },
        { x: 0, y: -1e20, zoom: 1 },
        { x: 0, y: 0, zoom: 1e-300 },
        { x: 0, y: 0, zoom: 11 }
    ]) {
        assert.throws(() => Serializer.loadJSONData(app, { elements: [], camera }), /白板視角設定無效/);
    }
    assert.deepEqual(app.elements, [existing]);
    assert.deepEqual(app.camera, { x: 4, y: 5, zoom: 2 });
});

test('JSON imports reject oversized and duplicate data before replacing the board', () => {
    const existing = { id: 'keep-existing-board' };
    const app = {
        elements: [existing],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };

    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'pen', x: 0, y: 0, width: 0, height: 0,
            points: Array.from({ length: 100001 }, () => ({ x: 0, y: 0 }))
        }]
    }), /畫筆資料無效或點數超過上限/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [
            { id: 'duplicate', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
            { id: 'duplicate', type: 'rectangle', x: 20, y: 0, width: 10, height: 10 }
        ]
    }), /ID 重複/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{ type: 'rectangle', x: 1e20, y: 0, width: 10, height: 10 }]
    }), /超出支援範圍/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'rectangle', x: 0, y: 0, width: 10, height: 10,
            rotation: { toString: null, valueOf: null }
        }]
    }), /樣式資料無效/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{ type: 'rectangle', x: 0, y: 0, width: 10, height: 10, opacity: 2 }]
    }), /樣式資料無效/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'safe',
            fontFamily: { includes: true }
        }]
    }), /文字或樣式資料無效或超過上限/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'pen', x: 0, y: 0, width: 0, height: 0,
            points: [{ x: -1e308, y: 0 }, { x: 1e308, y: 0 }]
        }]
    }), /畫筆資料無效/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'matrix', x: 0, y: 0, width: 62, height: 62,
            rows: 1, cols: 1, data: [[{ toString: null, valueOf: null }]]
        }]
    }), /矩陣尺寸或儲存格資料無效/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'graph', x: 0, y: 0, width: 400, height: 350,
            graphNodes: [{ id: '1', x: 1e20, y: 0, label: '1' }], edges: []
        }]
    }), /圖節點資料無效/);
    assert.deepEqual(app.elements, [existing]);
});

test('JSON import preserves signed line endpoints', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [{ type: 'line', x: 30, y: 20, width: -20, height: 15 }]
    });
    assert.equal(app.elements[0].width, -20);
    assert.equal(app.elements[0].height, 15);
});

test('JSON import detaches line endpoints that reference missing elements', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'line', id: 'line-1', x: 30, y: 20, width: -20, height: 15,
            connections: {
                p1: { elementId: 'missing-target', portId: 'right' },
                p2: null
            }
        }]
    });
    assert.deepEqual(app.elements[0].connections, { p1: null, p2: null });
    assert.equal(app.elements[0].width, -20);
});

test('JSON import detaches line endpoints that reference unknown ports', () => {
    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [
            { type: 'rectangle', id: 'target-1', x: 0, y: 0, width: 80, height: 60 },
            {
                type: 'line', id: 'line-2', x: 10, y: 10, width: 80, height: 60,
                connections: {
                    p1: { elementId: 'target-1', portId: 'not-a-port' },
                    p2: { elementId: 'target-1', portId: 'right' }
                }
            }
        ]
    });

    assert.deepEqual(app.elements[1].connections, {
        p1: null,
        p2: { elementId: 'target-1', portId: 'right' }
    });
});

test('partial element hydration preserves connections to elements outside the batch', () => {
    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    const connection = { elementId: 'target-outside-batch', portId: 'node_8' };
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'line', id: 'line-partial', x: 0, y: 0, width: 10, height: 10,
            connections: { p1: connection, p2: null }
        }]
    }, { preserveExternalConnections: true });

    assert.deepEqual(app.elements[0].connections, { p1: connection, p2: null });
});

test('graph JSON import normalizes mixed numeric and string node IDs', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'graph', x: 0, y: 0, width: 400, height: 350,
            graphNodes: [
                { id: 1, x: 40, y: 40, label: '1' },
                { id: '2', x: 80, y: 80, label: '2' }
            ],
            edges: [{ u: '1', v: 2, w: null, directed: false }]
        }]
    });

    const graph = app.elements[0];
    assert.equal(graph.nodes.size, 2);
    assert.equal(graph.edges[0].u, '1');
    assert.equal(graph.edges[0].v, '2');
    assert.ok(graph.nodes.has(graph.edges[0].u));
    assert.ok(graph.nodes.has(graph.edges[0].v));
});

test('graph JSON import repairs overlapping nodes and preserves separated positions', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    const savedNodes = [
        { id: '1', x: 100, y: 100, label: '1' },
        { id: '2', x: 100, y: 100, label: '2' },
        { id: '3', x: 600, y: 160, label: '3' }
    ];
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'graph', x: 0, y: 0, width: 400, height: 350,
            graphNodes: savedNodes, edges: [{ u: '1', v: '2' }]
        }]
    });

    const graph = app.elements[0];
    const nodes = [...graph.nodes.values()];
    const minimumDistance = graph.nodeRadius * 2 + 6;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }
    assert.deepEqual({ x: nodes[2].x, y: nodes[2].y }, { x: 600, y: 160 });
    assert.ok(graph.width >= 664);
});

test('graph and tree JSON restore clamp invalid node radii before layout', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const savedGraph = { ...graph.serialize(), nodeRadius: -10 };
    const restoredGraph = GraphElement.fromData(savedGraph);
    restoredGraph.deserialize(savedGraph);
    assert.equal(restoredGraph.nodeRadius, 1);
    assert.ok(!GraphLayout.hasOverlaps(restoredGraph.nodes, 10));

    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2'), null);
    const savedTree = { ...tree.serialize(), nodeRadius: -10 };
    const restoredTree = TreeElement.fromData(savedTree);
    restoredTree.deserialize(savedTree);
    assert.equal(restoredTree.nodeRadius, 8);
    assert.ok(restoredTree.root.children[0].y - restoredTree.root.y >= 24);
});

test('JSON element records cannot shadow methods or change element prototypes', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    const input = JSON.parse('{"elements":[{"type":"rectangle","x":0,"y":0,"width":10,"height":10,' +
        '"draw":"not-a-function","serialize":"not-a-function","constructor":{"polluted":true},' +
        '"__proto__":{"polluted":true}}]}');

    Serializer.loadJSONData(app, input);
    const [element] = app.elements;
    assert.equal(typeof element.draw, 'function');
    assert.equal(typeof element.serialize, 'function');
    assert.equal(Object.hasOwn(element, 'draw'), false);
    assert.equal(Object.prototype.polluted, undefined);
});

test('oversized JSON files are rejected before allocating a FileReader', async () => {
    const app = { elements: [] };
    await assert.rejects(
        Serializer.importJSON(app, { size: 25 * 1024 * 1024 + 1 }),
        /25 MB/
    );
});

test('Markdown rendering bounds input size before invoking the parser', () => {
    const rendered = MarkdownElement.renderToHTML('x'.repeat(MarkdownElement.MAX_SOURCE_LENGTH + 1));
    assert.match(rendered, /1 MB/);
    assert.ok(rendered.length < 100);
    assert.equal(MarkdownElement.renderToHTML(null), '');
});

test('Worker authentication fails closed and does not expose verifier errors', async () => {
    let verifyCalls = 0;
    const verify = async () => { verifyCalls++; };
    const missingSecret = await authorizeRequest(
        new Request('https://worker.example/room?token=valid'),
        {},
        verify
    );
    assert.deepEqual(missingSecret, { status: 503, message: 'Authentication is not configured.' });
    assert.equal(verifyCalls, 0);

    const missingToken = await authorizeRequest(
        new Request('https://worker.example/room'),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        verify
    );
    assert.deepEqual(missingToken, { status: 401, message: 'Unauthorized.' });
    assert.equal(verifyCalls, 0);

    const authorized = await authorizeRequest(
        new Request('https://worker.example/room?token=query-token', {
            headers: { Authorization: 'Bearer header-token' }
        }),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        async (token, options) => {
            verifyCalls++;
            assert.equal(token, 'header-token');
            assert.equal(options.secretKey, 'test-secret');
            return { sub: 'user_123' };
        }
    );
    assert.equal(authorized, null);

    const legacyWebSocketToken = await authorizeRequest(
        new Request('https://worker.example/room?token=websocket-token'),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        async () => assert.fail('Query-string tokens must not reach the Clerk verifier.')
    );
    assert.deepEqual(legacyWebSocketToken, { status: 401, message: 'Unauthorized.' });

    const invalid = await authorizeRequest(
        new Request('https://worker.example/room?token=invalid'),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        async () => { throw new Error('secret verifier diagnostics'); }
    );
    assert.deepEqual(invalid, { status: 401, message: 'Unauthorized.' });
    assert.equal(JSON.stringify(invalid).includes('secret verifier diagnostics'), false);
});

test('Worker room names are bounded and reject encoded or path-like IDs', () => {
    const boardId = 'a'.repeat(32);
    assert.equal(getRoomId('/'), null);
    assert.equal(getRoomId('/' + boardId), boardId);
    assert.equal(getRoomId('/' + 'a'.repeat(65)), null);
    assert.equal(getRoomId('/a%2Fb'), null);
    assert.equal(getRoomId('/room/other'), null);
});

test('multi-select delete undo restores original stacking order', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }, d = { id: 'd' };
    const app = {
        elements: [a, b, c, d],
        layerManager: { _reindex() {} },
        renderer: { markDirty() {} }
    };
    app.selectionManager = new SelectionManager(app);
    app.selectionManager.select(a);
    app.selectionManager.addToSelection(c);
    const history = new History(app);
    history.pushDelete(app, [c, a]);
    app.elements = app.elements.filter(element => element !== a && element !== c);
    app.selectionManager.clear();

    history.undo();
    assert.deepEqual(app.elements, [a, b, c, d]);
    assert.deepEqual(app.selectionManager.selectedElements, [a, c]);
    history.redo();
    assert.deepEqual(app.elements, [b, d]);
    assert.deepEqual(app.selectionManager.selectedElements, []);
});

test('undoing an add uses the current selection API and redo restores group z-order', () => {
    const before = { type: 'rectangle', id: 'before' };
    const added = { type: 'rectangle', id: 'added' };
    const addedSecond = { type: 'rectangle', id: 'added-second' };
    const middle = { type: 'rectangle', id: 'middle' };
    const after = { type: 'rectangle', id: 'after' };
    const app = {
        elements: [before, added, middle, addedSecond, after],
        layerManager: { _reindex() {} },
        renderer: { markDirty() {} }
    };
    app.selectionManager = new SelectionManager(app);
    app.selectionManager.select(added);
    const history = new History(app);
    history.pushAdd(app, [added, addedSecond]);

    assert.doesNotThrow(() => history.undo());
    assert.deepEqual(app.elements, [before, middle, after]);
    assert.deepEqual(app.selectionManager.selectedElements, []);
    history.redo();
    history.redo();
    assert.deepEqual(app.elements, [before, added, middle, addedSecond, after]);
});

test('failed history commands remain available for retry', () => {
    const history = new History({ renderer: { markDirty() {} } });
    const error = new Error('temporary undo failure');
    history.push({ undo() { throw error; }, redo() {} });

    assert.throws(() => history.undo(), error);
    assert.equal(history.undoStack.length, 1);
    assert.equal(history.redoStack.length, 0);

    history.undoStack[0].undo = () => {};
    history.undo();
    assert.equal(history.undoStack.length, 0);
    assert.equal(history.redoStack.length, 1);

    history.redoStack[0].redo = () => { throw error; };
    assert.throws(() => history.redo(), error);
    assert.equal(history.redoStack.length, 1);
    assert.equal(history.undoStack.length, 0);
});

test('history push, undo, and redo each schedule autosave', () => {
    let saves = 0;
    let value = 2;
    const history = new History({
        renderer: { markDirty() {} },
        _autosave() { saves++; }
    });
    history.push({
        undo() { value = 1; },
        redo() { value = 2; }
    });
    assert.equal(saves, 1);
    history.undo();
    assert.equal(value, 1);
    assert.equal(saves, 2);
    history.redo();
    assert.equal(value, 2);
    assert.equal(saves, 3);
});

test('resizing undo restores internal matrix, tree, and graph geometry', () => {
    const history = new History({ renderer: { markDirty() {} } });

    const matrix = new MatrixElement();
    const originalMatrixBounds = { x: matrix.x, y: matrix.y, w: matrix.width, h: matrix.height };
    const originalCellSize = matrix.cellSize;
    matrix.onResizeStart();
    const originalMatrixResizeState = matrix.captureResizeState();
    matrix.onResize(300, 240);
    const resizedMatrixBounds = { x: matrix.x, y: matrix.y, w: matrix.width, h: matrix.height };
    const resizedCellSize = matrix.cellSize;
    const resizedMatrixState = matrix.captureResizeState();
    history.pushResize(matrix, originalMatrixBounds, resizedMatrixBounds, null, null, null,
        originalMatrixResizeState, resizedMatrixState);
    history.undo();
    assert.equal(matrix.cellSize, originalCellSize);
    assert.equal(matrix.width, originalMatrixBounds.w);
    history.redo();
    assert.equal(matrix.cellSize, resizedCellSize);
    assert.equal(matrix.width, resizedMatrixBounds.w);

    for (const sequence of [new QueueElement(), new StackElement()]) {
        sequence.setFromText('a b c');
        const initialBounds = { x: sequence.x, y: sequence.y, w: sequence.width, h: sequence.height };
        const initialState = sequence.captureResizeState();
        sequence.onResizeStart();
        const initialResizeState = sequence.captureResizeState();
        sequence.width *= 1.7;
        sequence.height *= 1.7;
        sequence.onResize(sequence.width, sequence.height);
        const resizedBounds = { x: sequence.x, y: sequence.y, w: sequence.width, h: sequence.height };
        const resizedState = sequence.captureResizeState();
        history.pushResize(sequence, initialBounds, resizedBounds, null, null, null,
            initialResizeState, resizedState);
        history.undo();
        assert.deepEqual(sequence.captureResizeState(), initialState);
        history.redo();
        assert.deepEqual(sequence.captureResizeState(), resizedState);
    }

    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3', 'rooted'), null);
    const originalTreeBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    const originalRadius = tree.nodeRadius;
    tree.onResizeStart();
    const originalTreeResizeState = tree.captureResizeState();
    tree.onResize(tree.width * 2, tree.height * 2);
    const resizedTreeBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    const resizedRadius = tree.nodeRadius;
    const resizedTreeState = tree.captureResizeState();
    history.pushResize(tree, originalTreeBounds, resizedTreeBounds, null, null, null,
        originalTreeResizeState, resizedTreeState);
    history.undo();
    assert.equal(tree.nodeRadius, originalRadius);
    history.redo();
    assert.equal(tree.nodeRadius, resizedRadius);

    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const originalGraphBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    const originalNodePositions = [...graph.nodes.values()].map(({ x, y }) => ({ x, y }));
    graph.onResizeStart();
    const originalGraphResizeState = graph.captureResizeState();
    graph.width = 520;
    graph.height = 430;
    graph.onResize(520, 430);
    const resizedGraphBounds = { x: graph.x, y: graph.y, w: 520, h: 430 };
    const resizedNodePositions = [...graph.nodes.values()].map(({ x, y }) => ({ x, y }));
    const resizedGraphState = graph.captureResizeState();
    history.pushResize(graph, originalGraphBounds, resizedGraphBounds, null, null, null,
        originalGraphResizeState, resizedGraphState);
    history.undo();
    assert.deepEqual([...graph.nodes.values()].map(({ x, y }) => ({ x, y })), originalNodePositions);
    history.redo();
    assert.deepEqual([...graph.nodes.values()].map(({ x, y }) => ({ x, y })), resizedNodePositions);
});

test('resize history restores graph and tree positions after their nodes are rebuilt', () => {
    const history = new History({ renderer: { markDirty() {} } });
    const tree = new TreeElement();
    const treeInput = '3\n1 2\n1 3';
    assert.equal(tree.buildFromText(treeInput, 'rooted'), null);
    const treeBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    tree.onResizeStart();
    const treeBefore = tree.captureResizeState();
    tree.onResize(tree.width * 1.5, tree.height * 1.5);
    const treeResizedBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    const treeAfter = tree.captureResizeState();
    history.pushResize(tree, treeBounds, treeResizedBounds, null, null, null, treeBefore, treeAfter);
    assert.equal(tree.buildFromText(treeInput, 'rooted'), null);
    history.undo();
    assert.deepEqual(tree.captureResizeState().nodePositions.map(({ x, y }) => ({ x, y })),
        treeBefore.nodePositions.map(({ x, y }) => ({ x, y })));
    history.redo();
    assert.deepEqual(tree.captureResizeState().nodePositions.map(({ x, y }) => ({ x, y })),
        treeAfter.nodePositions.map(({ x, y }) => ({ x, y })));

    const graph = new GraphElement();
    const graphInput = '3 2\n1 2\n2 3';
    assert.equal(graph.buildFromText(graphInput), null);
    const graphBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    graph.onResizeStart();
    const graphBefore = graph.captureResizeState();
    graph.width *= 1.5;
    graph.height *= 1.5;
    graph.onResize(graph.width, graph.height);
    const graphResizedBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    const graphAfter = graph.captureResizeState();
    history.pushResize(graph, graphBounds, graphResizedBounds, null, null, null, graphBefore, graphAfter);
    assert.equal(graph.buildFromText(graphInput), null);
    history.undo();
    assert.deepEqual(graphBefore.map(({ id }) => graph.nodes.get(id)).map(({ x, y }) => ({ x, y })),
        graphBefore.map(({ x, y }) => ({ x, y })));
    history.redo();
    assert.deepEqual(graphAfter.map(({ id }) => graph.nodes.get(id)).map(({ x, y }) => ({ x, y })),
        graphAfter.map(({ x, y }) => ({ x, y })));
});

test('successful board import clears stale undo and redo commands', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        history: { undoStack: [{}], redoStack: [{}], clear: History.prototype.clear },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    app.history.undoStack.length = 1;
    app.history.redoStack.length = 1;
    Serializer.loadJSONData(app, { elements: [] });
    assert.deepEqual(app.history.undoStack, []);
    assert.deepEqual(app.history.redoStack, []);
});

test('tree JSON restore can read rooted input for a non-generic display type', () => {
    const tree = new TreeElement();
    tree.deserialize({
        ...tree.serialize(),
        treeType: 'bst',
        inputText: '3\n1 2\n1 3'
    });
    assert.equal(tree.root.value, '1');
    assert.equal(tree.root.children.length, 2);
});

test('legacy tree JSON without an input mode preserves its rooted parent direction', () => {
    const tree = new TreeElement();
    const data = {
        ...tree.serialize(),
        treeType: 'bst',
        inputText: '3\n2 1\n2 3'
    };
    delete data.inputMode;

    tree.deserialize(data);
    assert.equal(tree.root.value, '2');
    assert.deepEqual(tree.root.children.map(child => child.value), ['1', '3']);
    assert.equal(tree.inputMode, 'rooted');
});

test('tree edit history can re-find nodes after deserialization rebuilds the tree', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3', 'rooted'), null);
    const originalNode = tree.root.children[1];
    const path = tree.getNodePath(originalNode);
    assert.equal(path, 'r.1');
    assert.equal(tree.setNodeValue(originalNode, 'renamed'), true);
    assert.equal(tree.setEdgeWeight(originalNode, '8'), true);

    const snapshot = JSON.parse(JSON.stringify(tree.serialize()));
    tree.deserialize(snapshot);
    const restoredNode = tree.getNodeAtPath(path);
    assert.ok(restoredNode);
    assert.notEqual(restoredNode, originalNode);
    assert.equal(restoredNode.value, 'renamed');
    assert.equal(restoredNode.meta.edgeWeight, '8');

    assert.equal(tree.setNodeValue(tree.getNodeAtPath(path), '2'), true);
    assert.equal(tree.setEdgeWeight(tree.getNodeAtPath(path), '7'), true);
    assert.equal(tree.getNodeAtPath('r.99'), null);
});

test('rotated matrix cells and sequence items remain correctly hittable', () => {
    const rotation = Math.PI / 2;
    const matrix = new MatrixElement(40, 60);
    matrix.setFromText('1 2\n3 4');
    matrix.rotation = rotation;
    const matrixCell = matrix.toWorldPoint(40 + 10 + 21, 60 + 10 + 21);
    assert.deepEqual(matrix.hitTestCell(matrixCell.x, matrixCell.y), { row: 0, col: 0 });
    assert.equal(matrix.containsPoint(matrixCell.x, matrixCell.y), true);

    const queue = new QueueElement(100, 50);
    queue.setFromText('a b');
    queue.rotation = rotation;
    const queueCell = queue.toWorldPoint(100 + 8 + 22, 50 + queue.height / 2);
    assert.equal(queue.hitTestItem(queueCell.x, queueCell.y), 0);

    const stack = new StackElement(180, 30);
    stack.setFromText('a b');
    stack.rotation = rotation;
    const bottomCellY = 30 + stack.height - 8 - stack.cellHeight / 2;
    const stackCell = stack.toWorldPoint(180 + stack.width / 2, bottomCellY);
    assert.equal(stack.hitTestItem(stackCell.x, stackCell.y), 0);
});

test('rotated graph/tree node hit tests and connection ports use rendered positions', () => {
    const graph = new GraphElement(30, 40);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    graph.rotation = Math.PI / 2;
    const [id, node] = [...graph.nodes.entries()][0];
    const graphNode = graph.toWorldPoint(graph.x + 20 + node.x, graph.y + 20 + node.y);
    assert.equal(graph.hitTestNode(graphNode.x, graphNode.y).id, id);
    assert.equal(graph.containsPoint(graphNode.x, graphNode.y), true);
    const graphPort = graph.getConnectionPorts().find(port => port.id === `node_${id}`);
    assert.ok(Math.hypot(graphPort.x - graphNode.x, graphPort.y - graphNode.y) < 1e-8);

    const tree = new TreeElement(250, 60);
    assert.equal(tree.buildFromText('2\n1 2', 'rooted'), null);
    tree.rotation = Math.PI / 2;
    const offsets = tree._getCurrentOffsets();
    const treeNode = tree.toWorldPoint(offsets.offsetX + tree.root.x, offsets.offsetY + tree.root.y);
    assert.equal(tree.hitTestNode(treeNode.x, treeNode.y), tree.root);
    assert.equal(tree.containsPoint(treeNode.x, treeNode.y), true);
    const treePort = tree.getConnectionPorts().find(port => port.id === `node_${tree.root.value}`);
    assert.ok(Math.hypot(treePort.x - treeNode.x, treePort.y - treeNode.y) < 1e-8);
});

test('duplicate tree values receive distinct connection port IDs', () => {
    const tree = new TreeElement(80, 45);
    tree.treeType = 'bst';
    assert.equal(tree.buildFromText('10 10 10', 'values'), null);

    const ports = tree.getConnectionPorts();
    assert.equal(ports.length, 3);
    assert.equal(new Set(ports.map(port => port.id)).size, 3);
    assert.equal(ports[0].id, 'node_10');

    for (const path of ['r', 'r.1', 'r.1.1']) {
        const node = tree.getNodeAtPath(path);
        const portId = path === 'r' ? 'node_10' : `tree@${path}`;
        const port = ports.find(candidate => candidate.id === portId);
        const offsets = tree._getCurrentOffsets();
        const expected = tree.toWorldPoint(offsets.offsetX + node.x, offsets.offsetY + node.y);
        assert.ok(port);
        assert.ok(Math.hypot(port.x - expected.x, port.y - expected.y) < 1e-8);
    }
});

test('tree connection ports stay stable after renaming nodes and survive JSON import', () => {
    const tree = new TreeElement(80, 45);
    assert.equal(tree.buildFromText('3\n1 2\n2 3'), null);
    const renamedNode = tree.root.children[0];
    const originalPort = tree.getConnectionPorts().find(port => port.id === 'node_2');
    assert.ok(originalPort);
    assert.equal(tree.setNodeValue(renamedNode, 'renamed'), true);
    const renamedPort = tree.getConnectionPorts().find(port => port.id === 'node_2');
    assert.deepEqual(renamedPort, originalPort);

    const line = new ShapeElement('line', 0, 0);
    line.connections = {
        p1: { elementId: tree.id, portId: 'node_2' },
        p2: null
    };
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        history: { clear() {} },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, { elements: [tree.serialize(), line.serialize()] });
    assert.deepEqual(app.elements[1].connections.p1,
        { elementId: tree.id, portId: 'node_2' });
});

test('graph and tree nearest-port queries match their rendered port positions', () => {
    const graph = new GraphElement(40, 30);
    assert.equal(graph.buildFromText('4 3\n1 2\n2 3\n3 4'), null);
    graph.rotation = 0.37;
    const graphPort = graph.getConnectionPorts()[2];
    assert.deepEqual(
        graph.findNearestConnectionPort(graphPort.x, graphPort.y, 1),
        { ...graphPort, distance: 0 }
    );
    assert.equal(graph.findNearestConnectionPort(graphPort.x, graphPort.y, 0), null);

    const tree = new TreeElement(250, 60);
    tree.treeType = 'bst';
    assert.equal(tree.buildFromText('10 10 10', 'values'), null);
    tree.rotation = -0.41;
    const treePort = tree.getConnectionPorts()[2];
    assert.deepEqual(
        tree.findNearestConnectionPort(treePort.x, treePort.y, 1),
        { ...treePort, distance: 0 }
    );
    assert.equal(tree.findNearestConnectionPort(treePort.x, treePort.y, 0), null);
});

test('base nearest-port queries match ordered ports for rotated custom bounds', () => {
    const queue = new QueueElement(120, 80);
    queue.setFromText('front back');
    queue.rotation = 0.53;
    for (const port of queue.getConnectionPorts()) {
        assert.deepEqual(
            queue.findNearestConnectionPort(port.x, port.y, 1),
            { ...port, distance: 0 }
        );
    }
});

test('resizing a graph with minimal bounds keeps node coordinates finite', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    graph.width = 40;
    graph.height = 40;
    graph.onResizeStart();
    graph.onResize(40, 40);
    for (const node of graph.nodes.values()) {
        assert.ok(Number.isFinite(node.x));
        assert.ok(Number.isFinite(node.y));
    }
});

test('repeatedly shrinking a packed graph does not distort its frame aspect ratio', () => {
    const graph = new GraphElement();
    const input = ['500 499', ...Array.from({ length: 499 }, (_, index) => `1 ${index + 2}`)].join('\n');
    assert.equal(graph.buildFromText(input), null);
    const initialAspectRatio = graph.width / graph.height;
    const app = { renderer: { markDirty() {} } };

    for (let attempt = 0; attempt < 8; attempt++) {
        const transform = new Transform(app);
        const startX = graph.x + graph.width;
        const startY = graph.y + graph.height;
        const startWidth = graph.width;
        const startHeight = graph.height;
        transform.startResize(startX, startY, 2, graph);
        for (let step = 1; step <= 4; step++) {
            transform.update(
                startX - startWidth * 0.92 * step / 4,
                startY - startHeight * 0.92 * step / 4
            );
        }
        transform.finish();
        assert.ok(graph.width < 2000 && graph.height < 2000);
        assert.ok(Math.abs(graph.width / graph.height - initialAspectRatio) < 0.08);
        assert.equal(GraphLayout.hasOverlaps(graph.nodes, graph.nodeRadius * 2 + 8), false);
    }
});

test('resize transforms release copied pen points after finish and cancel', () => {
    const pen = new PenElement();
    pen.points = Array.from({ length: 10000 }, (_, index) => ({ x: index, y: index % 17 }));
    const transform = new Transform({ renderer: { markDirty() {} } });

    transform.startResize(0, 0, 2, pen);
    assert.equal(transform.startPoints.length, 10000);
    transform.finish();
    assert.equal(transform.startPoints, null);

    transform.startResize(0, 0, 2, pen);
    assert.equal(transform.startPoints.length, 10000);
    transform.cancel();
    assert.equal(transform.startPoints, null);
});

test('rotated line endpoint hit tests and drags stay in world coordinates', () => {
    const line = new ShapeElement('arrow', 10, 20, 40, -20);
    line.rotation = Math.PI / 3;
    const originalEndpoints = [line.getEndpointWorld(0), line.getEndpointWorld(1)];
    const endpointHandle = HitTest.hitTestHandles(
        line, originalEndpoints[0].x, originalEndpoints[0].y, { zoom: 1 }
    );
    assert.deepEqual(endpointHandle, { type: 'endpoint', index: 0, cursor: 'crosshair' });

    const transform = new Transform({ renderer: { markDirty() {} } });
    transform.startEndpoint(originalEndpoints[0].x, originalEndpoints[0].y, 0, line);
    const movedEndpoint = { x: originalEndpoints[0].x + 25, y: originalEndpoints[0].y - 12 };
    transform.update(movedEndpoint.x, movedEndpoint.y);
    const actualEndpoints = [line.getEndpointWorld(0), line.getEndpointWorld(1)];
    const closeTo = (actual, expected) =>
        Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9;
    assert.ok(closeTo(actualEndpoints[0], movedEndpoint));
    assert.ok(closeTo(actualEndpoints[1], originalEndpoints[1]));
    const info = transform.finish();
    assert.deepEqual(info._worldEndpoints, originalEndpoints);

    transform.startEndpoint(actualEndpoints[1].x, actualEndpoints[1].y, 1, line);
    transform.update(actualEndpoints[1].x - 40, actualEndpoints[1].y + 15);
    transform.cancel();
    assert.ok(closeTo(line.getEndpointWorld(0), actualEndpoints[0]));
    assert.ok(closeTo(line.getEndpointWorld(1), actualEndpoints[1]));
});

test('locked elements cannot be hit, selected, moved, or deleted', () => {
    const makeElement = (id, locked, zIndex) => ({
        id, locked, hidden: false, x: 0, y: 0, width: 20, height: 20, zIndex,
        containsPoint: () => true,
        getBounds: () => ({ x: 0, y: 0, w: 20, h: 20 })
    });
    const locked = makeElement('locked', true, 2);
    const movable = makeElement('movable', false, 1);
    const app = {
        elements: [movable, locked],
        renderer: { markDirty() {} },
        layerManager: { _reindex() {} }
    };
    app.selectionManager = new SelectionManager(app);

    assert.equal(HitTest.hitTestAll(app.elements, 5, 5, { zoom: 1 }), movable);
    assert.equal(HitTest.hitTestHandles(locked, 0, 0, { zoom: 1 }), null);
    app.selectionManager.select(movable);
    app.selectionManager.select(locked);
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);
    app.selectionManager.toggleSelect(locked);
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);
    app.selectionManager.selectedElements = [movable, locked];
    app.selectionManager.startRubberBand(50, 50);
    app.selectionManager.updateRubberBand(60, 60);
    app.selectionManager.finishRubberBand(true);
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);
    app.selectionManager.selectAll();
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);

    const transform = new Transform(app);
    app.selectionManager.selectedElements = [locked];
    assert.equal(transform.startDrag(0, 0), false);
    transform.update(10, 10);
    assert.equal(locked.x, 0);
    assert.equal(locked.y, 0);

    app.selectionManager.selectedElements = [movable, locked];
    transform.startDrag(0, 0);
    transform.update(10, 5);
    assert.equal(movable.x, 10);
    assert.equal(movable.y, 5);
    assert.equal(locked.x, 0);
    assert.equal(locked.y, 0);
    assert.deepEqual(transform.finish().elements.map(item => item.el.id), ['movable']);

    app.selectionManager.selectedElements = [locked];
    assert.deepEqual(app.selectionManager.deleteSelected(), []);
    assert.deepEqual(app.elements, [movable, locked]);
});

test('layer lock state survives JSON export and import', () => {
    const source = new ShapeElement('rectangle', 10, 20, 30, 40);
    source.locked = true;
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        layerManager: { _reindex() {} },
        history: { clear() {} },
        renderer: { markDirty() {} }
    };

    Serializer.loadJSONData(app, {
        version: 1,
        elements: [source.serialize()],
        camera: { x: 0, y: 0, zoom: 1 }
    });
    assert.equal(app.elements[0].locked, true);
});

test('matrix text input preserves tab-separated empty cells and rows', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('1\t\t3\n\t\t\n4\t5\t6'), null);
    assert.equal(matrix.rows, 3);
    assert.equal(matrix.cols, 3);
    assert.deepEqual(matrix.data, [
        ['1', '', '3'],
        ['', '', ''],
        ['4', '5', '6']
    ]);
});

test('matrix dialog input preserves multiline spreadsheet cells and quoting', () => {
    const matrix = new MatrixElement();
    const input = '"first\r\nsecond"\t"say ""hi"""\r\nlast\t4\r\n';
    assert.equal(matrix.setFromText(input), null);
    const expected = [['first\nsecond', 'say "hi"'], ['last', '4']];
    assert.deepEqual(matrix.data, expected);
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, expected);
});

test('matrix tabular rows retain spaces and single-column values', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('word\ntext with spaces\t4\n\nlast\t5'), null);
    assert.deepEqual(matrix.data, [
        ['word', ''], ['text with spaces', '4'], ['', ''], ['last', '5']
    ]);
});

test('compact matrix grids keep emoji and composed Unicode characters intact', () => {
    const matrix = new MatrixElement();
    for (const character of ['😀', '👩‍💻', 'e\u0301']) {
        assert.equal(matrix.setFromText(`${character}${character}\n${character}${character}`), null);
        const expected = Array.from({ length: 2 }, () => [character, character]);
        assert.deepEqual(matrix.data, expected);
        matrix.updateTextFromData();
        assert.equal(matrix.setFromText(matrix.inputText), null);
        assert.deepEqual(matrix.data, expected);
    }
});

test('matrix text round-trips multi-character values in one-cell rows', () => {
    for (const value of ['hello', '-12', '1.5', '👩‍💻', 'e\u0301']) {
        const matrix = new MatrixElement();
        assert.equal(matrix.setFromText('3x1'), null);
        matrix.data = [[value], [value], [value]];
        matrix.updateTextFromData();
        assert.match(matrix.inputText, /^"/);
        assert.equal(matrix.setFromText(matrix.inputText), null);
        assert.deepEqual(matrix.data, [[value], [value], [value]], value);
    }
});

test('a single character fills every cell without changing the matrix size', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('1 2\n3 4'), null);
    matrix.selectedCells.add('0,1');
    matrix.highlights['0,1'] = '#56b3e6';

    assert.equal(matrix.setFromText('中'), null);
    assert.equal(matrix.rows, 2);
    assert.equal(matrix.cols, 2);
    assert.deepEqual(matrix.data, [
        ['中', '中'],
        ['中', '中']
    ]);
    assert.equal(matrix.inputText, '中');
    assert.equal(matrix.selectedCells.size, 0);
    assert.deepEqual(matrix.highlights, {});

    assert.equal(matrix.setFromText('AB'), null);
    assert.deepEqual(matrix.data, [['A', 'B']]);
});

test('a single character fills a new matrix grid', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('X'), null);
    assert.equal(matrix.rows, 3);
    assert.equal(matrix.cols, 3);
    assert.deepEqual(matrix.data, Array.from({ length: 3 }, () => ['X', 'X', 'X']));
});

test('one composed Unicode character fills a new matrix grid', () => {
    const matrix = new MatrixElement();
    const character = '👩‍💻';
    assert.equal(matrix.setFromText(character), null);
    assert.deepEqual(matrix.data, Array.from({ length: 3 }, () => Array(3).fill(character)));
});

test('a single character creates one cell when the matrix is empty', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText(''), null);
    assert.equal(matrix.setFromText('X'), null);
    assert.equal(matrix.rows, 1);
    assert.equal(matrix.cols, 1);
    assert.deepEqual(matrix.data, [['X']]);
});


test('oversized single-character fills leave the matrix unchanged', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('100x100'), null);
    const previous = matrix.data.map(row => [...row]);
    const longCharacter = 'a' + '\u0301'.repeat(120);

    assert.match(matrix.setFromText(longCharacter), /1 MB/);
    assert.equal(matrix.rows, 100);
    assert.equal(matrix.cols, 100);
    assert.deepEqual(matrix.data, previous);
});

test('single-column character fills include serialization quotes in the size limit', () => {
    const matrix = new MatrixElement();
    matrix.setFromText('200x1');
    assert.match(matrix.setFromText('a' + '\u0301'.repeat(4998)), /1 MB/);
    assert.ok(matrix.data.every(row => row[0] === ''));
    assert.equal(matrix.inputText, '200x1');
    assert.equal(matrix.setFromText('a' + '\u0301'.repeat(4996)), null);
    matrix.updateTextFromData();
    assert.equal(matrix.inputText.length, 999999);
    validateWhiteboardElement(matrix.serialize());
});

