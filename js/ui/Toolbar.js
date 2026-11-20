/**
 * Toolbar — manages tool selection from the left toolbar.
 */
const READ_ONLY_TOOLS = ['pan', 'select'];
const READ_ONLY_NOTE = '雲端白板為唯讀，僅能使用「選取」與「平移」';

export class Toolbar {
    constructor(app) {
        this.app = app;
        this.currentTool = 'select';
        this._lastReadOnlyHint = 0;
        this._init();
    }

    _isReadOnly() {
        return Boolean(this.app.cloudBoards?.isReadOnly) ||
            document.body.classList.contains('wb-cloud-readonly');
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
            if (e.defaultPrevented || e.isComposing || e.target.isContentEditable ||
                e.target.closest?.('input, textarea, select, [role="dialog"], .modal-overlay, .markdown-dialog-overlay, #settings-modal.open') ||
                this.app._pendingElementDialogElement) return;
            const map = { v: 'select', h: 'pan', r: 'rectangle', c: 'circle', l: 'line', a: 'arrow', t: 'text', m: 'markdown', p: 'pen' };
            const tool = map[e.key.toLowerCase()];
            if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) this.setTool(tool);
        });

        // CloudBoards toggles `wb-cloud-readonly` on <body>; mirror it onto the drawing tools so the
        // buttons say why they do nothing (aria-disabled + tooltip) instead of silently ignoring clicks.
        this._syncReadOnly();
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(() => this._syncReadOnly())
                .observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
    }

    _syncReadOnly() {
        const readOnly = this._isReadOnly();
        document.querySelectorAll('#toolbar .toolbar-btn[data-tool]').forEach(btn => {
            if (READ_ONLY_TOOLS.includes(btn.dataset.tool)) return;
            if (btn.dataset.baseTooltip === undefined) btn.dataset.baseTooltip = btn.dataset.tooltip || '';
            const tooltip = readOnly
                ? `${btn.dataset.baseTooltip}（${READ_ONLY_NOTE}）`
                : btn.dataset.baseTooltip;
            if (btn.dataset.tooltip !== undefined) btn.dataset.tooltip = tooltip;
            // Keep the short accessible name (no shortcut text); only add the note when read-only.
            if (btn.dataset.baseLabel === undefined) btn.dataset.baseLabel = btn.getAttribute('aria-label') || '';
            const label = btn.dataset.baseLabel;
            if (label) btn.setAttribute('aria-label', readOnly ? `${label}（${READ_ONLY_NOTE}）` : label);
            if (readOnly) btn.setAttribute('aria-disabled', 'true');
            else btn.removeAttribute('aria-disabled');
        });
    }

    setTool(tool) {
        if (this._isReadOnly() && !READ_ONLY_TOOLS.includes(tool)) {
            const now = Date.now();
            if (now - this._lastReadOnlyHint > 2500) {
                this._lastReadOnlyHint = now;
                this.app._toast?.(`${READ_ONLY_NOTE}。`);
            }
            return;
        }
        this.currentTool = tool;

        // Update button states
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
            btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool));
        });

        // Update cursor
        const canvas = document.getElementById('main-canvas');
        canvas.className = '';
        if (tool === 'pan') canvas.classList.add('panning');
        else if (['rectangle', 'circle', 'line', 'arrow', 'text', 'markdown', 'pen'].includes(tool)) canvas.classList.add('crosshair');

        this.app.propertyPanel?.update();
        this.app._updateEmptyHint?.();
        this.app.renderer.markDirty();
    }
}
