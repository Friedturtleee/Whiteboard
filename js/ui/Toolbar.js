/**
 * Toolbar — manages tool selection from the left toolbar.
 */
export class Toolbar {
    constructor(app) {
        this.app = app;
        this.currentTool = 'select';
        this._init();
    }

    _init() {
        const toolbar = document.getElementById('toolbar');
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.toolbar-btn');
            if (!btn) return;
            const tool = btn.dataset.tool;
            if (tool) this.setTool(tool);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            const map = { v: 'select', h: 'pan', r: 'rectangle', c: 'circle', l: 'line', a: 'arrow', t: 'text' };
            const tool = map[e.key.toLowerCase()];
            if (tool && !e.ctrlKey && !e.metaKey) this.setTool(tool);
        });
    }

    setTool(tool) {
        this.currentTool = tool;

        // Update button states
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        // Update cursor
        const canvas = document.getElementById('main-canvas');
        canvas.className = '';
        if (tool === 'pan') canvas.classList.add('panning');
        else if (['rectangle', 'circle', 'line', 'arrow', 'text'].includes(tool)) canvas.classList.add('crosshair');

        this.app.renderer.markDirty();
    }
}
