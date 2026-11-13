import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true
});

const renderer = new marked.Renderer();

(renderer as any).heading = function({ tokens, depth }: any) {
  const content = this.parser ? this.parser.parseInline(tokens) : '';
  const sizes: Record<number, string> = {
    1: 'text-base sm:text-[17px] font-semibold text-[var(--arc-text-primary)] mb-2 mt-4 font-sans tracking-tight',
    2: 'text-sm sm:text-[15.5px] font-semibold text-[var(--arc-text-primary)] mb-2 mt-3.5 font-sans tracking-tight',
    3: 'text-xs sm:text-sm font-semibold text-[var(--arc-text-primary)] mb-1.5 mt-2.5 font-sans',
    4: 'text-xs font-semibold text-[var(--arc-text-primary)] mb-1 mt-2 font-sans',
    5: 'text-xs font-medium text-[var(--arc-text-secondary)] mb-1 mt-1.5 font-sans',
    6: 'text-xs font-medium text-[var(--arc-text-secondary)] mb-1 mt-1 font-sans'
  };
  const cls = sizes[depth] || sizes[3];
  return `<h${depth} class="${cls}">${content}</h${depth}>`;
};

(renderer as any).code = function({ text, lang }: any) {
  const language = lang || 'code';
  const rawCode = String(text || '');
  const escaped = rawCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="relative group/code code-block-wrapper my-3 rounded-xl border border-[var(--arc-hairline)] bg-[var(--arc-code)] overflow-hidden shadow-lg"><div class="flex items-center justify-between px-3.5 py-1.5 bg-[var(--arc-plane)] border-b border-[var(--arc-divider)] select-none text-[10px] font-mono text-[var(--arc-text-machine)]"><span class="uppercase tracking-wider font-semibold">${language}</span><button type="button" class="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--arc-text-hint)] hover:text-[var(--arc-text-primary)] transition-colors cursor-pointer px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)]" onclick="const wrapper = this.closest('.code-block-wrapper'); const code = wrapper ? wrapper.querySelector('code')?.innerText || '' : ''; if (code) { if (navigator.clipboard) { navigator.clipboard.writeText(code); } this.innerText = 'Скопировано!'; setTimeout(() => this.innerText = 'Копировать', 1800); }">Копировать</button></div><pre class="p-3.5 font-mono text-xs leading-relaxed overflow-x-auto text-[var(--arc-text-primary)] select-text"><code class="block w-full">${escaped.trim()}</code></pre></div>`;
};

(renderer as any).codespan = function({ text }: any) {
  const escaped = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<code class="bg-[var(--arc-code)] border border-[var(--arc-hairline)] px-1.5 py-0.5 rounded font-mono text-xs text-[var(--arc-text-primary)] font-normal select-text">${escaped}</code>`;
};

(renderer as any).strong = function({ tokens }: any) {
  const content = this.parser ? this.parser.parseInline(tokens) : '';
  return `<strong class="font-bold text-[var(--arc-text-primary)]">${content}</strong>`;
};

(renderer as any).em = function({ tokens }: any) {
  const content = this.parser ? this.parser.parseInline(tokens) : '';
  return `<em class="italic text-[var(--arc-text-primary)]">${content}</em>`;
};

(renderer as any).blockquote = function({ tokens }: any) {
  const content = this.parser ? this.parser.parse(tokens) : '';
  return `<blockquote class="border-l-2 border-[var(--accent)] pl-3.5 py-1.5 my-2.5 text-xs text-[var(--arc-text-secondary)] bg-[var(--arc-plane)] rounded-r-lg font-sans italic">${content}</blockquote>`;
};

(renderer as any).table = function(token: any) {
  let headerCells = '';
  if (Array.isArray(token.header)) {
    for (let i = 0; i < token.header.length; i++) {
      headerCells += (this as any).tablecell(token.header[i]);
    }
  }
  let bodyRows = '';
  if (Array.isArray(token.rows)) {
    for (let i = 0; i < token.rows.length; i++) {
      let rowContent = '';
      const row = token.rows[i];
      if (Array.isArray(row)) {
        for (let j = 0; j < row.length; j++) {
          rowContent += (this as any).tablecell(row[j]);
        }
      }
      bodyRows += (this as any).tablerow({ text: rowContent });
    }
  }
  const thead = `<thead class="bg-[var(--arc-block)] border-b border-[var(--arc-divider)] text-[var(--arc-text-primary)] font-semibold">${(this as any).tablerow({ text: headerCells })}</thead>`;
  const tbody = `<tbody class="divide-y divide-[var(--arc-divider)] text-[var(--arc-text-secondary)]">${bodyRows}</tbody>`;
  return `<div class="overflow-x-auto my-3 rounded-xl border border-[var(--arc-hairline)] bg-[var(--arc-plane)]"><table class="w-full text-left text-xs font-sans border-collapse">${thead}${tbody}</table></div>`;
};

