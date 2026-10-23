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

function readJSONString(input, start) {
    let escaped = false;
    for (let end = start + 1; end < input.length; end++) {
        const char = input[end];
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') {
            try { return { value: JSON.parse(input.slice(start, end + 1)), end: end + 1 }; }
            catch { return null; }
        }
    }
    return null;
}

/** Tabs and physical newlines inside quoted cells indicate spreadsheet input. */
export function isTabularMatrixInput(text) {
    const input = String(text);
    if (input.includes('\t')) return true;
    let quoted = false, atRowStart = true;
    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        const newline = char === '\n' || char === '\r';
        if (quoted) {
            if (newline) return true;
            if (char === '"') {
                if (input[index + 1] === '"') index++;
                else quoted = false;
            }
        } else if (newline) atRowStart = true;
        else {
            if (atRowStart && char === '"') {
                const json = readJSONString(input, index);
                if (json && (json.end === input.length || /[\s,]/.test(input[json.end]))) {
                    index = json.end - 1;
                } else quoted = true;
            }
            atRowStart = false;
        }
    }
    return false;
}

/** Read CP whitespace input or tabular clipboard text, retaining empty cells. */
export function parsePastedMatrixRows(text) {
    const input = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!isTabularMatrixInput(input)) return input.split('\n').map(row => splitDataTokens(row));
    const boundary = index => index === input.length || input[index] === '\t' || input[index] === '\n';
    const readQuoted = start => {
        // Whiteboard copies use JSON strings. Accept one only when it ends at
        // a cell boundary; spreadsheet quoting uses doubled quotes instead.
        const json = readJSONString(input, start);
        if (json && boundary(json.end)) return json;

        let value = '';
        for (let end = start + 1; end < input.length; end++) {
            const char = input[end];
            if (char === '"') {
                if (input[end + 1] === '"') { value += '"'; end++; continue; }
                if (boundary(end + 1)) return { value, end: end + 1 };
                // Preserve a malformed quoted field as entered.
                while (!boundary(++end)) {}
                return { value: input.slice(start, end), end };
            }
            value += char;
        }
        return { value: input.slice(start), end: input.length };
    };
    const rows = [], row = [];
    let start = 0;
    while (start <= input.length) {
        let field;
        if (input[start] === '"') field = readQuoted(start);
        else {
            let end = start;
            while (!boundary(end)) end++;
            field = { value: input.slice(start, end), end };
        }
        row.push(field.value === '\u3000' ? '' : field.value);
        if (field.end === input.length) break;
        if (input[field.end] === '\n') rows.push(row.splice(0));
        start = field.end + 1;
    }
    rows.push(row);
    return rows;
}
