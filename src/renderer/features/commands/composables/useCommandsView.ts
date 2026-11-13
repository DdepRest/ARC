import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '../../settings/stores/settings.store';
import { useSkillsStore } from '../stores/skills.store';
import { useLauncherStore } from '../stores/launcher.store';
import { useMacrosStore } from '../stores/macros.store';

export function useCommandsView() {
  const settingsStore = useSettingsStore();
  const skillsStore = useSkillsStore();
  const launcherStore = useLauncherStore();
  const macrosStore = useMacrosStore();

  const { skills, loading } = storeToRefs(skillsStore);
  const { folders, indexing } = storeToRefs(launcherStore);
  const { macros } = storeToRefs(macrosStore);

  const tabs = [
    { id: 'skills', label: 'Навыки' },
    { id: 'launcher', label: 'Лаунчер' }
  ];

  const activeTab = ref('skills');
  const activeCmdId = ref<string | null>(null);
  const openMenuCmdId = ref<string | null>(null);
  const newTrigger = ref('');

  const searchQuery = ref('');
  const importFileInput = ref<HTMLInputElement | null>(null);

  const macroPendingDeleteId = ref<string | null>(null);
  let deleteTimeout: any = null;

  const lastDeletedMacro = ref<{ id: string; data: any; title: string; timer: any } | null>(null);

  const deleteMacroWithUndo = async (id: string, title: string) => {
    try {
      const data = await window.api.macrosLoad(id);
      if (!data || (typeof data === 'object' && (data as any).success === false)) return;

      if (lastDeletedMacro.value) {
        if (lastDeletedMacro.value.timer) {
          window.clearTimeout(lastDeletedMacro.value.timer);
        }
        await window.api.macrosDelete(lastDeletedMacro.value.id);
      }

      // Snappily remove from local view state first
      macrosStore.macros = macrosStore.macros.filter((m: any) => m.id !== id);

      const timer = window.setTimeout(async () => {
        await window.api.macrosDelete(id);
        if (lastDeletedMacro.value?.id === id) {
          lastDeletedMacro.value = null;
        }
      }, 4000);

      lastDeletedMacro.value = {
        id,
        data,
        title,
        timer
      };
    } catch (err) {
      console.error('Failed to prepare macro undo delete:', err);
      macrosStore.deleteMacro(id);
    }
  };

  const undoDelete = async () => {
    if (!lastDeletedMacro.value) return;
    const { id, data, timer } = lastDeletedMacro.value;
    if (timer) {
      window.clearTimeout(timer);
    }
    await window.api.macrosSave(id, data);
    lastDeletedMacro.value = null;
    await macrosStore.fetchMacros();
  };

  const finalizeDelete = async () => {
    if (!lastDeletedMacro.value) return;
    const { id, timer } = lastDeletedMacro.value;
    if (timer) {
      window.clearTimeout(timer);
    }
    await window.api.macrosDelete(id);
    lastDeletedMacro.value = null;
  };

  const requestDeleteMacro = (id: string, title: string) => {
    if (macroPendingDeleteId.value === id) {
      if (deleteTimeout) {
        window.clearTimeout(deleteTimeout);
        deleteTimeout = null;
      }
      deleteMacroWithUndo(id, title);
      macroPendingDeleteId.value = null;
    } else {
      macroPendingDeleteId.value = id;
      if (deleteTimeout) {
        window.clearTimeout(deleteTimeout);
      }
      deleteTimeout = window.setTimeout(() => {
        if (macroPendingDeleteId.value === id) {
          macroPendingDeleteId.value = null;
        }
      }, 3000);
    }
  };

  onBeforeUnmount(() => {
    if (deleteTimeout) {
      window.clearTimeout(deleteTimeout);
      deleteTimeout = null;
    }
    if (lastDeletedMacro.value) {
      if (lastDeletedMacro.value.timer) {
        window.clearTimeout(lastDeletedMacro.value.timer);
      }
      window.api.macrosDelete(lastDeletedMacro.value.id).catch((err: any) => console.error(err));
      lastDeletedMacro.value = null;
    }
  });

  const filteredMacros = computed(() => {
    if (!searchQuery.value) return macros.value;
    const lower = searchQuery.value.toLowerCase();
    return macros.value.filter(m => 
      (m.title?.toLowerCase().includes(lower)) || 
      (m.desc?.toLowerCase().includes(lower)) ||
      (m.triggers && m.triggers.some((t: string) => t.toLowerCase().includes(lower)))
    );
  });

  const filteredSkills = computed(() => {
    if (!searchQuery.value) return skills.value;
    const lower = searchQuery.value.toLowerCase();
    return (skills.value || []).filter(s => 
      (s.title?.toLowerCase().includes(lower)) || 
      (s.desc?.toLowerCase().includes(lower)) ||
      (s.triggers && s.triggers.some((t: string) => t.toLowerCase().includes(lower)))
    );
  });

  const cloneMacro = async (id: string) => {
    const data = await window.api.macrosLoad(id);
    if (data && (data as any).success !== false) {
      const newId = `macro-${Date.now()}`;
      data.name = `${data.name || 'Macro'} (Копия)`;
      const res = await window.api.macrosSave(newId, data);
      if (res === false || (res && typeof res === 'object' && (res as any).success === false)) return;
      macrosStore.fetchMacros();
    }
  };

  const exportMacro = async (id: string) => {
    const data = await window.api.macrosLoad(id);
    if (data && (data as any).success !== false) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.name || id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const exportAllMacros = async () => {
    try {
      const list = macros.value;
      const fullMacros: any[] = [];
      for (const m of list) {
        const data = await window.api.macrosLoad(m.id);
        if (data && (data as any).success !== false) {
          fullMacros.push({ id: m.id, data });
        }
      }
      const bundle = {
        version: '1.0',
        type: 'arc-macros-bundle',
        macros: fullMacros
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arc-commands-all-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export all macros:', err);
    }
  };

  const triggerImport = () => {
    importFileInput.value?.click();
  };

  const handleImportMacro = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = ev.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && parsed.type === 'arc-macros-bundle' && Array.isArray(parsed.macros)) {
          for (const item of parsed.macros) {
            if (item && item.data) {
              const id = item.id || `macro-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              const res = await window.api.macrosSave(id, item.data);
              if (res === false || (res && typeof res === 'object' && (res as any).success === false)) {
                continue;
              }
            }
          }
        } else {
          const newId = `macro-${Date.now()}`;
          const res = await window.api.macrosSave(newId, parsed);
          if (res === false || (res && typeof res === 'object' && (res as any).success === false)) {
            if (importFileInput.value) importFileInput.value.value = '';
            return;
          }
        }
        await macrosStore.fetchMacros();
      } catch (err) {
        console.error('Failed to import macro:', err);
      }
      if (importFileInput.value) importFileInput.value.value = '';
    };
    reader.readAsText(file);
  };

  const handleAddTrigger = (id: string) => {
    if (newTrigger.value.trim()) {
      skillsStore.addTrigger(id, newTrigger.value.trim());
      newTrigger.value = '';
    }
  };

  onMounted(() => {
    skillsStore.fetchSkills();
    launcherStore.fetchFolders();
    macrosStore.fetchMacros();
  });

  return {
    settingsStore,
    skillsStore,
    launcherStore,
    macrosStore,
    skills,
    loading,
    folders,
    indexing,
    macros,
    tabs,
    activeTab,
    activeCmdId,
    openMenuCmdId,
    newTrigger,
    searchQuery,
    importFileInput,
    macroPendingDeleteId,
    lastDeletedMacro,
    filteredMacros,
    filteredSkills,
    requestDeleteMacro,
    undoDelete,
    finalizeDelete,
    cloneMacro,
    exportMacro,
    exportAllMacros,
    triggerImport,
    handleImportMacro,
    handleAddTrigger
  };
}
