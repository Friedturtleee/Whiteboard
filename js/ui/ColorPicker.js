/**
 * ColorPicker — 15 preset colors + 1 custom color picker.
 */
export class ColorPicker {
    static COLORS = [
        '#b34d4d', '#b3734d', '#b39b4d', '#8a9e4d',
        '#4d8a4d', '#4d8a7a', '#4d8a9e', '#4d6eb3',
        '#4d4db3', '#6b4db3', '#8a4db3', '#b34d8a',
        '#8a6b4d', '#b0b0b0', '#e8e8e8'
    ];

    /**
     * Create an inline color picker element and attach to a container.
     * @param {HTMLElement} container
     * @param {Function} onChange - called with (color) when a swatch is clicked
     * @returns {HTMLElement} the grid element
     */
    static create(container, onChange) {
        const grid = document.createElement('div');
        grid.className = 'color-grid';

        for (const color of ColorPicker.COLORS) {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.addEventListener('click', () => {
                grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                if (onChange) onChange(color);
            });
            grid.appendChild(swatch);
        }

        // Custom color "+ " button that opens a dark popup
        const customBtn = document.createElement('div');
        customBtn.className = 'color-swatch color-swatch-custom';
        customBtn.title = '自訂顏色';
        customBtn.textContent = '+';
        customBtn.dataset.color = '#ffffff';
        customBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ColorPicker._openCustomPopup(customBtn, (c) => {
                customBtn.style.background = c;
                customBtn.style.color = ColorPicker._contrastColor(c);
                customBtn.dataset.color = c;
                grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                customBtn.classList.add('selected');
                if (onChange) onChange(c);
            });
        });
        grid.appendChild(customBtn);

        container.appendChild(grid);
        return grid;
    }

    static setActive(grid, color) {
        grid.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('selected', s.dataset.color === color);
        });
    }

    /** Returns #000 or #fff depending on background brightness */
    static _contrastColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r * 0.299 + g * 0.587 + b * 0.114) > 128 ? '#222' : '#eee';
    }

    /** Open a small dark custom-color popup near `anchor` */
    static _openCustomPopup(anchor, onApply) {
        // Remove any existing popup
        document.querySelectorAll('.custom-color-popup').forEach(p => p.remove());

        const popup = document.createElement('div');
        popup.className = 'custom-color-popup';

        // --- Hex row ---
        const hexRow = document.createElement('div');
        hexRow.className = 'ccp-row';
        const hexLabel = document.createElement('span');
        hexLabel.className = 'ccp-label';
        hexLabel.textContent = 'Hex';
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'ccp-hex';
        hexInput.placeholder = '#e0e0e0';
        hexInput.value = anchor.dataset.color || '#e0e0e0';
        hexRow.appendChild(hexLabel);
        hexRow.appendChild(hexInput);
        popup.appendChild(hexRow);

        // --- Color preview ---
        const preview = document.createElement('div');
        preview.className = 'ccp-preview';
        preview.style.background = hexInput.value;
        popup.appendChild(preview);

        // --- RGB sliders ---
        const sliders = ['R', 'G', 'B'];
        const sliderEls = {};
        for (const ch of sliders) {
            const row = document.createElement('div');
            row.className = 'ccp-row';
            const lbl = document.createElement('span');
            lbl.className = 'ccp-label';
            lbl.textContent = ch;
            const sl = document.createElement('input');
            sl.type = 'range';
            sl.min = 0; sl.max = 255; sl.step = 1;
            const val = document.createElement('span');
            val.className = 'ccp-val';
            sliderEls[ch] = { sl, val };
            row.appendChild(lbl);
            row.appendChild(sl);
            row.appendChild(val);
            popup.appendChild(row);
        }

        // Sync helpers
        const hexToRgb = (h) => {
            const c = h.replace('#', '');
            if (c.length !== 6) return null;
            return { R: parseInt(c.slice(0,2),16), G: parseInt(c.slice(2,4),16), B: parseInt(c.slice(4,6),16) };
        };
        const rgbToHex = (r, g, b) => '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');

        const applyHex = (hex) => {
            const rgb = hexToRgb(hex);
            if (!rgb) return;
            for (const ch of sliders) {
                sliderEls[ch].sl.value = rgb[ch];
                sliderEls[ch].val.textContent = rgb[ch];
            }
            preview.style.background = hex;
        };
        applyHex(hexInput.value);

        hexInput.addEventListener('input', () => {
            const v = hexInput.value.trim();
            const hex = v.startsWith('#') ? v : '#' + v;
            if (/^#[0-9a-fA-F]{6}$/.test(hex)) applyHex(hex);
        });

        for (const ch of sliders) {
            sliderEls[ch].sl.addEventListener('input', () => {
                const r = +sliderEls['R'].sl.value;
                const g = +sliderEls['G'].sl.value;
                const b = +sliderEls['B'].sl.value;
                sliderEls[ch].val.textContent = sliderEls[ch].sl.value;
                const hex = rgbToHex(r, g, b);
                hexInput.value = hex;
                preview.style.background = hex;
            });
        }

        // --- Apply button ---
        const applyBtn = document.createElement('button');
        applyBtn.className = 'ccp-apply';
        applyBtn.textContent = '套用';
        applyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onApply(hexInput.value);
            popup.remove();
        });
        popup.appendChild(applyBtn);

        // Position popup near anchor
        const rect = anchor.getBoundingClientRect();
        popup.style.top = (rect.bottom + 6) + 'px';
        popup.style.left = Math.max(4, rect.left - 120) + 'px';

        document.body.appendChild(popup);

        // Adjust if it goes off the right edge of the screen
        const popupRect = popup.getBoundingClientRect();
        if (popupRect.right > window.innerWidth - 10) {
            popup.style.left = (window.innerWidth - popupRect.width - 10) + 'px';
        }

        // Close on outside click
        const close = (e) => {
            if (!popup.contains(e.target) && e.target !== anchor) {
                popup.remove();
                document.removeEventListener('mousedown', close);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', close), 0);
    }
}
