/**
 * Split data-structure input while preserving each ideographic space as an
 * intentional empty-cell token. ASCII whitespace and commas are separators.
 */
export function splitDataTokens(text, { multiline = false } = {}) {
    const tokens = [];
    let token = '';
    const flush = () => {
        if (token) tokens.push(token);
        token = '';
    };

    for (const char of String(text ?? '')) {
        if (char === '\u3000') {
            flush();
            tokens.push('');
        } else if (char === ' ' || char === '\t' || char === ',' ||
            (multiline && (char === '\n' || char === '\r'))) {
            flush();
        } else {
            token += char;
        }
    }
    flush();
    return tokens;
}
