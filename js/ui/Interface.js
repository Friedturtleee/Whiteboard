import { bindModal } from './Modal.js';

/** Real shortcuts (see Toolbar.js and app.js _bindKeyboard). "Mod" = Ctrl on Windows/Linux, ⌘ on macOS. */
const SHORTCUT_GROUPS = [
    { title: '工具', items: [
        ['選取', ['V']], ['平移（按住 Space 暫時平移）', ['H']], ['矩形', ['R']], ['圓形', ['C']],
        ['線段', ['L']], ['箭頭', ['A']], ['文字', ['T']], ['Markdown', ['M']], ['畫筆', ['P']]
    ] },
    { title: '編輯', items: [
        ['復原', ['Mod', 'Z']], ['取消復原', ['Mod', 'Shift', 'Z']], ['取消復原（替代）', ['Mod', 'Y']],
        ['複製／剪下／貼上物件', ['Mod', 'C / X / V']], ['建立副本', ['Mod', 'D']], ['全選', ['Mod', 'A']],
        ['刪除選取', ['Delete']], ['取消目前操作並回到選取', ['Esc']]
    ] },
    { title: '檢視與檔案', items: [
        ['放大／縮小', ['Mod', '= / -']], ['顯示全部', ['Shift', '1']], ['顯示選取物件', ['Shift', '2']],
        ['匯出 JSON', ['Mod', 'S']], ['顯示此說明', ['?']]
    ] },
    { title: '矩陣儲存格', items: [
        ['移動選取格', ['方向鍵 / Tab']], ['擴大選取範圍', ['Shift', '方向鍵']], ['編輯儲存格', ['Enter / F2']],
        ['複製／剪下／貼上格子', ['Mod', 'C / X / V']]
    ] },
    { title: '對話框', items: [
        ['確認', ['Mod', 'Enter']], ['取消', ['Esc']]
    ] }
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

function buildShortcutsDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog shortcuts-dialog';
    const title = document.createElement('h3');
    title.id = 'shortcuts-dialog-title';
    title.textContent = '快捷鍵';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.appendChild(title);

    for (const group of SHORTCUT_GROUPS) {
        const section = document.createElement('section');
        section.className = 'shortcuts-group';
        const heading = document.createElement('h4');
        heading.textContent = group.title;
        const list = document.createElement('dl');
        list.className = 'shortcuts-list';
        for (const [label, keys] of group.items) {
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            keys.forEach((key, index) => {
                if (index) dd.append(' + ');
                const kbd = document.createElement('kbd');
                kbd.textContent = key === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : key;
                // Physical key caps ("Delete", "Esc"...) must not be run through the translator.
                if (!/[^\x20-\x7e]/.test(kbd.textContent)) kbd.dataset.noI18n = '';
                dd.appendChild(kbd);
            });
            list.append(dt, dd);
        }
        section.append(heading, list);
        dialog.appendChild(section);
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-primary';
    close.textContent = '關閉';
    actions.appendChild(close);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    return { overlay, dialog, close };
}

let closeShortcuts = null;
/** Open (or toggle closed) the keyboard-shortcut overlay. */
export function toggleShortcutsDialog() {
    if (closeShortcuts) { closeShortcuts(); return; }
    const { overlay, dialog, close } = buildShortcutsDialog();
    document.body.appendChild(overlay);
    let release = null;
    const dismiss = () => {
        release?.();
        release = null;
        overlay.remove();
        closeShortcuts = null;
    };
    closeShortcuts = dismiss;
    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
    release = bindModal(dialog, { onCancel: dismiss, onConfirm: dismiss, initialFocus: close });
}

/** Labels, bounded tooltips, and collapsible panels for the canvas UI. */
export function labelTooltipControls(root) {
    root.querySelectorAll('[data-tooltip]').forEach(control => {
        if (!control.getAttribute('aria-label')?.trim()) control.setAttribute('aria-label', control.dataset.tooltip);
        control.querySelectorAll('.material-symbols-outlined').forEach(icon =>
            icon.setAttribute('aria-hidden', 'true'));
    });
    root.querySelectorAll('button[title]').forEach(button => {
        if (!button.getAttribute('aria-label')?.trim()) button.setAttribute('aria-label', button.title);
    });
}

/** Labels, bounded tooltips, number steppers, shortcut help and collapsible panels for the canvas UI. */
export function initInterface() {
    labelTooltipControls(document);
    document.querySelectorAll('button .material-symbols-outlined').forEach(icon =>
        icon.setAttribute('aria-hidden', 'true'));
    const fields = { 'prop-x': 'X 位置', 'prop-y': 'Y 位置', 'prop-w': '寬度',
        'prop-h': '高度', 'prop-rot': '旋轉角度' };
    for (const [id, label] of Object.entries(fields)) {
        const input = document.getElementById(id);
        input?.setAttribute('aria-label', label);
        input?.closest('.num-field')?.querySelectorAll('.num-spinners button').forEach((button, index) => {
            button.type = 'button';
            button.setAttribute('aria-label', `${index ? '減少' : '增加'}${label}`);
        });
    }
    document.querySelectorAll('.toolbar-btn').forEach(button =>
        button.setAttribute('aria-pressed', String(button.classList.contains('active'))));

    // Number steppers: one delegated handler instead of inline onclick attributes. The synthetic
    // `change` makes PropertyPanel commit an undo entry for each click, like a typed value would.
    document.addEventListener('click', event => {
        const step = event.target.closest?.('.num-step');
        if (!step) return;
        const input = step.closest('.num-field')?.querySelector('input');
        if (!input || input.disabled || input.readOnly) return;
        if (step.dataset.step === 'down') input.stepDown(); else input.stepUp();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Collapsible panels. On phones the panels are a bottom drawer, so start collapsed to keep the board visible.
    const compact = window.matchMedia?.('(max-width: 760px)').matches ?? false;
    for (const [buttonId, panelId, label, expandedIcon, collapsedIcon] of [
        ['toggle-properties', 'property-panel', '屬性', 'expand_less', 'expand_more'],
        ['toggle-layers', 'layer-panel', '圖層', 'expand_more', 'expand_less']
    ]) {
        const button = document.getElementById(buttonId);
        const panel = document.getElementById(panelId);
        if (!button || !panel) continue;
        const setCollapsed = collapsed => {
            panel.classList.toggle('collapsed', collapsed);
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', `${collapsed ? '展開' : '收合'}${label}`);
            button.querySelector('.material-symbols-outlined').textContent =
                collapsed ? collapsedIcon : expandedIcon;
        };
        button.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
        // The whole header bar is a tap target (the chevron alone is small on a phone).
        panel.querySelector('.property-panel-header, .layer-panel-header')?.addEventListener('click', event => {
            if (!event.target.closest('button')) button.click();
        });
        if (compact) setCollapsed(true);
    }

    // Keyboard shortcut help: "?" button and the "?" key.
    document.getElementById('btn-shortcuts')?.addEventListener('click', toggleShortcutsDialog);
    document.addEventListener('keydown', event => {
        if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.defaultPrevented || event.isComposing || event.target.isContentEditable ||
            event.target.closest?.('input, textarea, select, [role="dialog"], .modal-overlay, .markdown-dialog-overlay, #settings-modal.open')) return;
        event.preventDefault();
        toggleShortcutsDialog();
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    let active = null;
    const hide = () => { active = null; tooltip.hidden = true; };
    const show = target => {
        const control = target.closest?.('[data-tooltip]');
        if (!control || control.disabled) return;
        active = control;
        tooltip.textContent = control.dataset.tooltip;
        tooltip.hidden = false;
        const rect = control.getBoundingClientRect();
        const box = tooltip.getBoundingClientRect();
        const beside = control.closest('#toolbar');
        let x = beside ? rect.right + 8 : rect.x + (rect.width - box.width) / 2;
        let y = beside ? rect.y + (rect.height - box.height) / 2 : rect.bottom + 8;
        if (y + box.height > innerHeight - 8) y = rect.top - box.height - 8;
        tooltip.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, x))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(innerHeight - box.height - 8, y))}px`;
    };
    // Touch has no hover: a long-press would otherwise leave a stuck tooltip behind.
    document.addEventListener('pointerover', e => { if (e.pointerType !== 'touch') show(e.target); });
    document.addEventListener('pointerout', e => {
        if (active && !active.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('focusin', e => show(e.target));
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
}
