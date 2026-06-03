/**
 * TextInputDialog — modal dialog for tree/graph text input, matrix input, etc.
 */
export class TextInputDialog {
    constructor(app) {
        this.app = app;
        this._overlay = null;
    }

    /**
     * Show a dialog for text input.
     * opts callbacks receive: (text, type, mode, directed, zeroBased, graphMode)
     */
    show(opts = {}) {
        this.close();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';

        const title = document.createElement('h3');
        title.textContent = opts.title || '輸入資料';

        dialog.appendChild(title);

        // Type selector (tree types)
        let typeSelect = null;
        if (opts.showTypeSelect && opts.types) {
            typeSelect = document.createElement('select');
            for (const t of opts.types) {
                const opt = document.createElement('option');
                opt.value = t.value;
                opt.textContent = t.label;
                if (t.selected) opt.selected = true;
                typeSelect.appendChild(opt);
            }
            dialog.appendChild(typeSelect);
        }

        // Graph mode selector (edge-list vs adj-list)
        let graphModeSelect = null;
        if (opts.showGraphModeSelect) {
            graphModeSelect = document.createElement('select');
            graphModeSelect.style.marginBottom = '8px';
            const graphModes = [
                { value: 'edge-list', label: '邊列表 (N M, 再列 edges)' },
                { value: 'adj-list',  label: '鄰接列表 (N, 再 N 行 M neighbors)' }
            ];
            for (const m of graphModes) {
                const opt = document.createElement('option');
                opt.value = m.value;
                opt.textContent = m.label;
                if (m.value === opts.graphMode) opt.selected = true;
                graphModeSelect.appendChild(opt);
            }
            dialog.appendChild(graphModeSelect);
        }

        // Checkboxes row (directed + 0-based)
        let checkbox = null;       // directed
        let zeroBasedCb = null;    // 0-based
        if (opts.showDirectedCheckbox || opts.showZeroBasedCheckbox) {
            const cbRow = document.createElement('div');
            cbRow.style.cssText = 'margin-bottom:8px;display:flex;align-items:center;gap:14px;';

            if (opts.showDirectedCheckbox) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
                checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'dialog-directed';
                checkbox.checked = opts.directed || false;
                const cbLabel = document.createElement('label');
                cbLabel.htmlFor = 'dialog-directed';
                cbLabel.textContent = '有向圖';
                cbLabel.style.textTransform = 'none';
                wrap.appendChild(checkbox);
                wrap.appendChild(cbLabel);
                cbRow.appendChild(wrap);
            }

            if (opts.showZeroBasedCheckbox) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
                zeroBasedCb = document.createElement('input');
                zeroBasedCb.type = 'checkbox';
                zeroBasedCb.id = 'dialog-zerobased';
                zeroBasedCb.checked = opts.zeroBased || false;
                const cbLabel = document.createElement('label');
                cbLabel.htmlFor = 'dialog-zerobased';
                cbLabel.textContent = '0-based';
                cbLabel.style.textTransform = 'none';
                wrap.appendChild(zeroBasedCb);
                wrap.appendChild(cbLabel);
                cbRow.appendChild(wrap);
            }

            dialog.appendChild(cbRow);
        }

        // Input mode selector (for tree)
        let modeSelect = null;
        if (opts.showModeSelect) {
            modeSelect = document.createElement('select');
            modeSelect.style.marginBottom = '8px';
            const modes = [
                { value: 'auto',   label: '自動偵測格式' },
                { value: 'edge',   label: '邊列表 (每行: 父 子)' },
                { value: 'values', label: '層序數值列表 (自動建樹)' }
            ];
            for (const m of modes) {
                const opt = document.createElement('option');
                opt.value = m.value;
                opt.textContent = m.label;
                modeSelect.appendChild(opt);
            }
            dialog.appendChild(modeSelect);
        }

        const textarea = document.createElement('textarea');
        textarea.placeholder = opts.placeholder || '在此輸入...';
        textarea.value = opts.defaultText || '';

        const _getValues = () => ({
            text:      textarea.value,
            type:      typeSelect      ? typeSelect.value      : null,
            mode:      modeSelect      ? modeSelect.value      : null,
            directed:  checkbox        ? checkbox.checked      : false,
            zeroBased: zeroBasedCb     ? zeroBasedCb.checked   : false,
            graphMode: graphModeSelect ? graphModeSelect.value : 'edge-list'
        });

        // Real-time preview — debounced
        let _previewTimer = null;
        const _fireInput = () => {
            if (!opts.onInput) return;
            if (_previewTimer) clearTimeout(_previewTimer);
            _previewTimer = setTimeout(() => {
                const v = _getValues();
                opts.onInput(v.text, v.type, v.mode, v.directed, v.zeroBased, v.graphMode);
            }, 180);
        };
        const _fireImmediate = () => {
            if (_previewTimer) clearTimeout(_previewTimer);
            if (opts.onInput) {
                const v = _getValues();
                opts.onInput(v.text, v.type, v.mode, v.directed, v.zeroBased, v.graphMode);
            }
        };

        textarea.addEventListener('input', _fireInput);
        if (typeSelect)      typeSelect.addEventListener('change', _fireInput);
        if (modeSelect)      modeSelect.addEventListener('change', _fireInput);
        if (graphModeSelect) graphModeSelect.addEventListener('change', _fireImmediate);
        if (checkbox)        checkbox.addEventListener('change', _fireImmediate);
        if (zeroBasedCb)     zeroBasedCb.addEventListener('change', _fireImmediate);

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const fireCancel = () => {
            if (opts.onCancel) opts.onCancel();
            this.close();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', fireCancel);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-primary';
        confirmBtn.textContent = '確認';
        confirmBtn.addEventListener('click', () => {
            const v = _getValues();
            if (opts.onConfirm) opts.onConfirm(v.text, v.type, v.mode, v.directed, v.zeroBased, v.graphMode);
            this.close();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(textarea);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) fireCancel();
        });

        // ESC to close
        const escHandler = (e) => {
            if (e.key === 'Escape') { 
                fireCancel(); 
                document.removeEventListener('keydown', escHandler); 
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(overlay);
        this._overlay = overlay;
        textarea.focus();
    }

    close() {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
    }
}
