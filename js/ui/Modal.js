/** Keep keyboard focus and shortcuts inside an open modal. */
export function bindModal(dialog, { onCancel, onConfirm, initialFocus } = {}) {
    const overlay = dialog.parentElement;
    const previousFocus = document.activeElement;
    const siblings = [...document.body.children]
        .filter(element => element !== overlay && !element.contains(dialog))
        .map(element => ({ element, inert: element.inert }));
    for (const { element } of siblings) element.inert = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    const controls = () => [...dialog.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
    )].filter(element => !element.hidden && element.getClientRects().length);
    const focusFirst = () => (initialFocus?.isConnected ? initialFocus : controls()[0] || dialog)
        .focus({ preventScroll: true });
    const onKey = event => {
        if (event.isComposing) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && onConfirm) {
            event.preventDefault();
            event.stopPropagation();
            onConfirm();
        } else if (event.key === 'Tab') {
            if (!event.shiftKey && event.target.matches('textarea[data-tab-indent]')) return;
            const items = controls();
            const first = items[0] || dialog;
            const last = items.at(-1) || dialog;
            if ((event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) ||
                (!event.shiftKey && document.activeElement === last) || !dialog.contains(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        }
    };
    const onFocus = event => { if (!dialog.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus, true);
    focusFirst();
    return () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('focusin', onFocus, true);
        for (const { element, inert } of siblings) element.inert = inert;
        if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) {
            previousFocus.focus({ preventScroll: true });
        }
    };
}
