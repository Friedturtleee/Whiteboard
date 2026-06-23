/**
 * MarkdownElement — renders Markdown text onto the canvas.
 * Uses marked.js for parsing, highlight.js for code syntax highlighting,
 * and KaTeX for LaTeX math rendering.
 * Rendering pipeline: Markdown → HTML → SVG foreignObject → Image → Canvas.
 */
import { Element } from '../core/Element.js';

export class MarkdownElement extends Element {
    constructor(x = 0, y = 0, markdownText = '') {
        super('markdown', x, y, 320, 200);
        this.markdownText = markdownText;
        this.img = null;
        this.label = 'Markdown';
        this._renderWidth = 600;
        this._rendering = false;
        if (markdownText) this._render();
    }

    // ═════════════════════════════════════════════════════
    // Static: shared Markdown→HTML rendering pipeline
    // ═════════════════════════════════════════════════════

    /**
     * Full rendering pipeline: Markdown → HTML with code highlighting + LaTeX.
     * @param {string} md - raw markdown text
     * @param {boolean} forSVG - if true, use MathML output for KaTeX (no CSS needed)
     * @returns {string} rendered HTML
     */
    static renderToHTML(md, forSVG = false) {
        if (!md || !md.trim()) return '';

        // 1. Limit blockquote nesting depth to 5
        md = MarkdownElement._limitBlockquoteDepth(md, 5);

        // 2. Process LaTeX (protect code blocks, render $..$ and $$..$$)
        const { text: processed, katexOutputs } = MarkdownElement._processLatex(md, forSVG);

        // 3. Parse markdown with marked
        let html;
        if (typeof marked !== 'undefined') {
            html = marked.parse(processed, { breaks: true, gfm: true });
        } else {
            html = `<pre style="white-space:pre-wrap">${processed.replace(/</g, '&lt;')}</pre>`;
        }

        // 4. Highlight code blocks with highlight.js
        html = MarkdownElement._highlightCodeBlocks(html);

        // 5. Restore KaTeX outputs
        for (let i = 0; i < katexOutputs.length; i++) {
            html = html.replace(`<span data-katex-ph="${i}"></span>`, katexOutputs[i]);
        }

        return html;
    }

    /**
     * Limit `>` blockquote nesting to maxDepth levels.
     */
    static _limitBlockquoteDepth(md, maxDepth) {
        return md.split('\n').map(line => {
            const match = line.match(/^((?:>\s*)+)/);
            if (match) {
                const arrows = (match[1].match(/>/g) || []).length;
                if (arrows > maxDepth) {
                    const content = line.replace(/^(?:>\s*)+/, '');
                    return '> '.repeat(maxDepth) + content;
                }
            }
            return line;
        }).join('\n');
    }

    /**
     * Extract and render LaTeX ($..$ inline, $$...$$ display).
     * Protects code blocks from LaTeX processing.
     */
    static _processLatex(md, forSVG) {
        const katexOutputs = [];

        if (typeof katex === 'undefined') return { text: md, katexOutputs };

        // Protect fenced code blocks and inline code from LaTeX processing
        const codeSlots = [];
        let text = md.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (m) => {
            const idx = codeSlots.length;
            codeSlots.push(m);
            return `\uFFFCCODE${idx}\uFFFC`;
        });

        const katexOpts = (displayMode) => ({
            displayMode,
            throwOnError: false,
            output: forSVG ? 'mathml' : 'html',
        });

