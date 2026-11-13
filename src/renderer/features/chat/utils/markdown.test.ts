import { describe, it, expect } from 'vitest';
import { parseMarkdown, extractTextForTTS } from './markdown';

describe('markdown.ts', () => {
  describe('code block renderer & copy selector', () => {
    it('renders code block with valid code-block-wrapper class and valid selector', () => {
      const md = '```python\nprint("hello")\n```';
      const html = parseMarkdown(md);
      expect(html).toContain('code-block-wrapper');
      expect(html).toContain("this.closest('.code-block-wrapper')");
      expect(html).not.toContain("this.closest('.group/code')");
      expect(html).not.toContain("this.closest('.group\\/code')");
    });
  });

  describe('extractTextForTTS', () => {
    it('removes triple-backtick markdown code blocks', () => {
      const input = 'Вот ваш скрипт:\n```bash\nnpm run build\n```\nУдачи в запуске!';
      const res = extractTextForTTS(input);
      expect(res).toBe('Вот ваш скрипт: Удачи в запуске!');
      expect(res).not.toContain('npm run build');
    });

    it('removes HTML pre and code blocks', () => {
      const input = 'Внимание: <pre><code>rm -rf /</code></pre> не запускайте это.';
      const res = extractTextForTTS(input);
      expect(res).toBe('Внимание: не запускайте это.');
      expect(res).not.toContain('rm -rf');
    });

    it('returns empty string if only code is provided', () => {
      const input = '```javascript\nconst x = 10;\n```';
      const res = extractTextForTTS(input);
      expect(res).toBe('');
    });
  });
});
