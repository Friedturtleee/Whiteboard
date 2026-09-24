/**
 * MarkdownElement — renders Markdown text onto the canvas.
 *
 * Libraries (all from GitHub CDN):
 *   • marked.js   (⭐33k) — Markdown → HTML
 *   • highlight.js (⭐24k) — code syntax highlighting
 *   • KaTeX        (⭐18k) — LaTeX math rendering
 *   • html2canvas  (⭐30k) — DOM → Canvas screenshot (solves SVG foreignObject limits)
 *
 * Pipeline: Markdown → HTML (with hljs + KaTeX) → hidden DOM div → html2canvas → Canvas image
 */
import { Element } from '../core/Element.js';

const MAX_RENDER_DIMENSION = 16_384;
const MAX_RENDER_PIXELS = 16_000_000;

function exceedsRenderLineLimit(text, limit) {
    let lines = 1;
    for (let index = 0; index < text.length; index++) {
        if (text.charCodeAt(index) === 10 && ++lines > limit) return true;
    }
    return false;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function safeMarkdownURL(rawURL) {
    if (rawURL == null) return null;
    const url = String(rawURL ?? '').trim();
    if (!url) return null;
    const normalized = url.replace(/[\u0000-\u0020\u007f]/g, '');
    const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) return null;
    return url;
}

export class MarkdownElement extends Element {
    static MAX_SOURCE_LENGTH = 1_000_000;
    static MAX_RENDER_LINES = 2_000;

    constructor(x = 0, y = 0, markdownText = '') {
        super('markdown', x, y, 320, 200);
        this.markdownText = markdownText;
        this.img = null;
        this.label = 'Markdown';
        this.fontSize = 15;
        this._renderWidth = 600;   // internal content width in px
        this._naturalW = 600;      // rendered image natural dimensions
        this._naturalH = 200;
        this._rendering = false;
        this._renderRevision = 0;
        if (markdownText) this._render();
    }

    // ═════════════════════════════════════════════════════
    // Static: Markdown → HTML rendering pipeline
    // ═════════════════════════════════════════════════════

    /**
     * Full pipeline: Markdown → HTML with code highlighting, LaTeX, blockquote limit.
     * @param {string} md - raw markdown
     * @returns {string} rendered HTML
     */
    static renderToHTML(md) {
        if (typeof md !== 'string' || !md.trim()) return '';
        if (md.length > MarkdownElement.MAX_SOURCE_LENGTH) {
            return '<p>Markdown source exceeds the 1 MB rendering limit.</p>';
        }
        if (exceedsRenderLineLimit(md, MarkdownElement.MAX_RENDER_LINES)) {
            return '<p>Markdown preview is limited to 2000 lines. Shorten the source to render it.</p>';
        }

        // 1. Limit blockquote nesting to 5 levels
        md = MarkdownElement._limitBlockquoteDepth(md, 5);

        // 2. Process LaTeX ($…$ inline, $$…$$ display) — protect code first
        const { text: processed, katexOutputs } = MarkdownElement._processLatex(md);

        // 3. Parse with marked
        let html;
        if (typeof marked !== 'undefined') {
            const renderer = new marked.Renderer();
            renderer.html = token => escapeHTML(token.text ?? '');
            renderer.link = function (token, titleArg, textArg) {
                const { href, title, text, tokens } = typeof token === 'string'
                    ? { href: token, title: titleArg, text: textArg }
                    : (token || {});
                const safeURL = safeMarkdownURL(href);
                const label = Array.isArray(tokens) ? this.parser.parseInline(tokens) : String(text ?? '');
                if (safeURL === null) return label;
                const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
                return `<a href="${escapeHTML(safeURL)}"${titleAttr}>${label}</a>`;
            };
            renderer.image = function (token, titleArg, textArg) {
                const { href, title, text, tokens } = typeof token === 'string'
                    ? { href: token, title: titleArg, text: textArg }
                    : (token || {});
                const safeURL = safeMarkdownURL(href);
                const alt = text ?? (Array.isArray(tokens) ? this.parser.parseInline(tokens) : '');
                if (safeURL === null) return escapeHTML(alt);
                const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
                return `<img src="${escapeHTML(safeURL)}" alt="${escapeHTML(alt)}"${titleAttr}>`;
            };
            html = marked.parse(processed, { breaks: true, gfm: true, renderer });
        } else {
            html = `<pre style="white-space:pre-wrap">${escapeHTML(processed)}</pre>`;
        }

        // 4. Highlight code blocks
        html = MarkdownElement._highlightCodeBlocks(html);

        // 5. Restore KaTeX placeholders
        for (let i = 0; i < katexOutputs.length; i++) {
            html = html.split(`\uE000KATEX_${i}\uE001`).join(katexOutputs[i]);
        }

        return html;
    }

