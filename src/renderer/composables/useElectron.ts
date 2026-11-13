import { ref, onMounted } from 'vue';
import type { SystemInfo, ModuleStatus } from '../../shared/types/ipc';

export function useElectron() {
  const systemInfo = ref<SystemInfo | null>(null);
  const modulesStatus = ref<Record<string, ModuleStatus>>({});
  const files = ref<string[]>([]);

  const fetchSystemInfo = async () => {
    if (window.api) {
      systemInfo.value = await window.api.getSystemInfo();
    }
  };

  const fetchModulesStatus = async () => {
    if (window.api) {
      modulesStatus.value = await window.api.getModulesStatus();
    }
  };

  const fetchFiles = async () => {
    if (window.api) {
      files.value = await window.api.listFiles();
    }
  };

  onMounted(() => {
    fetchSystemInfo();
    fetchModulesStatus();
    fetchFiles();
  });

  return {
    systemInfo,
    modulesStatus,
    files,
    fetchSystemInfo,
    fetchModulesStatus,
    fetchFiles
  };
}
