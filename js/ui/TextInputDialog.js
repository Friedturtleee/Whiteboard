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
     * @param {Object} opts - { title, placeholder, defaultText, showTypeSelect, types: [{value, label}], onConfirm(text, type) }
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

        // Type selector
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

        // Additional options (e.g., directed/undirected)
        let checkboxContainer = null;
        let checkbox = null;
        if (opts.showDirectedCheckbox) {
            checkboxContainer = document.createElement('div');
            checkboxContainer.style.cssText = 'margin-bottom:8px;display:flex;align-items:center;gap:6px;';
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'dialog-directed';
            checkbox.checked = opts.directed || false;
            const cbLabel = document.createElement('label');
            cbLabel.htmlFor = 'dialog-directed';
            cbLabel.textContent = '有向圖';
            cbLabel.style.textTransform = 'none';
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(cbLabel);
            dialog.appendChild(checkboxContainer);
        }

        // Input mode selector (for tree)
        let modeSelect = null;
        if (opts.showModeSelect) {
            modeSelect = document.createElement('select');
            modeSelect.style.marginBottom = '8px';
            const modes = [
                { value: 'parent', label: '父節點格式 (N 行: 值 父值)' },
                { value: 'values', label: '數值列表 (自動建樹)' }
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

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => this.close());

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-primary';
        confirmBtn.textContent = '確認';
        confirmBtn.addEventListener('click', () => {
            const text = textarea.value;
            const type = typeSelect ? typeSelect.value : null;
            const mode = modeSelect ? modeSelect.value : null;
            const directed = checkbox ? checkbox.checked : false;
            if (opts.onConfirm) opts.onConfirm(text, type, mode, directed);
            this.close();
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(textarea);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        // ESC to close
        const escHandler = (e) => {
            if (e.key === 'Escape') { this.close(); document.removeEventListener('keydown', escHandler); }
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
