import { ipcMain } from 'electron';
import { memoryManager } from '../services/memory/memory-manager';

export function registerMemoryHandlers() {
  ipcMain.handle('memory:getAll', async () => {
    return memoryManager.ltm.getAll();
  });

  ipcMain.handle('memory:getByKey', async (event, key: string) => {
    return memoryManager.ltm.getByKey(key);
  });

  ipcMain.handle('memory:delete', async (event, id: string) => {
    memoryManager.ltm.delete(id);
    return { success: true };
  });

  ipcMain.handle('memory:update', async (event, id: string, updates: any) => {
    if (!id || typeof id !== 'string') return { success: false, error: 'Invalid id' };
    const existing = memoryManager.ltm.getById(id);
    if (!existing) return { success: false, error: 'Not found' };
    
    if (updates && typeof updates === 'object' && !Array.isArray(updates)) {
      const allowedKeys = ['category', 'key', 'value', 'confidence', 'source'];
      for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          (existing as any)[key] = updates[key];
        }
      }
      existing.updated_at = Date.now();
    }
    
    await memoryManager.ltm.upsert(existing);
    return { success: true };
  });

  ipcMain.handle('memory:create', async (event, entryData: any) => {
    const newEntry = {
      id: entryData.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category: entryData.category || 'fact',
      key: entryData.key || 'Untitled Node',
      value: entryData.value || '',
      confidence: typeof entryData.confidence === 'number' ? entryData.confidence : 1.0,
      source: entryData.source || 'user_stated',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_accessed_at: Date.now(),
      access_count: 1
    };
    await memoryManager.ltm.upsert(newEntry as any);
    return { success: true, entry: newEntry };
  });

  ipcMain.handle('memory:search', async (event, query: string, category?: any) => {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return category && category !== 'all' 
        ? memoryManager.ltm.getByCategory(category) 
        : memoryManager.ltm.getAll();
    }
    return memoryManager.ltm.search(query, category && category !== 'all' ? { category } : undefined);
  });

  ipcMain.handle('memory:clearAll', async () => {
    const all = memoryManager.ltm.getAll();
    for (const item of all) {
      memoryManager.ltm.delete(item.id);
    }
    return { success: true };
  });

  ipcMain.handle('memory:import', async (_event, items: unknown) => {
    return memoryManager.ltm.importBatch(items);
  });

  ipcMain.handle('memory:getStats', async () => {
    const all = memoryManager.ltm.getAll();
    const categories = all.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const vectorCount = all.filter(item => item.embedding && Array.isArray(item.embedding) && item.embedding.length > 0).length;

    return {
      totalEntries: all.length,
      vectorCount,
      categories,
      recentBehaviorCount: memoryManager.bm.getRecentEvents(100).length
    };
  });
}