        // Display math $$...$$
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
            try {
                const html = katex.renderToString(tex.trim(), katexOpts(true));
                const idx = katexOutputs.length;
                katexOutputs.push(`<div class="md-katex-display">${html}</div>`);
                return `<span data-katex-ph="${idx}"></span>`;
            } catch (e) {
                return `<span class="katex-error">$$${tex}$$</span>`;
            }
        });

        // Inline math $...$  (single $, not $$)
        text = text.replace(/(?<!\$)\$(?!\$|\s)([^\$\n]+?)(?<!\s)\$(?!\$)/g, (_, tex) => {
            try {
                const html = katex.renderToString(tex.trim(), katexOpts(false));
                const idx = katexOutputs.length;
                katexOutputs.push(html);
                return `<span data-katex-ph="${idx}"></span>`;
            } catch (e) {
                return `<span class="katex-error">$${tex}$</span>`;
            }
        });

        // Restore code blocks
        text = text.replace(/\uFFFCCODE(\d+)\uFFFC/g, (_, i) => codeSlots[Number(i)]);

        return { text, katexOutputs };
    }

    /**
     * Post-process: find <code class="language-xxx"> blocks and apply highlight.js.
     */
    static _highlightCodeBlocks(html) {
        if (typeof hljs === 'undefined') return html;

        return html.replace(
            /<code class="language-([\w+\-#]+)">([\s\S]*?)<\/code>/g,
            (match, lang, code) => {
                // Decode HTML entities back to raw text for hljs
                const decoded = code
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'");

                // Map common aliases (Discord-style)
                const langMap = {
                    'cpp': 'cpp', 'c++': 'cpp',
                    'js': 'javascript', 'ts': 'typescript',
                    'py': 'python', 'rb': 'ruby',
                    'cs': 'csharp', 'c#': 'csharp',
                    'sh': 'bash', 'shell': 'bash',
                    'yml': 'yaml', 'md': 'markdown',
                    'kt': 'kotlin', 'rs': 'rust',
                    'go': 'go', 'hs': 'haskell',
                };
                const resolvedLang = langMap[lang.toLowerCase()] || lang.toLowerCase();

                if (hljs.getLanguage(resolvedLang)) {
                    try {
                        const result = hljs.highlight(decoded, { language: resolvedLang });
                        return `<code class="hljs language-${lang}">${result.value}</code>`;
                    } catch (_) { /* fall through */ }
                }
                // Unknown language: try auto-detect
                try {
                    const result = hljs.highlightAuto(decoded);
                    return `<code class="hljs language-${lang}">${result.value}</code>`;
                } catch (_) { /* fall through */ }

                return match;
            }
        );
    }

    // ═════════════════════════════════════════════════════
    // Instance: render to canvas image
    // ═════════════════════════════════════════════════════

    _render() {
        if (this._rendering) return;
        this._rendering = true;

        const md = this.markdownText;
        if (!md || !md.trim()) {
            this.img = null;
            this._rendering = false;
            return;
        }

        // Get rendered HTML (using MathML for SVG compatibility)
        const html = MarkdownElement.renderToHTML(md, true);

        // ── CSS for SVG foreignObject ───────────────
        const w = this._renderWidth;
        const cssReset = `
            * { margin:0; padding:0; box-sizing:border-box; }
            body {
                font-family: 'Inter', 'Zen Maru Gothic', -apple-system, sans-serif;
                font-size: 15px;
                line-height: 1.7;
                color: #e0e0e0;
                padding: 20px 24px;
                word-wrap: break-word;
                overflow-wrap: break-word;
            }
            h1 { font-size:28px; font-weight:700; margin:0 0 12px; color:#fff; border-bottom:1px solid #444; padding-bottom:8px; }
            h2 { font-size:22px; font-weight:600; margin:16px 0 8px; color:#f0f0f0; border-bottom:1px solid #333; padding-bottom:6px; }
            h3 { font-size:18px; font-weight:600; margin:14px 0 6px; color:#e8e8e8; }
            h4 { font-size:16px; font-weight:600; margin:12px 0 4px; color:#ddd; }
            h5,h6 { font-size:14px; font-weight:600; margin:10px 0 4px; color:#ccc; }
            p { margin:0 0 10px; }
            ul, ol { margin:0 0 10px; padding-left:24px; }
            li { margin:2px 0; }
            blockquote {
                margin:0 0 10px;
                padding:8px 16px;
                border-left:4px solid #6366f1;
                background:rgba(99,102,241,0.08);
                color:#c0c0c0;
            }
            a { color:#818cf8; text-decoration:none; }
            strong { color:#fff; font-weight:600; }
            em { font-style:italic; color:#d0d0d0; }
            code {
                font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
                font-size: 13px;
                background: rgba(255,255,255,0.08);
                padding: 2px 6px;
                border-radius: 4px;
                color: #e8b4b8;
            }
            pre {
                margin:0 0 12px;
                padding:14px 16px;
                background: #1a1a2e;
                border-radius:8px;
                border:1px solid #2a2a3e;
                overflow-x:auto;
            }
            pre code {
                background:none;
                padding:0;
                font-size:13px;
                line-height:1.6;
                color:#e0e0e0;
            }
            table { border-collapse:collapse; margin:0 0 12px; width:100%; }
            th, td { border:1px solid #444; padding:6px 10px; text-align:left; }
            th { background:rgba(99,102,241,0.15); color:#c8c8ff; font-weight:600; }
            tr:nth-child(even) { background:rgba(255,255,255,0.03); }
            hr { border:none; border-top:1px solid #444; margin:14px 0; }
            img { max-width:100%; border-radius:6px; }
            .md-katex-display { text-align:center; margin:12px 0; color:#e0e0e0; }
            math { color: #e0e0e0; }
            .katex-error { color:#f07178; font-family:monospace; font-size:13px; }
            .hljs-keyword { color:#c792ea; }
            .hljs-string { color:#c3e88d; }
            .hljs-number { color:#f78c6c; }
            .hljs-comment { color:#676e95; font-style:italic; }
            .hljs-function, .hljs-title { color:#82aaff; }
            .hljs-built_in, .hljs-type { color:#ffcb6b; }
            .hljs-attr, .hljs-variable { color:#f07178; }
            .hljs-meta { color:#89ddff; }
            .hljs-operator, .hljs-punctuation { color:#89ddff; }
            .hljs-title.function_ { color:#82aaff; }
            .hljs-title.class_ { color:#ffcb6b; }
        `;

        // Measure actual height
        const measure = document.createElement('div');
        measure.style.cssText = `
            position:absolute; left:-9999px; top:-9999px;
            width:${w}px; visibility:hidden;
            font-family:Inter,sans-serif; font-size:15px; line-height:1.7;
            padding:20px 24px; box-sizing:border-box;
        `;
        measure.innerHTML = html;
        document.body.appendChild(measure);
        measure.querySelectorAll('pre').forEach(pre => {
            pre.style.padding = '14px 16px';
            pre.style.margin = '0 0 12px';
        });
        measure.querySelectorAll('h1').forEach(el => { el.style.fontSize = '28px'; el.style.margin = '0 0 12px'; el.style.paddingBottom = '8px'; });
        measure.querySelectorAll('h2').forEach(el => { el.style.fontSize = '22px'; el.style.margin = '16px 0 8px'; el.style.paddingBottom = '6px'; });
        measure.querySelectorAll('h3').forEach(el => { el.style.fontSize = '18px'; el.style.margin = '14px 0 6px'; });
        measure.querySelectorAll('ul,ol').forEach(el => { el.style.paddingLeft = '24px'; el.style.margin = '0 0 10px'; });
        measure.querySelectorAll('p').forEach(el => { el.style.margin = '0 0 10px'; });
        measure.querySelectorAll('blockquote').forEach(el => { el.style.padding = '8px 16px'; el.style.margin = '0 0 10px'; });

        const h = measure.scrollHeight + 10;
        document.body.removeChild(measure);

        const svgContent = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
                <foreignObject width="100%" height="100%">
                    <div xmlns="http://www.w3.org/1999/xhtml">
                        <style>${cssReset}</style>
                        <body>${html}</body>
                    </div>
                </foreignObject>
            </svg>
        `;

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            this.img = img;
            const aspect = h / w;
            this.width = this._renderWidth;
            this.height = this._renderWidth * aspect;
            URL.revokeObjectURL(url);
            this._rendering = false;
            if (window.appInstance) {
                window.appInstance.renderer.markDirty();
            }
        };
        img.onerror = () => {
            console.error('[MarkdownElement] SVG render failed');
            this._rendering = false;
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

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

        // Background
        ctx.fillStyle = 'rgba(22, 22, 35, 0.95)';
        const r = 8;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(99,102,241,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (this.img && this.img.complete && this.img.width > 0) {
            ctx.drawImage(this.img, x, y, w, h);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '13px Inter, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText('Rendering Markdown…', x + w / 2, y + h / 2);
        }

        // MD badge
        ctx.fillStyle = 'rgba(99,102,241,0.6)';
        const bw = 22, bh = 14;
        ctx.beginPath();
        ctx.roundRect(x + w - bw - 4, y + 4, bw, bh, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MD', x + w - bw / 2 - 4, y + 4 + bh / 2);

        ctx.restore();
    }

    serialize() {
        return {
            ...super.serialize(),
            markdownText: this.markdownText,
            renderWidth: this._renderWidth,
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.markdownText = data.markdownText || '';
        this._renderWidth = data.renderWidth || 600;
        if (this.markdownText) this._render();
        return this;
    }

    static fromData(data) {
        return new MarkdownElement(data.x, data.y, '').deserialize(data);
    }
}
