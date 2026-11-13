import { ref, computed, watch } from 'vue';
import settingsRegistry from '../../../../../docs/ui-inventory/settings-registry.json';

const COMPACT_STORAGE_KEY = 'arc_settings_compact_mode';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Module-level state: Default to true (Compact mode: hide setup-once & debug-only)
const isCompactMode = ref<boolean>(true);

// Initialize persisted state
try {
  const saved = getStorage()?.getItem(COMPACT_STORAGE_KEY);
  if (saved !== null && saved !== undefined) {
    isCompactMode.value = saved === 'true';
  }
} catch (e) {
  console.warn('Failed to load compact mode setting:', e);
}

// Watch and persist
watch(isCompactMode, (val) => {
  try {
    getStorage()?.setItem(COMPACT_STORAGE_KEY, String(val));
    if (typeof document !== 'undefined' && document.documentElement) {
      if (val) {
        document.documentElement.classList.add('arc-settings-compact');
      } else {
        document.documentElement.classList.remove('arc-settings-compact');
      }
    }
  } catch (e) {
    console.warn('Failed to save compact mode setting:', e);
  }
}, { immediate: true });

// Build lookup maps for fast access
const frequencyById = new Map<string, string>();
const frequencyByStoreKey = new Map<string, string>();

if (settingsRegistry && Array.isArray((settingsRegistry as any).settings)) {
  for (const item of (settingsRegistry as any).settings) {
    if (item.id) frequencyById.set(item.id, item.frequency);
    if (item.storeKey) frequencyByStoreKey.set(item.storeKey, item.frequency);
  }
}

export function useSettingsVisibility() {
  function isControlVisible(idOrKey: string): boolean {
    if (!isCompactMode.value) return true;
    const freq = frequencyById.get(idOrKey) || frequencyByStoreKey.get(idOrKey);
    if (!freq) return true;
    return freq !== 'setup-once' && freq !== 'debug-only';
  }

  function toggleCompactMode() {
    isCompactMode.value = !isCompactMode.value;
  }

  function setCompactMode(val: boolean) {
    isCompactMode.value = val;
  }

  const visibleControlsCount = computed(() => {
    if (!settingsRegistry || !Array.isArray((settingsRegistry as any).settings)) return 88;
    if (!isCompactMode.value) return (settingsRegistry as any).settings.length;
    return (settingsRegistry as any).settings.filter((s: any) => 
      s.frequency !== 'setup-once' && s.frequency !== 'debug-only'
    ).length;
  });

  const totalControlsCount = computed(() => {
    if (!settingsRegistry || !Array.isArray((settingsRegistry as any).settings)) return 88;
    return (settingsRegistry as any).settings.length;
  });

  return {
    isCompactMode,
    isControlVisible,
    toggleCompactMode,
    setCompactMode,
    visibleControlsCount,
    totalControlsCount,
    frequencyById,
    frequencyByStoreKey
  };
}
