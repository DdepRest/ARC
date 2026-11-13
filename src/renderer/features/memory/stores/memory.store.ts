import { defineStore } from 'pinia';
import { LongTermMemoryEntry } from '@shared/types/memory';

export const useMemoryStore = defineStore('memory', {
  state: () => ({
    entries: [] as LongTermMemoryEntry[],
    loading: false,
    searchLoading: false,
    stats: {
      totalEntries: 0,
      vectorCount: 0,
      categories: {} as Record<string, number>,
      recentBehaviorCount: 0
    }
  }),
  actions: {
    async fetchAll() {
      this.loading = true;
      try {
        this.entries = await window.api.memoryGetAll();
      } catch (e) {
        console.error("Failed to fetch memory", e);
      } finally {
        this.loading = false;
      }
    },
    async searchEntries(query: string, category?: string) {
      if (!query || !query.trim()) {
        await this.fetchAll();
        return;
      }
      this.searchLoading = true;
      try {
        this.entries = await window.api.memorySearch(query, category);
      } catch (e) {
        console.error("Failed to perform semantic search", e);
      } finally {
        this.searchLoading = false;
      }
    },
    async createEntry(data: Partial<LongTermMemoryEntry>) {
      this.loading = true;
      try {
        const response = await window.api.memoryCreate(data);
        if (response.success && response.entry) {
          this.entries.unshift(response.entry);
          await this.fetchStats();
          return response.entry;
        }
      } catch (e) {
        console.error("Failed to create memory entry", e);
      } finally {
        this.loading = false;
      }
      return null;
    },
    async updateEntry(id: string, updates: Partial<LongTermMemoryEntry>) {
      this.loading = true;
      try {
        const response = await window.api.memoryUpdate(id, updates);
        if (response.success) {
          const index = this.entries.findIndex(e => e.id === id);
          if (index !== -1) {
            this.entries[index] = { ...this.entries[index], ...updates, updated_at: Date.now() };
          }
          await this.fetchStats();
          return true;
        }
      } catch (e) {
        console.error("Failed to update memory entry", e);
      } finally {
        this.loading = false;
      }
      return false;
    },
    async deleteEntry(id: string) {
      this.loading = true;
      try {
        const response = await window.api.memoryDelete(id);
        if (response.success) {
          this.entries = this.entries.filter(e => e.id !== id);
          await this.fetchStats(); // Update stats after delete
        }
      } catch (e) {
        console.error("Failed to delete memory entry", e);
      } finally {
        this.loading = false;
      }
    },
    async clearAll() {
      this.loading = true;
      try {
        const response = await window.api.memoryClearAll();
        if (response.success) {
          this.entries = [];
          await this.fetchStats();
        }
      } catch (e) {
        console.error("Failed to clear memory", e);
      } finally {
        this.loading = false;
      }
    },
    async importEntries(items: Partial<LongTermMemoryEntry>[]): Promise<{ success: boolean; importedCount: number; error?: string }> {
      this.loading = true;
      try {
        if (typeof (window as any).api?.memoryImport === 'function') {
          const result = await (window as any).api.memoryImport(items);
          if (result && result.success) {
            await this.fetchAll();
            await this.fetchStats();
          }
          return result || { success: false, importedCount: 0, error: 'Неизвестная ошибка импорта' };
        }
        for (const item of items) {
          await window.api.memoryCreate(item);
        }
        await this.fetchAll();
        await this.fetchStats();
        return { success: true, importedCount: items.length };
      } catch (e: any) {
        console.error("Failed to import memory entries", e);
        return { success: false, importedCount: 0, error: e?.message || String(e) };
      } finally {
        this.loading = false;
      }
    },
    async fetchStats() {
      try {
        this.stats = await window.api.memoryGetStats();
      } catch (e) {
        console.error("Failed to fetch memory stats", e);
      }
    }
  }
});
