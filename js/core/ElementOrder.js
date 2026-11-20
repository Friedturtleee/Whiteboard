/** Most edits keep the array in paint order; copy and sort only when needed. */
export function elementsInPaintOrder(elements) {
    for (let index = 1; index < elements.length; index++) {
        if ((elements[index - 1].zIndex ?? 0) > (elements[index].zIndex ?? 0)) {
            return elements.slice().sort((first, second) => (first.zIndex ?? 0) - (second.zIndex ?? 0));
        }
    }
    return elements;
}

export function elementsInFrontOrder(elements) {
    return elementsInPaintOrder(elements).slice().reverse();
}
