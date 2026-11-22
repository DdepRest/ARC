import { ref, onMounted } from 'vue';
import type { SystemInfo, ModuleStatus, ModulesCapabilitySnapshot } from '../../shared/types/ipc';
import {
  createPendingCapabilitySnapshot,
  normalizeModulesCapabilityResponse
} from '../../shared/config/modules-capability.registry';

export function useElectron() {
  const systemInfo = ref<SystemInfo | null>(null);
  const modulesSnapshot = ref<ModulesCapabilitySnapshot>(
    createPendingCapabilitySnapshot('Ожидание проверки подсистем')
  );
  const modulesStatus = ref<Record<string, ModuleStatus>>(modulesSnapshot.value.legacyStatusMap);
  const files = ref<string[]>([]);

  const fetchSystemInfo = async () => {
    if (window.api) {
      systemInfo.value = await window.api.getSystemInfo();
    }
  };

  const fetchModulesStatus = async (refresh = false) => {
    if (window.api) {
      try {
        const res = await window.api.getModulesStatus(refresh ? { refresh: true } : undefined);
        const normalized = normalizeModulesCapabilityResponse(res);
        if (normalized) {
          modulesSnapshot.value = normalized;
          modulesStatus.value = normalized.legacyStatusMap;
        }
      } catch {
        const fallback = createPendingCapabilitySnapshot('Ошибка получения статуса подсистем', 'unknown');
        modulesSnapshot.value = fallback;
        modulesStatus.value = fallback.legacyStatusMap;
      }
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
    modulesSnapshot,
    files,
    fetchSystemInfo,
    fetchModulesStatus,
    fetchFiles
  };
}
