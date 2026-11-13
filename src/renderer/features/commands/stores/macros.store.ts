import { defineStore } from 'pinia';
import { ref } from 'vue';

function isMacroIpcFailure(res: unknown): boolean {
  return res === false || (Boolean(res) && typeof res === 'object' && (res as any).success === false);
}

export const useMacrosStore = defineStore('macros', () => {
  const macros = ref<any[]>([]);
  const isEditorOpen = ref(false);
  const editingMacroId = ref<string | null>(null);

  async function fetchMacros() {
    try {
      macros.value = [...(await window.api.macrosList())];
    } catch (err) {
      console.error('Failed to fetch macros:', err);
    }
  }

  function openEditor(id: string | null = null) {
    editingMacroId.value = id;
    isEditorOpen.value = true;
  }

  function closeEditor() {
    isEditorOpen.value = false;
    editingMacroId.value = null;
    fetchMacros();
  }

  async function saveMacro(id: string, data: any) {
    try {
      const existing = await window.api.macrosLoad(id);
      if (existing && (existing as any).success !== false && existing.enabled !== undefined) {
        data.enabled = existing.enabled;
      } else if (data.enabled === undefined) {
        data.enabled = true;
      }
    } catch (e) {
      if (data.enabled === undefined) {
        data.enabled = true;
      }
    }
    const res = await window.api.macrosSave(id, data);
    const ok = !isMacroIpcFailure(res) && Boolean(res);
    if (ok) {
      await fetchMacros();
    }
    return ok;
  }

  async function deleteMacro(id: string) {
    const res = await window.api.macrosDelete(id);
    const ok = !isMacroIpcFailure(res) && Boolean(res);
    if (ok) {
      macros.value = macros.value.filter(m => m.id !== id);
    }
    return ok;
  }

  async function toggleMacro(id: string) {
    try {
      const loaded = await window.api.macrosLoad(id);
      if (isMacroIpcFailure(loaded)) {
        return false;
      }
      const data = loaded || {};
      data.enabled = data.enabled === false ? true : false;
      const res = await window.api.macrosSave(id, data);
      const ok = !isMacroIpcFailure(res) && Boolean(res);
      if (ok) {
        await fetchMacros();
      }
      return ok;
    } catch (err) {
      console.error('Failed to toggle macro:', err);
      return false;
    }
  }

  return {
    macros,
    isEditorOpen,
    editingMacroId,
    fetchMacros,
    openEditor,
    closeEditor,
    saveMacro,
    deleteMacro,
    toggleMacro
  };
});
