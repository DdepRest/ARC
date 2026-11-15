<template>
  <section id="section-app-updates" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 08"
      title="Обновления системы"
      description="Проверка актуальности версии A.R.C., канала дистрибуции и переход к полному журналу релизов."
      :statusLabel="headerStatus.label"
      :statusTone="headerStatus.tone"
      blockCountText="1 функциональная группа"
      :icon="RefreshCw"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Версия и дистрибутив -->
    <SettingsGroup
      indexLabel="01"
      title="Версия и дистрибутив"
      description="Синхронизация с каналом GitHub Releases и проверка наличия новых сборок."
      :badgeText="`v${currentVersion}`"
    >
      <SettingsBlock>
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
        <div v-if="checkState === 'up-to-date'" class="mx-4 sm:mx-5 mb-4 p-3 rounded-[10px] bg-[var(--arc-well)] border border-[var(--status-ok)]/40 flex items-center gap-2.5 text-xs font-mono text-[var(--status-ok)]">
          <CheckCircle2 class="w-4 h-4 shrink-0" />
          <span>Установлена последняя версия (v{{ currentVersion }}). Обновлений не требуется.</span>
        </div>

        <!-- Error status -->
        <div v-else-if="checkState === 'error'" class="mx-4 sm:mx-5 mb-4 p-3 rounded-[10px] bg-[var(--arc-well)] border border-[var(--status-err)]/40 flex items-center gap-2.5 text-xs font-mono text-[var(--status-err)]">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span>{{ errorMessage || 'Не удалось проверить обновления (проверьте сеть).' }}</span>
        </div>

        <!-- Update available banner -->
        <div v-else-if="checkState === 'update-available'" class="mx-4 sm:mx-5 mb-4 p-4 rounded-[12px] bg-[var(--arc-well)] border border-[rgba(var(--accent-rgb),0.35)] flex flex-col gap-3">
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

        <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
          <span class="text-xs font-mono text-[var(--arc-text-machine)]">
            Подробная хронология всех сборок и чеклист физ-тестирования:
          </span>
          <CrossLink tab="updates" sectionId="section-updates-latest" label="Открыть вкладку Обновления → История релизов" />
        </div>
      </SettingsBlock>
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RefreshCw, Download, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-vue-next';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import CrossLink from '../../primitives/CrossLink.vue';

const currentVersion = ref('1.0.12');
const isChecking = ref(false);
const checkState = ref<'idle' | 'up-to-date' | 'update-available' | 'error'>('idle');
const latestVersion = ref('');
const changelog = ref('');
const downloadUrl = ref('');
const errorMessage = ref('');

const headerStatus = computed(() => {
  if (isChecking.value) return { label: 'ПРОВЕРКА...', tone: 'warn' as const };
  if (checkState.value === 'update-available') return { label: `ДОСТУПНО v${latestVersion.value}`, tone: 'warn' as const };
  if (checkState.value === 'up-to-date') return { label: `АКТУАЛЬНО · v${currentVersion.value}`, tone: 'ok' as const };
  if (checkState.value === 'error') return { label: 'ОШИБКА СЕТИ', tone: 'err' as const };
  return { label: `v${currentVersion.value}`, tone: 'accent' as const };
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Текущая версия',
    value: `v${currentVersion.value}`,
    detail: 'Установленная сборка ядра',
    tone: 'accent'
  },
  {
    label: 'Канал релизов',
    value: 'GitHub Releases',
    detail: 'Стабильная ветка DdepRest/ARC',
    tone: 'default'
  },
  {
    label: 'Статус проверки',
    value: isChecking.value
      ? 'Проверка...'
      : checkState.value === 'up-to-date'
      ? 'Актуально'
      : checkState.value === 'update-available'
      ? `Доступна v${latestVersion.value}`
      : checkState.value === 'error'
      ? 'Сбой проверки'
      : 'Не проверялось',
    detail: isChecking.value ? 'Опрос сервера...' : 'Проверка вручную по кнопке',
    tone: isChecking.value ? 'warn' : checkState.value === 'up-to-date' ? 'ok' : checkState.value === 'error' ? 'err' : checkState.value === 'update-available' ? 'warn' : 'off'
  },
  {
    label: 'Журнал изменений',
    value: 'Раздел Обновления',
    detail: 'Полная хронология версий',
    tone: 'default'
  }
]);

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
