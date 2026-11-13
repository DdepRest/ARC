import { ToolDefinition, ToolInstance, ToolResult } from '../../../shared/types/tools';
import { memoryManager } from '../memory/memory-manager';

export class MemorySearchTool implements ToolInstance {
  definition: ToolDefinition = {
    name: 'memory:search',
    description: 'Search through accumulated long-term user memory, preferences, notes, and facts.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or entity to look up in user memory'
        }
      },
      required: ['query']
    }
  };

  async execute(params: { query: string }): Promise<ToolResult> {
    const { query } = params;
    if (!query) return { success: false, error: 'No query provided', toolName: this.definition.name };

    try {
      const results = await memoryManager.ltm.search(query);
      if (!results || results.length === 0) {
        return {
          success: true,
          data: 'Записей не найдено.',
          toolName: this.definition.name
        };
      }
      
      const topResults = results.slice(0, 5).map(r => ({
        key: r.key,
        value: r.value,
        category: r.category,
        confidence: r.confidence,
        similarity: r.similarity
      }));

      return {
        success: true,
        data: topResults,
        toolName: this.definition.name
      };
    } catch (e: any) {
      console.error(`[MemorySearchTool] Error:`, e);
      return { success: false, error: e.message, toolName: this.definition.name };
    }
  }
}