    /** Limit `>` blockquote nesting to maxDepth. */
    static _limitBlockquoteDepth(md, maxDepth) {
        return md.split('\n').map(line => {
            const match = line.match(/^((?:>\s*)+)/);
            if (match) {
                const depth = (match[1].match(/>/g) || []).length;
                if (depth > maxDepth) {
                    const content = line.replace(/^(?:>\s*)+/, '');
                    return '> '.repeat(maxDepth) + content;
                }
            }
            return line;
        }).join('\n');
    }

    /** Extract and render LaTeX. Protects fenced/inline code from processing. */
    static _processLatex(md) {
        const katexOutputs = [];
        if (typeof katex === 'undefined') return { text: md, katexOutputs };

        // Protect code blocks and inline code
        const codeSlots = [];
        let text = md.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (m) => {
            codeSlots.push(m);
            return `\uFFFCCD${codeSlots.length - 1}\uFFFC`;
        });

        const opts = (display) => ({ displayMode: display, throwOnError: false, output: 'html' });

        // Display math $$…$$
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
            try {
                const html = katex.renderToString(tex.trim(), opts(true));
                katexOutputs.push(`<div class="md-katex-display">${html}</div>`);
                return `\uE000KATEX_${katexOutputs.length - 1}\uE001`;
            } catch (e) {
                return `$$${tex}$$`;
            }
        });

        // Inline math $…$ (not $$ and not in middle of words with digits)
        text = text.replace(/(?<!\$)\$(?!\$|\s)([^\$\n]+?)(?<!\s)\$(?!\$)/g, (_, tex) => {
            try {
                const html = katex.renderToString(tex.trim(), opts(false));
                katexOutputs.push(html);
                return `\uE000KATEX_${katexOutputs.length - 1}\uE001`;
            } catch (e) {
                return `$${tex}$`;
            }
        });

        // Restore code blocks
        text = text.replace(/\uFFFCCD(\d+)\uFFFC/g, (_, i) => codeSlots[Number(i)]);

        return { text, katexOutputs };
    }

    /** Highlight fenced code blocks, using auto-detection when no language is tagged. */
    static _highlightCodeBlocks(html) {
        if (typeof hljs === 'undefined') return html;

        return html.replace(
            /<pre><code(?: class="language-([\w+\-#]+)")?>([\s\S]*?)<\/code><\/pre>/g,
            (match, lang, code) => {
                const decoded = code
                    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

                const langMap = {
                    'cpp': 'cpp', 'c++': 'cpp', 'js': 'javascript', 'ts': 'typescript',
                    'py': 'python', 'rb': 'ruby', 'cs': 'csharp', 'c#': 'csharp',
                    'sh': 'bash', 'shell': 'bash', 'yml': 'yaml', 'md': 'markdown',
                    'kt': 'kotlin', 'rs': 'rust', 'go': 'go', 'hs': 'haskell',
                };
                const normalizedLang = lang?.toLowerCase();
                const resolved = normalizedLang
                    ? (langMap[normalizedLang] || normalizedLang)
                    : null;

                try {
                    const result = resolved && hljs.getLanguage(resolved)
                        ? hljs.highlight(decoded, { language: resolved })
                        : hljs.highlightAuto(decoded);
                    const detectedLanguage = resolved || result.language;
                    if (!result.language && !resolved) return match;
                    return `<pre><code class="hljs language-${detectedLanguage}">${result.value}</code></pre>`;
                } catch (_) {
                    return match;
                }
            }
        );
    }

    // ═════════════════════════════════════════════════════
    // Instance: render to canvas image via html2canvas
    // ═════════════════════════════════════════════════════

    _render() {
        const revision = ++this._renderRevision;
        this._rendering = true;

        const md = this.markdownText;
        if (!md || !md.trim()) {
            this.img = null;
            this._rendering = false;
            return;
        }
        if (exceedsRenderLineLimit(md, MarkdownElement.MAX_RENDER_LINES)) {
            this._showRenderLimitNotice();
            return;
        }

        const html = MarkdownElement.renderToHTML(md);
        const w = this._renderWidth;

        // Create a hidden container styled identically to preview
        const container = document.createElement('div');
        container.className = 'md-render-container';
        container.style.cssText = `
            position: fixed; left: -9999px; top: 0;
            width: ${w}px;
            background: transparent;
            padding: 0;
            font-family: Inter, 'Zen Maru Gothic', -apple-system, sans-serif;
            font-size: ${this.fontSize}px; line-height: 1.5;
            color: #e0e0e0;
            box-sizing: border-box;
            overflow: visible;
        `;
        container.innerHTML = html;

        // Apply inline styles that match our CSS
        MarkdownElement._applyRenderStyles(container);

        document.body.appendChild(container);

        // Wait a frame for layout + KaTeX fonts to apply
        requestAnimationFrame(() => {
            if (revision !== this._renderRevision) {
                if (container.parentNode) container.parentNode.removeChild(container);
                return;
            }
            const actualH = container.scrollHeight;
            const requiredScale = Math.min(
                2,
                MAX_RENDER_DIMENSION / w,
                MAX_RENDER_DIMENSION / actualH,
                Math.sqrt(MAX_RENDER_PIXELS / (w * actualH))
            );
            const minimumScale = typeof html2canvas !== 'undefined' ? 0.5 : 1;
            if (!Number.isFinite(requiredScale) || requiredScale < minimumScale) {
                if (container.parentNode) container.parentNode.removeChild(container);
                this._showRenderLimitNotice();
                return;
            }

            if (typeof html2canvas !== 'undefined') {
                html2canvas(container, {
                    backgroundColor: null,
                    scale: requiredScale,
                    useCORS: true,
                    logging: false,
                    width: w,
                    height: actualH,
                }).then(canvas => {
                    if (container.parentNode) container.parentNode.removeChild(container);
                    if (revision !== this._renderRevision) return;

                    const oldScale = (this._naturalW > 0) ? (this.width / this._naturalW) : 1;
                    
                    this.img = canvas;
                    this._naturalW = canvas.width / requiredScale;
                    this._naturalH = canvas.height / requiredScale;
                    
                    this.width = this._naturalW * oldScale;
                    this.height = this._naturalH * oldScale;
                    this._rendering = false;
                    if (window.appInstance) window.appInstance.renderer.markDirty();
                }).catch(() => {
                    if (container.parentNode) container.parentNode.removeChild(container);
                    if (revision === this._renderRevision) this._rendering = false;
                });
            } else {
                // Fallback: SVG foreignObject (basic, may miss styles)
                this._renderFallbackSVG(html, w, actualH, container, revision);
            }
        });
    }

    _showRenderLimitNotice() {
        const width = Math.min(Math.max(this._renderWidth || 600, 240), 1200);
        const height = 48;
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.scale(scale, scale);
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '14px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText('Markdown is too large to render. Shorten it to show the canvas preview.', 8, height / 2, width - 16);
        }
        const oldScale = this._naturalW > 0 ? this.width / this._naturalW : 1;
        this.img = canvas;
        this._naturalW = width;
        this._naturalH = height;
        this.width = width * oldScale;
        this.height = height * oldScale;
        this._rendering = false;
        globalThis.window?.appInstance?.renderer.markDirty();
    }

    /** Apply inline styles for html2canvas rendering */
    static _applyRenderStyles(container) {
        container.querySelectorAll('h1').forEach(el => {
            el.style.cssText = 'font-size:1.8em;font-weight:700;line-height:1.2;margin:0 0 0.35em;color:#8ecbff;';
        });
        container.querySelectorAll('h2').forEach(el => {
            el.style.cssText = 'font-size:1.4em;font-weight:600;line-height:1.25;margin:0.55em 0 0.3em;color:#8bd5ca;';
        });
        container.querySelectorAll('h3').forEach(el => {
            el.style.cssText = 'font-size:1.2em;font-weight:600;line-height:1.3;margin:0.45em 0 0.25em;color:#c3a6ff;';
        });
        container.querySelectorAll('h4,h5,h6').forEach(el => {
            el.style.cssText = 'font-size:1em;font-weight:600;margin:0.4em 0 0.2em;color:#f0c987;';
        });
        container.querySelectorAll('p').forEach(el => {
            el.style.cssText = 'margin:0 0 0.35em;';
        });
        container.querySelectorAll('ul,ol').forEach(el => {
            el.style.cssText = 'margin:0.15em 0 0.35em;padding-left:1.35em;';
        });
        container.querySelectorAll('li').forEach(el => {
            el.style.cssText = 'margin:0.08em 0;';
        });
        container.querySelectorAll('blockquote').forEach(el => {
            el.style.cssText = 'margin:0.25em 0;padding:0 0 0 0.8em;border-left:2px solid #80cbc4;color:#aebbc7;';
        });
        container.querySelectorAll('a').forEach(el => {
            el.style.cssText = 'color:#82aaff;text-decoration:underline;text-decoration-color:rgba(130,170,255,0.45);';
        });
        container.querySelectorAll('strong').forEach(el => {
            el.style.cssText = 'color:#f0c987;font-weight:700;';
        });
        container.querySelectorAll('em').forEach(el => {
            el.style.cssText = 'font-style:italic;color:#8bd5ca;';
        });
        container.querySelectorAll('pre').forEach(el => {
            el.style.cssText = 'margin:0.35em 0;padding:0;overflow-x:auto;';
        });
        container.querySelectorAll('code').forEach(el => {
            if (el.parentElement && el.parentElement.tagName === 'PRE') {
                el.style.cssText = 'font-family:Fira Code,JetBrains Mono,Consolas,monospace;font-size:0.88em;line-height:1.55;color:#cdd6f4;background:transparent;padding:0;';
            } else {
                el.style.cssText = 'font-family:Fira Code,JetBrains Mono,Consolas,monospace;font-size:0.88em;background:transparent;padding:0;color:#f2a2c0;';
            }
        });
        container.querySelectorAll('table').forEach(el => {
            el.style.cssText = 'border-collapse:collapse;margin:0.35em 0;width:auto;';
        });
        container.querySelectorAll('th').forEach(el => {
            el.style.cssText = 'border-bottom:1px solid rgba(140,160,180,0.5);padding:0.2em 0.65em 0.2em 0;text-align:left;color:#8ecbff;font-weight:600;';
        });
        container.querySelectorAll('td').forEach(el => {
            el.style.cssText = 'border-bottom:1px solid rgba(140,160,180,0.22);padding:0.2em 0.65em 0.2em 0;text-align:left;';
        });
        container.querySelectorAll('hr').forEach(el => {
            el.style.cssText = 'border:none;border-top:1px solid rgba(140,160,180,0.45);margin:0.65em 0;';
        });
        container.querySelectorAll('img').forEach(el => {
            el.style.cssText = 'max-width:100%;height:auto;';
        });
        container.querySelectorAll('.md-katex-display').forEach(el => {
            el.style.cssText = 'text-align:center;margin:0.45em 0;overflow-x:auto;';
        });
        // hljs token colors
        const tokenStyles = {
            'hljs-keyword': 'color:#c792ea;',
            'hljs-string': 'color:#c3e88d;',
            'hljs-number': 'color:#f78c6c;',
            'hljs-comment': 'color:#676e95;font-style:italic;',
            'hljs-title': 'color:#82aaff;',
            'hljs-function': 'color:#82aaff;',
            'hljs-built_in': 'color:#ffcb6b;',
            'hljs-type': 'color:#ffcb6b;',
            'hljs-attr': 'color:#f07178;',
            'hljs-variable': 'color:#f07178;',
            'hljs-meta': 'color:#89ddff;',
            'hljs-operator': 'color:#89ddff;',
            'hljs-punctuation': 'color:#89ddff;',
        };
        for (const [cls, style] of Object.entries(tokenStyles)) {
            container.querySelectorAll(`.${cls}`).forEach(el => {
                el.style.cssText += style;
            });
        }
    }

    /** Fallback SVG foreignObject rendering (when html2canvas is unavailable) */
    _renderFallbackSVG(html, w, h, container, revision) {
        if (container.parentNode) document.body.removeChild(container);

        const css = `* { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:sans-serif; font-size:15px; line-height:1.5; color:#e0e0e0; }
            pre { margin:0.35em 0; overflow-x:auto; }
            code { font-family:monospace; font-size:0.88em; color:#f2a2c0; }
            pre code { color:#cdd6f4; }
            .hljs-keyword { color:#c792ea; }
            .hljs-string { color:#c3e88d; }
            .hljs-number { color:#f78c6c; }
            .hljs-comment { color:#676e95; font-style:italic; }
            .hljs-title, .hljs-function { color:#82aaff; }
            .hljs-built_in, .hljs-type { color:#ffcb6b; }
            .hljs-attr, .hljs-variable { color:#f07178; }
            .hljs-meta, .hljs-operator, .hljs-punctuation { color:#89ddff; }
            a { color:#82aaff; } strong { color:#f0c987; } em { color:#8bd5ca; }
            p { margin:0 0 0.35em; } h1 { font-size:1.8em; margin:0 0 0.35em; color:#8ecbff; }`;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
            <foreignObject width="100%" height="100%">
                <div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style><body>${html}</body></div>
            </foreignObject></svg>`;

        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            if (revision !== this._renderRevision) {
                URL.revokeObjectURL(url);
                return;
            }
            const oldScale = (this._naturalW > 0) ? (this.width / this._naturalW) : 1;
            
            this.img = img;
            this._naturalW = w;
            this._naturalH = h;
            
            this.width = w * oldScale;
            this.height = h * oldScale;
            URL.revokeObjectURL(url);
            this._rendering = false;
            if (window.appInstance) window.appInstance.renderer.markDirty();
        };
        img.onerror = () => {
            if (revision === this._renderRevision) this._rendering = false;
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    // ═════════════════════════════════════════════════════
    // Draw
    // ═════════════════════════════════════════════════════

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, width: w, height: h, rotation } = this;

        ctx.save();
        if (rotation) {
            const cx = x + w / 2, cy = y + h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.translate(-cx, -cy);
        }

        if (this.img) {
            // Draw at element size — since width/height match natural dims, no distortion
            ctx.drawImage(this.img, x, y, w, h);
        }

        ctx.restore();
    }

    serialize() {
        return {
            ...super.serialize(),
            markdownText: this.markdownText,
            renderWidth: this._renderWidth,
            fontSize: this.fontSize,
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.markdownText = data.markdownText || '';
        this._renderWidth = data.renderWidth || 600;
        this.fontSize = data.fontSize || 15;
        this._render();
        return this;
    }

    static fromData(data) {
        return new MarkdownElement(data.x, data.y);
    }
}
