import { ShortTermMessage } from '../../../shared/types/memory';

export class ContextCompressor {
  async compress(messages: ShortTermMessage[]): Promise<string> {
    // Basic summarization placeholder
    const summary = messages
      .map(m => `${m.role}: ${m.content.substring(0, 200)} [сжато]`)
      .join('\n');
    return `[Предыдущий диалог]:\n${summary}`;
  }
}
