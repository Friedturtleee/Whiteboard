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
    const input = String(text ?? '').replace(/\r\n?/g, '\n');
    if (!input) return [[]];
    const records = [], row = [];
    let tabular = false;
    let field = '', quoted = false, escaped = false;
    const flush = () => {
        row.push(field);
        field = ''; escaped = false;
    };
    for (const char of input) {
        if (!quoted && (char === '\t' || char === '\n')) {
            flush();
            if (char === '\t') tabular = true;
            else records.push(row.splice(0));
            continue;
        }
        if (char === '"' && !escaped && (quoted || field === '' ||
            (field.startsWith('"') && field.endsWith('"')))) quoted = !quoted;
        field += char;
        escaped = char === '\\' && !escaped;
    }
    // A final record separator terminates the last row. Additional separators
    // represent real empty rows and must survive spreadsheet paste.
    if (field || row.length || !input.endsWith('\n') || quoted) {
        flush();
        records.push(row);
    }
    const decode = value => {
        if (value.startsWith('"') && value.endsWith('"')) {
            try {
                const parsed = JSON.parse(value);
                if (typeof parsed === 'string') return parsed;
            } catch { /* Native TSV uses doubled quotes and literal newlines. */ }
            if (/^"(?:[^"]|"")*"$/u.test(value)) return value.slice(1, -1).replace(/""/g, '"');
        }
        return value === '\u3000' ? '' : value;
    };
    if (tabular) return records.map(record => record.map(decode));
    // CP whitespace input commonly ends in extra blank lines. Only TSV has
    // explicit empty fields, so retain the existing CP trailing-line behavior.
    while (records.length > 1 && records.at(-1)[0] === '') records.pop();
    return records.map(([value]) => {
        const decoded = decode(value);
        if (decoded !== value || value === '""') return [decoded];
        return splitDataTokens(value);
    });
}
