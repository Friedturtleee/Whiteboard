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

export class MarkdownElement extends Element {
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
        if (!md || !md.trim()) return '';

        // 1. Limit blockquote nesting to 5 levels
        md = MarkdownElement._limitBlockquoteDepth(md, 5);

        // 2. Process LaTeX ($…$ inline, $$…$$ display) — protect code first
        const { text: processed, katexOutputs } = MarkdownElement._processLatex(md);

        // 3. Parse with marked
        let html;
        if (typeof marked !== 'undefined') {
            html = marked.parse(processed, { breaks: true, gfm: true });
        } else {
            html = `<pre style="white-space:pre-wrap">${processed.replace(/</g, '&lt;')}</pre>`;
        }

        // 4. Highlight code blocks
        html = MarkdownElement._highlightCodeBlocks(html);

        // 5. Restore KaTeX placeholders
        for (let i = 0; i < katexOutputs.length; i++) {
            html = html.replace(`<span data-katex-ph="${i}"></span>`, katexOutputs[i]);
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
                return `<span data-katex-ph="${katexOutputs.length - 1}"></span>`;
            } catch (e) {
                return `<span class="katex-error">$$${tex}$$</span>`;
            }
        });

        // Inline math $…$ (not $$ and not in middle of words with digits)
        text = text.replace(/(?<!\$)\$(?!\$|\s)([^\$\n]+?)(?<!\s)\$(?!\$)/g, (_, tex) => {
            try {
                const html = katex.renderToString(tex.trim(), opts(false));
                katexOutputs.push(html);
                return `<span data-katex-ph="${katexOutputs.length - 1}"></span>`;
            } catch (e) {
                return `<span class="katex-error">$${tex}$</span>`;
            }
        });

        // Restore code blocks
        text = text.replace(/\uFFFCCD(\d+)\uFFFC/g, (_, i) => codeSlots[Number(i)]);

        return { text, katexOutputs };
    }

    /** Post-process: highlight <code class="language-xxx"> blocks with hljs. */
    static _highlightCodeBlocks(html) {
        if (typeof hljs === 'undefined') return html;

        return html.replace(
            /<code class="language-([\w+\-#]+)">([\s\S]*?)<\/code>/g,
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
                const resolved = langMap[lang.toLowerCase()] || lang.toLowerCase();

                try {
                    const result = hljs.getLanguage(resolved)
                        ? hljs.highlight(decoded, { language: resolved })
                        : hljs.highlightAuto(decoded);
                    return `<code class="hljs language-${lang}">${result.value}</code>`;
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
        if (this._rendering) return;
        this._rendering = true;

        const md = this.markdownText;
        if (!md || !md.trim()) {
            this.img = null;
            this._rendering = false;
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
            background: #161623;
            padding: 20px 24px;
            font-family: Inter, 'Zen Maru Gothic', -apple-system, sans-serif;
            font-size: ${this.fontSize}px; line-height: 1.7;
            color: #e0e0e0;
            box-sizing: border-box;
            border-radius: 8px;
            overflow: hidden;
        `;
        container.innerHTML = html;

        // Apply inline styles that match our CSS
        MarkdownElement._applyRenderStyles(container);

        document.body.appendChild(container);

        // Wait a frame for layout + KaTeX fonts to apply
        requestAnimationFrame(() => {
            const actualH = container.scrollHeight;

            if (typeof html2canvas !== 'undefined') {
                html2canvas(container, {
                    backgroundColor: '#161623',
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    width: w,
                    height: actualH,
                }).then(canvas => {
                    const oldScale = (this._naturalW > 0) ? (this.width / this._naturalW) : 1;
                    
                    this.img = canvas;
                    this._naturalW = canvas.width / 2;
                    this._naturalH = canvas.height / 2;
                    
                    this.width = this._naturalW * oldScale;
                    this.height = this._naturalH * oldScale;
                    document.body.removeChild(container);
                    this._rendering = false;
                    if (window.appInstance) window.appInstance.renderer.markDirty();
                }).catch(() => {
                    document.body.removeChild(container);
                    this._rendering = false;
                });
            } else {
                // Fallback: SVG foreignObject (basic, may miss styles)
                this._renderFallbackSVG(html, w, actualH, container);
            }
        });
    }

    /** Apply inline styles for html2canvas rendering */
    static _applyRenderStyles(container) {
        container.querySelectorAll('h1').forEach(el => {
            el.style.cssText = 'font-size:1.8em;font-weight:700;margin:0 0 12px;color:#fff;border-bottom:1px solid #444;padding-bottom:8px;';
        });
        container.querySelectorAll('h2').forEach(el => {
            el.style.cssText = 'font-size:1.4em;font-weight:600;margin:16px 0 8px;color:#f0f0f0;border-bottom:1px solid #333;padding-bottom:6px;';
        });
        container.querySelectorAll('h3').forEach(el => {
            el.style.cssText = 'font-size:1.2em;font-weight:600;margin:14px 0 6px;color:#e8e8e8;';
        });
        container.querySelectorAll('h4,h5,h6').forEach(el => {
            el.style.cssText = 'font-size:1em;font-weight:600;margin:10px 0 4px;color:#ccc;';
        });
        container.querySelectorAll('p').forEach(el => {
            el.style.cssText = 'margin:0 0 10px;';
        });
        container.querySelectorAll('ul,ol').forEach(el => {
            el.style.cssText = 'margin:0 0 10px;padding-left:24px;';
        });
        container.querySelectorAll('li').forEach(el => {
            el.style.cssText = 'margin:2px 0;';
        });
        container.querySelectorAll('blockquote').forEach(el => {
            el.style.cssText = 'margin:0 0 10px;padding:8px 16px;border-left:4px solid #6366f1;background:rgba(99,102,241,0.08);color:#c0c0c0;';
        });
        container.querySelectorAll('a').forEach(el => {
            el.style.cssText = 'color:#818cf8;text-decoration:none;';
        });
        container.querySelectorAll('strong').forEach(el => {
            el.style.cssText = 'color:#fff;font-weight:600;';
        });
        container.querySelectorAll('em').forEach(el => {
            el.style.cssText = 'font-style:italic;color:#d0d0d0;';
        });
        container.querySelectorAll('pre').forEach(el => {
            el.style.cssText = 'margin:0 0 12px;padding:14px 16px;background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3e;overflow-x:auto;';
        });
        container.querySelectorAll('code').forEach(el => {
            if (el.parentElement && el.parentElement.tagName === 'PRE') {
                el.style.cssText = 'font-family:Fira Code,JetBrains Mono,Consolas,monospace;font-size:0.85em;line-height:1.6;color:#e0e0e0;background:none;padding:0;';
            } else {
                el.style.cssText = 'font-family:Fira Code,JetBrains Mono,Consolas,monospace;font-size:0.85em;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;color:#e8b4b8;';
            }
        });
        container.querySelectorAll('table').forEach(el => {
            el.style.cssText = 'border-collapse:collapse;margin:0 0 12px;width:100%;';
        });
        container.querySelectorAll('th').forEach(el => {
            el.style.cssText = 'border:1px solid #444;padding:6px 10px;text-align:left;background:rgba(99,102,241,0.15);color:#c8c8ff;font-weight:600;';
        });
        container.querySelectorAll('td').forEach(el => {
            el.style.cssText = 'border:1px solid #444;padding:6px 10px;text-align:left;';
        });
        container.querySelectorAll('hr').forEach(el => {
            el.style.cssText = 'border:none;border-top:1px solid #444;margin:14px 0;';
        });
        container.querySelectorAll('.md-katex-display').forEach(el => {
            el.style.cssText = 'text-align:center;margin:12px 0;overflow-x:auto;';
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
    _renderFallbackSVG(html, w, h, container) {
        if (container.parentNode) document.body.removeChild(container);

        const css = `* { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:sans-serif; font-size:15px; line-height:1.7; color:#e0e0e0; padding:20px 24px; }
            pre { background:#1a1a2e; padding:14px 16px; border-radius:8px; margin:0 0 12px; overflow-x:auto; }
            code { font-family:monospace; font-size:13px; }
            p { margin:0 0 10px; } h1 { font-size:28px; margin:0 0 12px; color:#fff; }`;

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
            <foreignObject width="100%" height="100%">
                <div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style><body>${html}</body></div>
            </foreignObject></svg>`;

        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
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
        img.onerror = () => { this._rendering = false; URL.revokeObjectURL(url); };
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

        // Background card
        ctx.fillStyle = 'rgba(22, 22, 35, 0.95)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(99,102,241,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (this.img) {
            // Draw at element size — since width/height match natural dims, no distortion
            ctx.drawImage(this.img, x, y, w, h);
        } else if (this._rendering) {
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
            fontSize: this.fontSize,
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.markdownText = data.markdownText || '';
        this._renderWidth = data.renderWidth || 600;
        this.fontSize = data.fontSize || 15;
        if (this.markdownText) this._render();
        return this;
    }

    static fromData(data) {
        return new MarkdownElement(data.x, data.y, '').deserialize(data);
    }
}
