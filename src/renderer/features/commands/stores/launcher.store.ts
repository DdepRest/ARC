import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useSettingsStore } from '../../settings/stores/settings.store';

export interface LauncherSearchResultItem {
  name: string;
  path: string;
  type: 'exe' | 'lnk' | 'bat' | 'cmd';
  folder: string;
}

export const useLauncherStore = defineStore('launcher', () => {
  const folders = ref<string[]>([]);
  const indexing = ref(false);
  const searchQuery = ref('');
  const searchResults = ref<LauncherSearchResultItem[]>([]);
  const isSearching = ref(false);
  const lastIndexedCount = ref<number | null>(null);

  async function fetchFolders() {
    try {
      folders.value = await window.api.launcherGetFolders();
      await search(searchQuery.value);
    } catch (err) {
      console.error('Failed to fetch launcher folders:', err);
    }
  }

  async function search(query: string = searchQuery.value) {
    searchQuery.value = query;
    if (!window.api?.launcherSearch) return;
    isSearching.value = true;
    try {
      const response = await window.api.launcherSearch({ query, limit: 20 });
      searchResults.value = Array.isArray(response?.results) ? response.results : [];
    } catch (err) {
      console.error('Failed to search launcher index:', err);
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  }

  async function addFolder() {
    const newFolder = await window.api.launcherAddFolder();
    if (newFolder) {
      if (!folders.value.includes(newFolder)) {
        folders.value.push(newFolder);
      }
      await search(searchQuery.value);
    }
  }

  async function removeFolder(path: string) {
    const success = await window.api.launcherRemoveFolder(path);
    if (success) {
      folders.value = folders.value.filter((f) => f !== path);
      await search(searchQuery.value);
    }
  }

  async function refreshIndex() {
    indexing.value = true;
    const settingsStore = useSettingsStore();
    try {
      const res = await window.api.launcherRefreshIndex();
      if (res && typeof res === 'object' && res.success) {
        lastIndexedCount.value = typeof res.indexed === 'number' ? res.indexed : 0;
        const msg =
          res.note === 'no_folders'
            ? 'Нет доверенных директорий для индексации'
            : `Индекс обновлён: ${lastIndexedCount.value} прил.`;
        settingsStore.triggerSyncToast(msg, () => {});
        await search(searchQuery.value);
      } else {
        const errText = (res as any)?.error || 'Не удалось обновить индекс';
        settingsStore.triggerSyncToast(errText, () => {});
      }
    } catch (err) {
      console.error('Failed to refresh index:', err);
      settingsStore.triggerSyncToast('Ошибка обновления индекса лаунчера', () => {});
    } finally {
      indexing.value = false;
    }
  }

  async function launchApp(targetPath: string) {
    if (!window.api?.launcherLaunch) return { success: false, error: 'API unavailable' };
    const settingsStore = useSettingsStore();
    try {
      const res = await window.api.launcherLaunch(targetPath);
      if (res?.success) {
        settingsStore.triggerSyncToast('Приложение запущено', () => {});
      } else {
        settingsStore.triggerSyncToast(res?.error || 'Не удалось запустить приложение', () => {});
      }
      return res;
    } catch (err: any) {
      const msg = err?.message || 'Ошибка запуска приложения';
      settingsStore.triggerSyncToast(msg, () => {});
      return { success: false, error: msg };
    }
  }

  return {
    folders,
    indexing,
    searchQuery,
    searchResults,
    isSearching,
    lastIndexedCount,
    fetchFolders,
    addFolder,
    removeFolder,
    refreshIndex,
    search,
    launchApp,
  };
});

