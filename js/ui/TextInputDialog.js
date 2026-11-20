import { bindModal } from './Modal.js';


/** Pull the "例：" (or translated "Example:") sample out of a multi-line placeholder (inline `例：1 2 3` or a block up to the next blank line). */
function extractExample(text) {
    const match = /(?:^|\n)(?:例|Example)[：:][ \t]*([^\n]*)\n?([\s\S]*)$/.exec(text || '');
    if (!match) return '';
    const inline = match[1].trim();
    if (inline) return inline;
    return match[2].split(/\n[ \t]*\n/)[0].replace(/\s+$/, '');
}

/**
 * TextInputDialog — modal dialog for tree/graph text input, matrix input, etc.
 */
export class TextInputDialog {
    constructor(app) {
        this.app = app;
        this._overlay = null;
        this._cancelHandler = null;
        this._previewTimer = null;
        this._flushPreview = null;
    }

    /**
     * Show a dialog for text input.
     * opts callbacks receive: (text, type, mode, directed, zeroBased, graphMode)
     */
    show(opts = {}) {
        this.cancel();
        this._element = opts.element || null;
        this.app._pendingElementDialogElement = this._element;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';

        const title = document.createElement('h3');
        title.id = 'text-input-dialog-title';
        title.textContent = opts.title || '輸入資料';
        dialog.setAttribute('aria-labelledby', title.id);

        dialog.appendChild(title);

        // Type selector (tree types)
        let typeSelect = null;
        if (opts.showTypeSelect && opts.types) {
            typeSelect = document.createElement('select');
            typeSelect.setAttribute('aria-label', '樹的類型');
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
            graphModeSelect.setAttribute('aria-label', '圖輸入格式');
            graphModeSelect.classList.add('dialog-select-tight');
            const graphModes = [
                { value: 'edge-list', label: '邊列表' },
                { value: 'adj-list',  label: '鄰接列表' }
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
        let zeroBasedWrap = null;
        if (opts.showDirectedCheckbox || opts.showZeroBasedCheckbox) {
            const cbRow = document.createElement('div');
            cbRow.className = 'dialog-check-row';

            if (opts.showDirectedCheckbox) {
                const wrap = document.createElement('div');
                wrap.className = 'dialog-check';
                checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'dialog-directed';
                checkbox.checked = opts.directed || false;
                const cbLabel = document.createElement('label');
                cbLabel.htmlFor = 'dialog-directed';
                cbLabel.textContent = '有向圖';
                wrap.appendChild(checkbox);
                wrap.appendChild(cbLabel);
                cbRow.appendChild(wrap);
            }

            if (opts.showZeroBasedCheckbox) {
                zeroBasedWrap = document.createElement('div');
                zeroBasedWrap.className = 'dialog-check';
                zeroBasedCb = document.createElement('input');
                zeroBasedCb.type = 'checkbox';
                zeroBasedCb.id = 'dialog-zerobased';
                zeroBasedCb.checked = opts.zeroBased || false;
                const cbLabel = document.createElement('label');
                cbLabel.htmlFor = 'dialog-zerobased';
                cbLabel.textContent = '0 起始編號';
                zeroBasedWrap.appendChild(zeroBasedCb);
                zeroBasedWrap.appendChild(cbLabel);
                cbRow.appendChild(zeroBasedWrap);
            }

            dialog.appendChild(cbRow);
        }

        // Input mode selector (for tree)
        let modeSelect = null;
        if (opts.showModeSelect) {
            modeSelect = document.createElement('select');
            modeSelect.setAttribute('aria-label', '樹輸入格式');
            modeSelect.classList.add('dialog-select-tight');
            const modes = [
                { value: 'auto',   label: '競程格式' },
                { value: 'rooted', label: '有根邊列表（父節點、子節點）' },
                { value: 'parent', label: '父節點陣列' },
                { value: 'edge',   label: '無標頭邊列表' },
                { value: 'values', label: '數值列表' }
            ];
            for (const m of modes) {
                const opt = document.createElement('option');
                opt.value = m.value;
                opt.textContent = m.label;
                if (m.value === opts.mode) opt.selected = true;
                modeSelect.appendChild(opt);
            }
            dialog.appendChild(modeSelect);
        }

        // The editor is a transparent textarea over a backdrop that highlights full-width spaces.
        const textareaContainer = document.createElement('div');
        textareaContainer.className = 'dialog-editor';

        const textareaBackdrop = document.createElement('div');
        textareaBackdrop.className = 'dialog-editor-backdrop';
        textareaBackdrop.setAttribute('aria-hidden', 'true');
        textareaBackdrop.dataset.noI18n = '';   // mirrors the user's text; never translate it

        const textarea = document.createElement('textarea');
        textarea.className = 'dialog-editor-input';
        textarea.setAttribute('aria-label', `${opts.title || '輸入資料'}內容`);
        textarea.maxLength = 1_000_000;
        textarea.spellcheck = false;
        textarea.wrap = 'off';
        textarea.placeholder = opts.placeholder || '請輸入資料…';
        textarea.value = opts.defaultText || '';
        const initialText = textarea.value;
        const isDirty = () => textarea.value !== initialText;

        textareaContainer.appendChild(textareaBackdrop);
        textareaContainer.appendChild(textarea);

        const updateBackdrop = () => {
            const text = textarea.value;
            // Escape HTML
            let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // Highlight full-width space
            let markedCells = 0;
            html = html.replace(/　/g, () => markedCells++ < 10000
                ? '<span class="full-space">　</span>'
                : '　');
            // Deal with trailing newlines
            if (html.endsWith('\n')) html += ' ';
            textareaBackdrop.innerHTML = html;
        };

        textarea.addEventListener('keydown', (e) => {
            if (!e.isComposing && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                if (start === end && textarea.value[start] === '　') {
                    e.preventDefault();
                    const text = textarea.value;
                    textarea.value = text.substring(0, start) + e.key + text.substring(start + 1);
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                    updateBackdrop();

                    // Fire the debounced input event so it previews immediately
                    const event = new Event('input', { bubbles: true });
                    textarea.dispatchEvent(event);
                }
            }
        });

        textarea.addEventListener('input', updateBackdrop);
        textarea.addEventListener('scroll', () => {
            textareaBackdrop.scrollTop = textarea.scrollTop;
            textareaBackdrop.scrollLeft = textarea.scrollLeft;
        });
        // Initial render
        updateBackdrop();

        const errorMessage = document.createElement('p');
        errorMessage.id = 'text-input-dialog-error';
        errorMessage.className = 'dialog-error';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.hidden = true;
        const showError = error => {
            errorMessage.textContent = typeof error === 'string' ? error : '';
            errorMessage.hidden = !errorMessage.textContent;
            textarea.setAttribute('aria-invalid', String(!errorMessage.hidden));
        };

        const _getValues = () => ({
            text:      textarea.value,
            type:      typeSelect      ? typeSelect.value      : null,
            mode:      modeSelect      ? modeSelect.value      : null,
            directed:  checkbox        ? checkbox.checked      : false,
            zeroBased: zeroBasedCb     ? zeroBasedCb.checked   : false,
            graphMode: graphModeSelect ? graphModeSelect.value : 'edge-list'
        });

        // One-line summary above the editor + the full multi-line format help in a collapsible block.
        const formatHint = document.createElement('p');
        formatHint.id = 'text-input-dialog-format-hint';
        formatHint.className = 'dialog-format-hint';

        const formatDetails = document.createElement('details');
        formatDetails.className = 'dialog-format-details';
        const formatSummary = document.createElement('summary');
        formatSummary.textContent = '格式說明';
        // A <div> (not <pre>): the i18n layer skips <pre>, and this text must be translated.
        const formatBody = document.createElement('div');
        formatBody.className = 'dialog-format-body';
        const exampleBtn = document.createElement('button');
        exampleBtn.type = 'button';
        exampleBtn.className = 'dialog-link-btn';
        exampleBtn.textContent = '填入範例';
        formatDetails.append(formatSummary, formatBody, exampleBtn);
        let exampleText = '';
        exampleBtn.addEventListener('click', () => {
            if (!exampleText) return;
            if (textarea.value.trim() && textarea.value !== exampleText && !confirm('以範例取代目前輸入的內容？')) return;
            textarea.value = exampleText;
            updateBackdrop();
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.focus();
        });

        const updatePlaceholder = () => {
            const placeholder = opts.getPlaceholder?.(_getValues()) || opts.placeholder || '請輸入資料…';
            const lines = placeholder.split('\n');
            // The first line is the always-visible hint above the editor; the textarea itself only
            // shows the remaining lines (e.g. the example). The full text lives in the collapsible help.
            textarea.placeholder = lines.slice(1).join('\n');
            formatHint.textContent = lines[0];
            formatDetails.hidden = lines.length < 2;
            formatBody.textContent = placeholder;
            exampleText = extractExample(placeholder);
            exampleBtn.hidden = !exampleText;
            if (zeroBasedWrap && Array.isArray(opts.zeroBasedModes)) {
                zeroBasedWrap.hidden = !opts.zeroBasedModes.includes(_getValues().mode);
            }
        };
        updatePlaceholder();
        textarea.setAttribute('aria-describedby', `${formatHint.id} ${errorMessage.id}`);

        // Real-time preview — debounced
        const _fireInput = () => {
            updatePlaceholder();
            showError(null);
            if (!opts.onInput) return;
            if (this._previewTimer) clearTimeout(this._previewTimer);
            this._previewTimer = setTimeout(() => {
                this._previewTimer = null;
                if (this._overlay !== overlay) return;
                const v = _getValues();
                showError(opts.onInput(v.text, v.type, v.mode, v.directed, v.zeroBased, v.graphMode));
            }, 180);
        };
        const _fireImmediate = () => {
            updatePlaceholder();
            if (this._previewTimer) clearTimeout(this._previewTimer);
            this._previewTimer = null;
            if (opts.onInput) {
                const v = _getValues();
                showError(opts.onInput(v.text, v.type, v.mode, v.directed, v.zeroBased, v.graphMode));
            }
        };
        this._flushPreview = _fireImmediate;

        textarea.addEventListener('input', _fireInput);
        if (typeSelect)      typeSelect.addEventListener('change', _fireInput);
        if (modeSelect)      modeSelect.addEventListener('change', _fireInput);
        if (graphModeSelect) graphModeSelect.addEventListener('change', _fireImmediate);
        if (checkbox)        checkbox.addEventListener('change', _fireImmediate);
        if (zeroBasedCb)     zeroBasedCb.addEventListener('change', _fireImmediate);

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        // fireCancel closes unconditionally (also used by cancel() when app.js replaces the dialog).
        const fireCancel = () => {
            if (this._overlay !== overlay) return;
            const onCancel = opts.onCancel;
            this.close();
            onCancel?.();
        };
        this._cancelHandler = fireCancel;
        // Esc / 取消 are explicit choices to dismiss, so they cancel directly; only an accidental
        // background click is protected (see the overlay click handler below).
        const requestCancel = () => {
            if (this._overlay !== overlay) return;
            fireCancel();
        };
        const fireConfirm = () => {
            if (this._overlay !== overlay) return;
            const values = _getValues();
            const error = opts.onConfirm?.(values.text, values.type, values.mode,
                values.directed, values.zeroBased, values.graphMode);
            if (typeof error === 'string' && error) {
                showError(error);
                textarea.focus();
                return;
            }
            if (error !== false && this._overlay === overlay) this.close();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', requestCancel);

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'btn-primary';
        confirmBtn.textContent = '確認';
        confirmBtn.addEventListener('click', fireConfirm);

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(formatHint);
        dialog.appendChild(formatDetails);
        dialog.appendChild(textareaContainer);
        dialog.appendChild(errorMessage);
        const hint = document.createElement('p');
        hint.className = 'dialog-keyboard-hint';
        hint.textContent = 'Ctrl/⌘+Enter 確認；Esc 取消';
        dialog.appendChild(hint);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        // A background click must neither save nor silently throw away unfinished input:
        // with edits it is ignored (the dialog nudges); without edits it just cancels.
        overlay.addEventListener('click', (e) => {
            if (e.target !== overlay) return;
            if (!isDirty()) { fireCancel(); return; }
            dialog.classList.remove('dialog-nudge');
            void dialog.offsetWidth;   // restart the animation
            dialog.classList.add('dialog-nudge');
            textarea.focus();
        });
        dialog.addEventListener('animationend', () => dialog.classList.remove('dialog-nudge'));

        document.body.appendChild(overlay);
        this._overlay = overlay;
        this._releaseModal = bindModal(dialog, {
            onCancel: requestCancel, onConfirm: fireConfirm, initialFocus: textarea
        });
    }

    close() {
        this._releaseModal?.();
        this._releaseModal = null;
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = null;
        }
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
        this._cancelHandler = null;
        this._flushPreview = null;
        this.app._clearPendingElementDialog?.(this._element);
        this._element = null;
    }

    cancel() {
        if (!this._cancelHandler) return false;
        this._cancelHandler();
        return true;
    }

    flushPreview() {
        this._flushPreview?.();
    }
}
