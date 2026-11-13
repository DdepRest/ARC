<template>
  <section id="section-app-updates" class="scroll-mt-14 flex flex-col gap-5 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Обновления системы" 
      description="Проверка актуальности версии A.R.C., журнала изменений и получение свежих релизов."
      blockCountText="1 блок · релизы"
      :icon="RefreshCw" 
    />

    <SettingsBlock title="Версия и дистрибутив" subtitle="Канал релизов GitHub Releases">
      <SettingsRow
        id="general.app.updates"
        label="Проверка обновлений A.R.C."
        :description="`Текущая установленная версия: v${currentVersion}`"
        data-search="обновление версия релиз github update changelog check"
      >
        <button
          type="button"
          :disabled="isChecking"
          @click="checkUpdates"
          class="px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono font-medium text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] hover:border-[rgba(var(--accent-rgb),0.4)] transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw class="w-3.5 h-3.5 text-[var(--accent)]" :class="{ 'animate-spin': isChecking }" />
          <span>{{ isChecking ? 'Проверка...' : 'Проверить обновления' }}</span>
        </button>
      </SettingsRow>

      <!-- Up to date status -->
      <div v-if="checkState === 'up-to-date'" class="mx-4 sm:mx-6 mb-4 p-3 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--status-ok)]/40 flex items-center gap-2.5 text-xs font-mono text-[var(--status-ok)]">
        <CheckCircle2 class="w-4 h-4 shrink-0" />
        <span>Установлена последняя версия (v{{ currentVersion }}). Обновлений не требуется.</span>
      </div>

      <!-- Error status -->
      <div v-else-if="checkState === 'error'" class="mx-4 sm:mx-6 mb-4 p-3 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--status-err)]/40 flex items-center gap-2.5 text-xs font-mono text-[var(--status-err)]">
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span>{{ errorMessage || 'Не удалось проверить обновления (проверьте сеть).' }}</span>
      </div>

      <!-- Update available banner -->
      <div v-else-if="checkState === 'update-available'" class="mx-4 sm:mx-6 mb-4 p-4 rounded-[12px] bg-[var(--arc-block)] border border-[rgba(var(--accent-rgb),0.35)] flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-xs font-mono font-semibold text-[var(--accent)]">
            <Download class="w-4 h-4 shrink-0" />
            <span>Доступна новая версия: v{{ latestVersion }}</span>
          </div>
          <button
            v-if="downloadUrl"
            type="button"
            @click="openDownloadUrl"
            class="px-3.5 py-1.5 rounded-[8px] bg-[var(--accent)] text-black font-mono font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 transition cursor-pointer shrink-0"
          >
            <span>Скачать обновление</span>
            <ExternalLink class="w-3.5 h-3.5" />
          </button>
        </div>

        <div v-if="changelog" class="flex flex-col gap-1.5">
          <span class="text-xs font-mono text-[var(--arc-text-secondary)]">Журнал изменений:</span>
          <pre class="text-xs font-mono whitespace-pre-wrap text-[var(--arc-text-secondary)] max-h-48 overflow-y-auto arc-scroll bg-[var(--arc-plane)] p-3 rounded-[8px] border border-[var(--arc-hairline)]">{{ changelog }}</pre>
        </div>
      </div>
    </SettingsBlock>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RefreshCw, Download, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';

const currentVersion = ref('1.0.12');
const isChecking = ref(false);
const checkState = ref<'idle' | 'up-to-date' | 'update-available' | 'error'>('idle');
const latestVersion = ref('');
const changelog = ref('');
const downloadUrl = ref('');
const errorMessage = ref('');

onMounted(async () => {
  if (window.api && typeof window.api.getAppVersion === 'function') {
    try {
      const ver = await window.api.getAppVersion();
      if (ver) currentVersion.value = ver;
    } catch {
      // Keep default
    }
  }
});

async function checkUpdates() {
  if (isChecking.value) return;
  if (!window.api || typeof window.api.checkForUpdates !== 'function') {
    checkState.value = 'error';
    errorMessage.value = 'Канал проверки обновлений недоступен в текущей среде.';
    return;
  }

  isChecking.value = true;
  errorMessage.value = '';

  try {
    const res = await window.api.checkForUpdates();
    if (res && res.success) {
      if (res.currentVersion) currentVersion.value = res.currentVersion;
      if (res.hasUpdate) {
        checkState.value = 'update-available';
        latestVersion.value = res.latestVersion || '';
        changelog.value = res.changelog || '';
        downloadUrl.value = res.downloadUrl || '';
      } else {
        checkState.value = 'up-to-date';
      }
    } else {
      checkState.value = 'error';
      errorMessage.value = res?.error || 'Не удалось проверить обновления (проверьте сеть).';
    }
  } catch (err: any) {
    checkState.value = 'error';
    errorMessage.value = err?.message || 'Не удалось проверить обновления (проверьте сеть).';
  } finally {
    isChecking.value = false;
  }
}

function openDownloadUrl() {
  if (downloadUrl.value) {
    window.open(downloadUrl.value, '_blank', 'noopener,noreferrer');
  }
}
</script>