(renderer as any).tablerow = function({ text }: any) {
  return `<tr class="hover:bg-[var(--arc-hover)] transition-colors">${text}</tr>`;
};

(renderer as any).tablecell = function(cell: any) {
  const alignClass = cell.align ? `text-${cell.align}` : 'text-left';
  const content = cell.tokens && this.parser ? this.parser.parseInline(cell.tokens) : (cell.text || '');
  if (cell.header) {
    return `<th class="py-2 px-3 font-semibold text-[var(--arc-text-primary)] ${alignClass}">${content}</th>`;
  }
  return `<td class="py-2 px-3 ${alignClass}">${content}</td>`;
};

(renderer as any).link = function({ href, text, tokens }: any) {
  const content = tokens && this.parser ? this.parser.parseInline(tokens) : (text || href);
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] hover:opacity-80 underline underline-offset-4 transition-all duration-200">${content}</a>`;
};

(renderer as any).list = function(token: any) {
  let body = '';
  if (Array.isArray(token.items)) {
    for (let i = 0; i < token.items.length; i++) {
      body += (this as any).listitem(token.items[i]);
    }
  }
  const tag = token.ordered ? 'ol' : 'ul';
  const start = token.ordered && token.start && token.start !== 1 ? ` start="${token.start}"` : '';
  const cls = token.ordered ? 'list-decimal ml-5 my-2 space-y-1' : 'list-disc ml-5 my-2 space-y-1';
  return `<${tag}${start} class="${cls}">${body}</${tag}>`;
};

(renderer as any).listitem = function(item: any) {
  const content = item.tokens && this.parser ? this.parser.parse(item.tokens) : (item.text || '');
  return `<li class="text-[var(--arc-text-primary)] leading-relaxed">${content}</li>`;
};

(renderer as any).paragraph = function({ tokens }: any) {
  const content = tokens && this.parser ? this.parser.parseInline(tokens) : '';
  return `<p class="mb-2.5 leading-relaxed text-[var(--arc-text-primary)]">${content}</p>`;
};

marked.use({ renderer });

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr',
    'th', 'td', 'a', 'span', 'div', 'button'
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'type', 'onclick'],
  ALLOW_DATA_ATTR: false
};

export function sanitizeRawContent(content: any): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'object') {
    if (content.text && typeof content.text === 'string') return content.text;
    if (content.content && typeof content.content === 'string') return content.content;
    if (content.message && typeof content.message === 'string') return content.message;
    return 'Информация получена, но формат структуры требует валидации.';
  }
  
  let text = String(content).trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  text = text.replace(/TOOL:\s*[\w:_-]+\s*\{[\s\S]*?\}/gi, '');
  text = text.replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, '');
  
  text = text.replace(/TOOL:\s*[\w:_-]+\s*\{[^}]*$/i, '');
  text = text.replace(/TOOL:\s*[\w:_-]+\s*$/i, '');
  text = text.replace(/TOOL:\s*$/i, '');
  
  text = text.trim();
  
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (parsed.response) return String(parsed.response);
        if (parsed.text) return String(parsed.text);
        if (parsed.content) return String(parsed.content);
        if (parsed.error) return `Ошибка: ${parsed.error}`;
        return 'Ответ обработан в структурированном виде.';
      }
    } catch {
      // Not valid JSON, keep standard text
    }
  }

  if (text.includes('[object Object]')) {
    return text.replace(/\[object Object\]/g, 'данные структуры');
  }

  return text;
}

export const parseMarkdown = (text: any): string => {
  const clean = sanitizeRawContent(text);
  if (!clean) return '';
  const rawHtml = marked.parse(clean) as string;
  const sanitizer = (DOMPurify as any)?.sanitize || (DOMPurify as any)?.default?.sanitize;
  return typeof sanitizer === 'function' ? sanitizer(rawHtml, PURIFY_CONFIG) : rawHtml;
};

/**
 * Strips code blocks, HTML pre/code elements, and technical noise from text intended for TTS voice synthesis.
 */
export function extractTextForTTS(content: any): string {
  const sanitized = sanitizeRawContent(content);
  if (!sanitized) return '';

  return sanitized
    // Exclude markdown code blocks with triple backticks ```...```
    .replace(/```[\s\S]*?```/g, ' ')
    // Exclude HTML <pre>...</pre> blocks including all code within
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    // Exclude HTML <code>...</code> blocks including all code within
    .replace(/<code[\s\S]*?<\/code>/gi, ' ')
    // Exclude remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Collapse excess whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

