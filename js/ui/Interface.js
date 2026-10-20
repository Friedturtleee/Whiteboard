/** Labels, bounded tooltips, and collapsible panels for the canvas UI. */
export function initInterface() {
    document.querySelectorAll('[data-tooltip]').forEach(control => {
        control.setAttribute('aria-label', control.dataset.tooltip);
        control.querySelectorAll('.material-symbols-outlined').forEach(icon =>
            icon.setAttribute('aria-hidden', 'true'));
    });
    document.querySelectorAll('button[title]').forEach(button => {
        if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.title);
    });
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

    for (const [buttonId, panelId, label, expandedIcon, collapsedIcon] of [
        ['toggle-properties', 'property-panel', '屬性', 'expand_less', 'expand_more'],
        ['toggle-layers', 'layer-panel', '圖層', 'expand_more', 'expand_less']
    ]) {
        const button = document.getElementById(buttonId);
        const panel = document.getElementById(panelId);
        button?.addEventListener('click', () => {
            const collapsed = panel.classList.toggle('collapsed');
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', `${collapsed ? '展開' : '收合'}${label}`);
            button.querySelector('.material-symbols-outlined').textContent =
                collapsed ? collapsedIcon : expandedIcon;
        });
    }

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
    document.addEventListener('pointerover', e => show(e.target));
    document.addEventListener('pointerout', e => {
        if (active && !active.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('focusin', e => show(e.target));
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
}
