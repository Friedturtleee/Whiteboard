/**
 * Split data-structure input while preserving each ideographic space as an
 * intentional empty-cell token. ASCII whitespace and commas separate tokens;
 * JSON-quoted strings may contain those delimiters.
 */
export function splitDataTokens(text, { multiline = false } = {}) {
    const tokens = [];
    let token = '';
    let quoted = false;
    let inQuotes = false;
    let escaped = false;
    const flush = () => {
        if (token) {
            if (quoted) {
                try {
                    const value = JSON.parse(token);
                    tokens.push(typeof value === 'string' ? value : token);
                } catch {
                    tokens.push(token);
                }
            } else {
                tokens.push(token);
            }
        }
        token = '';
        quoted = false;
    };

    for (const char of String(text ?? '')) {
        if (inQuotes) {
            token += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inQuotes = false;
        } else if (char === '"' && token === '') {
            token = char;
            quoted = true;
            inQuotes = true;
        } else if (char === '\u3000') {
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

/** Encode one data value so values containing delimiters can survive editing. */
export function formatDataToken(value) {
    if (value == null || value === '' || value === '\u3000') return '\u3000';
    const text = String(value);
    return /[\s,"\u3000]/u.test(text) ? JSON.stringify(text) : text;
}

/** Read CP whitespace input or tabular clipboard text, retaining empty cells. */
export function parsePastedMatrixRows(text) {
    const input = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!input.includes('\t')) return input.split('\n').map(row => splitDataTokens(row));
    const rows = [], row = [];
    let field = '', quoted = false, escaped = false;
    const flush = () => {
        let value = field;
        if (field.startsWith('"') && field.endsWith('"')) {
            try { value = JSON.parse(field); }
            catch { value = field.slice(1, -1).replace(/""/g, '"'); }
        }
        row.push(value === '\u3000' ? '' : value);
        field = ''; escaped = false;
    };
    for (const char of input) {
        if (!quoted && (char === '\t' || char === '\n')) {
            flush();
            if (char === '\n') { rows.push(row.splice(0)); }
            continue;
        }
        if (char === '"' && !escaped && (quoted || field === '' ||
            (field.startsWith('"') && field.endsWith('"')))) quoted = !quoted;
        field += char;
        escaped = char === '\\' && !escaped;
    }
    flush(); rows.push(row);
    return rows;
}
