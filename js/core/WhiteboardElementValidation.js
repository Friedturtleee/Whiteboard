const MAX_IMPORTED_TEXT_LENGTH = 1_000_000;
const MAX_IMPORTED_SVG_LENGTH = 2_000_000;
const MAX_IMPORTED_PEN_POINTS = 100_000;
const MAX_WORLD_COORDINATE = 100_000_000;
const MAX_ELEMENT_DIMENSION = 10_000_000;

function isSafeDisplayValue(value) {
    return value === null || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= MAX_IMPORTED_TEXT_LENGTH);
}

function isValidGraphId(value) {
    return (typeof value === 'string' && value.length > 0 && value.length <= 128) ||
        (typeof value === 'number' && Number.isSafeInteger(value));
}

function isValidHighlightMap(value, keyPattern = /^[\w,-]{1,32}$/) {
    if (value === undefined) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length <= 10000 && entries.every(([key, color]) =>
        keyPattern.test(key) && typeof color === 'string' && color.length <= 256);
}

function isValidTreeOverrideMap(value, kind, hasSource) {
    if (value === undefined) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    if (entries.length && !hasSource) return false;
    if (entries.length > 2000) return false;
    return entries.every(([path, item]) => {
        if (path.length > 12000 || !(kind === 'edge'
            ? /^r(?:\.\d+)+$/.test(path)
            : /^r(?:\.\d+)*$/.test(path))) return false;
        if (kind === 'node') {
            return typeof item === 'string'
                ? item.length <= MAX_IMPORTED_TEXT_LENGTH
                : typeof item === 'number' && Number.isFinite(item);
        }
        if (item === null) return true;
        if (typeof item === 'number') return Number.isFinite(item);
        return typeof item === 'string' && item.length <= MAX_IMPORTED_TEXT_LENGTH &&
            (item === '' || Number.isFinite(Number(item)));
    });
}

