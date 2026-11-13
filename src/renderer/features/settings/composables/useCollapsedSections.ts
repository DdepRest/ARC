import { ref, watch } from 'vue';

const COLLAPSED_STORAGE_KEY = 'arc_settings_collapsed_sections';

const collapsedSections = ref<Set<string>>(new Set());

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

// Initialize from localStorage
try {
  const storage = getStorage();
  const stored = storage?.getItem(COLLAPSED_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      collapsedSections.value = new Set(parsed);
    }
  }
} catch (e) {
  console.warn('Failed to parse collapsed sections from localStorage', e);
}

// Watch and save to localStorage
watch(
  () => Array.from(collapsedSections.value),
  (newArray) => {
    try {
      getStorage()?.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(newArray));
    } catch (e) {
      console.warn('Failed to save collapsed sections', e);
    }
  },
  { deep: true }
);

export function useCollapsedSections() {
  const isCollapsed = (sectionId: string) => collapsedSections.value.has(sectionId);

  const toggleCollapsed = (sectionId: string) => {
    if (collapsedSections.value.has(sectionId)) {
      collapsedSections.value.delete(sectionId);
    } else {
      collapsedSections.value.add(sectionId);
    }
    collapsedSections.value = new Set(collapsedSections.value);
  };

  const expandSection = (sectionId: string) => {
    if (collapsedSections.value.has(sectionId)) {
      collapsedSections.value.delete(sectionId);
      collapsedSections.value = new Set(collapsedSections.value);
    }
  };

  return {
    isCollapsed,
    toggleCollapsed,
    expandSection,
  };
}
