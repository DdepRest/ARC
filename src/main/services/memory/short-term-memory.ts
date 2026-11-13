import { ShortTermMessage } from '../../../shared/types/memory';

export class ShortTermMemory {
  private messages: ShortTermMessage[] = [];
  public readonly MAX_MESSAGES = 20;

  async addMessage(msg: ShortTermMessage): Promise<void> {
    // Trim overly long messages here as an option, but let's just push it.
    let content = msg.content;
    if (content.length > 3000) {
      content = content.substring(0, 1000) + '\n[...сжато...]\n' + content.substring(content.length - 1000);
    }
    
    this.messages.push({ ...msg, content });

    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages.shift(); // remove oldest
    }
  }

  async getRecentMessages(count: number): Promise<ShortTermMessage[]> {
    return this.messages.slice(-Math.min(count, this.messages.length));
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}