/** Pure element-data validation shared by JSON import and the collaboration server. */
export function validateWhiteboardElement(ed) {
    if (!ed || typeof ed !== 'object' || Array.isArray(ed) || typeof ed.type !== 'string' ||
        ![ed.x, ed.y, ed.width, ed.height].every(Number.isFinite)) {
        throw new TypeError('Whiteboard element has invalid fields or bounds.');
    }
    const signedLineBounds = ed.type === 'line' || ed.type === 'arrow';
    if (Math.abs(ed.x) > MAX_WORLD_COORDINATE || Math.abs(ed.y) > MAX_WORLD_COORDINATE ||
        Math.abs(ed.x + ed.width) > MAX_WORLD_COORDINATE ||
        Math.abs(ed.y + ed.height) > MAX_WORLD_COORDINATE ||
        (!signedLineBounds && (ed.width < 0 || ed.height < 0)) ||
        Math.abs(ed.width) > MAX_ELEMENT_DIMENSION || Math.abs(ed.height) > MAX_ELEMENT_DIMENSION) {
        throw new TypeError('Whiteboard element bounds are outside the supported range.');
    }
    for (const field of ['rotation', 'opacity', 'saturation', 'strokeWidth', 'zIndex']) {
        if (ed[field] !== undefined && !Number.isFinite(ed[field])) {
            throw new TypeError('Whiteboard element contains invalid style values.');
        }
    }
    if ((ed.opacity !== undefined && (ed.opacity < 0 || ed.opacity > 1)) ||
        (ed.saturation !== undefined && (ed.saturation < 0 || ed.saturation > 1)) ||
        (ed.strokeWidth !== undefined && (ed.strokeWidth < 0 || ed.strokeWidth > 10000)) ||
        ['color', 'fillColor'].some(field => ed[field] !== undefined &&
            (typeof ed[field] !== 'string' || ed[field].length > 256)) ||
        (ed.label !== undefined && (typeof ed.label !== 'string' || ed.label.length > 1024)) ||
        ['hidden', 'locked'].some(field => ed[field] !== undefined && typeof ed[field] !== 'boolean')) {
        throw new TypeError('Whiteboard element contains invalid style values.');
    }
    if (ed.id !== undefined && (typeof ed.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(ed.id))) {
        throw new TypeError('Whiteboard element contains an invalid ID.');
    }

    if (['rectangle', 'circle', 'ellipse', 'line', 'arrow'].includes(ed.type)) {
        const validConnection = connection => connection === null ||
            Boolean(connection && typeof connection === 'object' && !Array.isArray(connection) &&
                typeof connection.elementId === 'string' && typeof connection.portId === 'string');
        if ((ed.shapeType !== undefined && ed.shapeType !== ed.type) ||
            (ed.drawStyle !== undefined && !['stroke', 'fill', 'dashed'].includes(ed.drawStyle)) ||
            (ed.connections !== undefined && (!ed.connections || typeof ed.connections !== 'object' ||
                Array.isArray(ed.connections) || !validConnection(ed.connections.p1) ||
                !validConnection(ed.connections.p2)))) {
            throw new TypeError('Shape element contains invalid shape or connection data.');
        }
    } else if (ed.type === 'matrix') {
        const { rows, cols, data: cells } = ed;
        if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) ||
            rows < 0 || cols < 0 || rows > 200 || cols > 200 || rows * cols > 10000 ||
            ((rows === 0) !== (cols === 0)) || !Array.isArray(cells) || cells.length !== rows ||
            cells.some(row => !Array.isArray(row) || row.length !== cols ||
                row.some(value => !isSafeDisplayValue(value))) ||
            (ed.inputText !== undefined &&
                (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
            (ed.cellSize !== undefined && (!Number.isFinite(ed.cellSize) || ed.cellSize <= 0 || ed.cellSize > 10000)) ||
            (ed.fontSize !== undefined && (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
            !isValidHighlightMap(ed.highlights, /^\d+,\d+$/)) {
            throw new TypeError('Matrix element has invalid dimensions or cell data.');
        }
    } else if (ed.type === 'queue' || ed.type === 'stack') {
        if (!Array.isArray(ed.items) || ed.items.length > 10000 ||
            ed.items.some(value => !isSafeDisplayValue(value)) ||
            (ed.inputText !== undefined &&
                (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
            (ed.type === 'queue' && ed.cellWidth !== undefined &&
                (!Number.isFinite(ed.cellWidth) || ed.cellWidth <= 0 || ed.cellWidth > 10000)) ||
            (ed.type === 'stack' && ed.cellHeight !== undefined &&
                (!Number.isFinite(ed.cellHeight) || ed.cellHeight <= 0 || ed.cellHeight > 10000)) ||
            (ed.fontSize !== undefined && (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
            (ed.maxDisplay !== undefined && (!Number.isSafeInteger(ed.maxDisplay) || ed.maxDisplay < 1 || ed.maxDisplay > 100)) ||
            !isValidHighlightMap(ed.highlights)) {
            throw new TypeError('Array element has invalid or oversized item data.');
        }
    } else if (ed.type === 'pen') {
        if (!Array.isArray(ed.points) || ed.points.length > MAX_IMPORTED_PEN_POINTS || ed.points.some(point =>
            !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
            Math.abs(point.x) > MAX_WORLD_COORDINATE || Math.abs(point.y) > MAX_WORLD_COORDINATE)) {
            throw new TypeError('Pen element contains invalid point data or exceeds the supported point limit.');
        }
        if (ed.points.length) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const point of ed.points) {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            }
            if (maxX - minX > MAX_ELEMENT_DIMENSION || maxY - minY > MAX_ELEMENT_DIMENSION) {
                throw new TypeError('Pen element bounds are outside the supported range.');
            }
        }
    } else if (ed.type === 'graph') {
        if (!Array.isArray(ed.graphNodes) || ed.graphNodes.length > 500 ||
            !Array.isArray(ed.edges) || ed.edges.length > 100000 ||
            (ed.inputText !== undefined &&
                (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
            (ed.directed !== undefined && typeof ed.directed !== 'boolean') ||
            (ed.zeroBased !== undefined && typeof ed.zeroBased !== 'boolean') ||
            (ed.graphMode !== undefined && !['edge-list', 'adj-list'].includes(ed.graphMode)) ||
            (ed.nodeRadius !== undefined &&
                (!Number.isFinite(ed.nodeRadius) || ed.nodeRadius <= 0 || ed.nodeRadius > 10000)) ||
            (ed._nextNodeId !== undefined && (!Number.isSafeInteger(ed._nextNodeId) || ed._nextNodeId < 1))) {
            throw new TypeError('Graph element has invalid or oversized node/edge data.');
        }
        const nodeIds = new Set();
        for (const node of ed.graphNodes) {
            if (!node || !isValidGraphId(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
                Math.abs(node.x) > MAX_WORLD_COORDINATE || Math.abs(node.y) > MAX_WORLD_COORDINATE ||
                (node.label !== undefined && !isSafeDisplayValue(node.label)) ||
                (node.nodeWeight !== undefined && node.nodeWeight !== null && !isSafeDisplayValue(node.nodeWeight)) ||
                nodeIds.has(String(node.id))) {
                throw new TypeError('Graph element contains an invalid node.');
            }
            nodeIds.add(String(node.id));
        }
        for (const edge of ed.edges) {
            if (!edge || !isValidGraphId(edge.u) || !isValidGraphId(edge.v) ||
                !nodeIds.has(String(edge.u)) || !nodeIds.has(String(edge.v)) ||
                (edge.w !== undefined && !isSafeDisplayValue(edge.w)) ||
                (edge.directed !== undefined && typeof edge.directed !== 'boolean')) {
                throw new TypeError('Graph element contains an edge with an unknown endpoint.');
            }
        }
    } else if (ed.type === 'tree') {
        if (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH ||
            (ed.treeType !== undefined && !['tree', 'binary', 'bst', 'avl', 'rb', 'red-black', 'euler'].includes(ed.treeType)) ||
            (ed.nodeRadius !== undefined && (!Number.isFinite(ed.nodeRadius) || ed.nodeRadius <= 0 || ed.nodeRadius > 10000)) ||
            (ed.hasWeights !== undefined && typeof ed.hasWeights !== 'boolean') ||
            ['_relOffsetX', '_relOffsetY'].some(field => ed[field] !== undefined &&
                (!Number.isFinite(ed[field]) || Math.abs(ed[field]) > MAX_WORLD_COORDINATE)) ||
            !isValidTreeOverrideMap(ed.nodeValueOverrides, 'node', Boolean(ed.inputText)) ||
            !isValidTreeOverrideMap(ed.edgeWeightOverrides, 'edge', Boolean(ed.inputText))) {
            throw new TypeError('Tree element has invalid or oversized source data.');
        }
    } else if (ed.type === 'text') {
        if ((ed.text !== undefined && (typeof ed.text !== 'string' || ed.text.length > MAX_IMPORTED_TEXT_LENGTH)) ||
            (ed.fontSize !== undefined && (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
            (ed.fontFamily !== undefined && (typeof ed.fontFamily !== 'string' || ed.fontFamily.length > 256)) ||
            (ed.textAlign !== undefined && !['left', 'center', 'right'].includes(ed.textAlign)) ||
            ['isBold', 'isItalic', 'isUnderline'].some(field => ed[field] !== undefined && typeof ed[field] !== 'boolean') ||
            ['baseWidth', 'baseHeight', '_baseWidth', '_baseHeight'].some(field =>
                ed[field] !== undefined && (!Number.isFinite(ed[field]) ||
                    ed[field] <= 0 || ed[field] > MAX_ELEMENT_DIMENSION))) {
            throw new TypeError('Text element contains invalid or oversized text/style data.');
        }
    } else if (ed.type === 'markdown') {
        if ((ed.markdownText !== undefined &&
                (typeof ed.markdownText !== 'string' || ed.markdownText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
            (ed.fontSize !== undefined && (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
            (ed.renderWidth !== undefined && (!Number.isFinite(ed.renderWidth) || ed.renderWidth <= 0 || ed.renderWidth > 10000))) {
            throw new TypeError('Markdown element contains invalid or oversized source/style data.');
        }
    } else if (ed.type === 'mermaid' && ed.svgString !== undefined &&
        (typeof ed.svgString !== 'string' || ed.svgString.length > MAX_IMPORTED_SVG_LENGTH)) {
        throw new TypeError('Mermaid element contains invalid or oversized SVG data.');
    } else if (!['rectangle', 'circle', 'ellipse', 'line', 'arrow', 'matrix', 'queue', 'stack', 'pen', 'graph', 'tree', 'text', 'markdown', 'mermaid'].includes(ed.type)) {
        throw new TypeError(`Unsupported whiteboard element type: ${ed.type}`);
    }
    return true;
}
