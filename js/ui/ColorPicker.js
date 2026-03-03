/**
 * ColorPicker — simple 16-color picker used inline.
 * (Used by PropertyPanel; this module provides standalone picker if needed.)
 */
export class ColorPicker {
    static COLORS = [
        '#b34d4d', '#b3734d', '#b39b4d', '#8a9e4d',
        '#4d8a4d', '#4d8a7a', '#4d8a9e', '#4d6eb3',
        '#4d4db3', '#6b4db3', '#8a4db3', '#b34d8a',
        '#b34d6b', '#8a6b4d', '#b0b0b0', '#e8e8e8'
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

        container.appendChild(grid);
        return grid;
    }

    static setActive(grid, color) {
        grid.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('selected', s.dataset.color === color);
        });
    }
}
