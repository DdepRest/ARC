<script setup lang="ts">
import { computed } from 'vue';
import { useLocalAIEngine } from '../../composables/useLocalAIEngine';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsGroup from '../primitives/SettingsGroup.vue';
import SettingsBlock from '../primitives/SettingsBlock.vue';
import SettingsRow from '../primitives/SettingsRow.vue';
import CrossLink from '../primitives/CrossLink.vue';
import ArcToggle from '../../../../components/ui/ArcToggle.vue';
import BuiltinModelCard from './localAI/BuiltinModelCard.vue';
import OllamaEngineCard from './localAI/OllamaEngineCard.vue';
import { Cpu, Info } from 'lucide-vue-next';

import { formatCheckedAtTime } from '../../logic/provider-validation';

const {
  settingsStore,
  downloadStore,
  isOllamaOnline,
  checkingOllama,
  isBuiltinDownloaded,
  checkingBuiltin,
  builtinCheckError,
  downloadingBuiltin,
  lastOllamaModel,
  verifiedInference,
  isCurrentTargetVerified,
  isTargetVerified,
  isRunningTestInference,
  testInferenceOutput,
  testInferenceError,
  translations,
  computedModelSizeEstimate,
  formatBytes,
  checkOllama,
  downloadBuiltin,
  runTestInference
} = useLocalAIEngine();

const isBuiltinSelected = computed(() => settingsStore.localLLMModel === 'builtin');

const localHeaderStatus = computed(() => {
  if (!settingsStore.useLocalLLM) {
    return { label: 'ОТКЛЮЧЕН', tone: 'off' as const };
  }
  if (isBuiltinSelected.value) {
    if (downloadingBuiltin.value || downloadStore.isDownloading) {
      return { label: `ЗАГРУЗКА (${downloadStore.progressPercent}%)`, tone: 'warn' as const };
    }
    if (checkingBuiltin.value) return { label: 'ПРОВЕРКА GGUF...', tone: 'warn' as const };
    if (builtinCheckError.value) return { label: 'ОШИБКА GGUF', tone: 'err' as const };
    if (isCurrentTargetVerified.value) return { label: 'GGUF ПРОВЕРЕН', tone: 'ok' as const };
    return isBuiltinDownloaded.value
      ? { label: 'GGUF УСТАНОВЛЕН', tone: 'warn' as const }
      : { label: 'ТРЕБУЕТСЯ ЗАГРУЗКА', tone: 'warn' as const };
  }
  if (checkingOllama.value) return { label: 'ОПРОС OLLAMA...', tone: 'warn' as const };
  if (isOllamaOnline.value && isCurrentTargetVerified.value) return { label: 'OLLAMA ПРОВЕРЕН', tone: 'ok' as const };
  return isOllamaOnline.value
    ? { label: 'СЕРВЕР OLLAMA ОНЛАЙН', tone: 'warn' as const }
    : { label: 'OLLAMA ОФЛАЙН', tone: 'err' as const };
});

const selectedModelDisplay = computed(() => {
  if (isBuiltinSelected.value) {
    return (settingsStore.builtinLLMModel || 'LFM3-1.7B-Q4_K_M.gguf').replace('.gguf', '');
  }
  return lastOllamaModel.value || settingsStore.localLLMModel || 'llama3.2';
});

const engineReadinessDisplay = computed(() => {
  if (isBuiltinSelected.value) {
    if (downloadingBuiltin.value || downloadStore.isDownloading) {
      return { text: `Скачивание ${downloadStore.progressPercent}%`, cls: 'text-[var(--status-warn)]' };
    }
    if (checkingBuiltin.value) {
      return { text: 'Проверка файлов...', cls: 'text-[var(--status-warn)]' };
    }
    if (builtinCheckError.value) {
      return { text: 'Ошибка проверки', cls: 'text-[var(--status-err)]' };
    }
    if (isCurrentTargetVerified.value && verifiedInference.value) {
      const t = formatCheckedAtTime(verifiedInference.value.checkedAt);
      return { text: t ? `Инференс проверен (${t})` : 'Инференс проверен', cls: 'text-[var(--status-ok)]' };
    }
    return isBuiltinDownloaded.value
      ? { text: 'Веса на диске · тест не выполнен', cls: 'text-[var(--status-warn)]' }
      : { text: 'Веса не скачаны', cls: 'text-[var(--status-warn)]' };
  }
  if (checkingOllama.value) {
    return { text: 'Проверка порта 11434...', cls: 'text-[var(--status-warn)]' };
  }
  if (!isOllamaOnline.value) {
    return { text: 'Сервер недоступен', cls: 'text-[var(--status-err)]' };
  }
  if (isCurrentTargetVerified.value && verifiedInference.value) {
    const t = formatCheckedAtTime(verifiedInference.value.checkedAt);
    return { text: t ? `Сервер + инференс OK (${t})` : 'Сервер + инференс OK', cls: 'text-[var(--status-ok)]' };
  }
  return { text: 'Сервер онлайн · модель не проверена', cls: 'text-[var(--status-warn)]' };
});
</script>

<template>
  <section id="section-local" class="scroll-mt-14 flex flex-col gap-10 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + Сводка локального контура -->
    <SettingsSectionHeader 
      variant="workspace"
      categoryLabel="Интеллект · Подсистема 03"
      title="Локальный ИИ" 
      description="Автономные рантаймы инференса на процессоре и видеокарте: встроенный движок GGUF и интеграция с внешним сервером Ollama."
      :statusLabel="localHeaderStatus.label"
      :statusTone="localHeaderStatus.tone"
      blockCountText="2 рантайма исполнения"
      :icon="Cpu" 
    >
      <template #summary>
        <div 
          class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] font-mono text-xs tabular-nums"
          :style="{ boxShadow: 'var(--arc-well-shadow)' }"
        >
          <div class="flex flex-col gap-1 px-2.5">
            <span class="text-[var(--arc-text-hint)]">Локальный контур</span>
            <span class="text-sm font-semibold" :class="settingsStore.useLocalLLM ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'">
              {{ settingsStore.useLocalLLM ? 'АКТИВЕН' : 'ОТКЛЮЧЕН' }}
            </span>
          </div>
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Выбранный движок</span>
            <span class="text-sm font-semibold text-[var(--arc-text-primary)] truncate">
              {{ isBuiltinSelected ? 'Встроенный GGUF' : 'Внешний Ollama' }}
            </span>
          </div>
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Активная модель</span>
            <span class="text-sm font-semibold text-[var(--arc-text-primary)] truncate" :title="selectedModelDisplay">
              {{ selectedModelDisplay }}
            </span>
          </div>
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Готовность рантайма</span>
            <span class="text-sm font-semibold truncate" :class="engineReadinessDisplay.cls">
              {{ engineReadinessDisplay.text }}
            </span>
          </div>
        </div>
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Функциональная группа 1 — Управление локальным контуром -->
    <SettingsGroup
      indexLabel="01"
      title="Управление локальным контуром"
      description="Активация локального инференса на CPU/GPU и разрешение фоновой подгрузки весов моделей."
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <!-- Главный переключатель -->
          <SettingsRow
            id="localai.master"
            label="Главный переключатель локального ИИ"
            description="Разрешить обработку диалоговых запросов на вашем процессоре или видеокарте без передачи в облако."
            data-search="локальный движок use local llm offline офлайн"
          >
            <template #badge>
              <span 
                class="px-2 py-0.5 rounded text-xs font-mono font-semibold uppercase tracking-wider border"
                :class="settingsStore.useLocalLLM 
                  ? 'bg-[var(--arc-plane)] text-[var(--status-ok)] border-[var(--status-ok)]/30' 
                  : 'bg-[var(--arc-hover)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)]'"
              >
                {{ settingsStore.useLocalLLM ? 'АКТИВЕН' : 'ОТКЛЮЧЕН' }}
              </span>
            </template>
            <ArcToggle 
              v-model="settingsStore.useLocalLLM" 
              data-setting-id="localai.master"
            />
          </SettingsRow>

          <!-- Автозагрузка больших моделей (>500 МБ) -->
          <SettingsRow
            id="localai.autoDownloadLargeModels"
            label="Автозагрузка больших моделей (> 500 МБ)"
            description="Разрешить автоматическое фоновое скачивание тяжелых локальных моделей при недоступности облака."
            data-search="автоскачивание больших моделей auto download large models 500mb"
            data-setting-id="localai.autoDownloadLargeModels"
          >
            <ArcToggle 
              v-model="settingsStore.autoDownloadLargeModels" 
            />
          </SettingsRow>
        </div>

        <div class="px-4 sm:px-5 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]">
          <span class="text-xs text-[var(--arc-text-muted)]">
            Приоритет «Облако ↔ Локальная» и принудительный офлайн-режим настраиваются в разделе маршрутизации.
          </span>
          <CrossLink 
            label="Приоритеты и офлайн-режим" 
            tab="intelligence" 
            sectionId="section-router" 
          />
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Функциональная группа 2 — Движки исполнения -->
    <SettingsGroup
      indexLabel="02"
      title="Движки исполнения"
      description="Выберите активный рантайм локального инференса: встроенный GGUF или внешний сервер Ollama."
      :badgeText="isBuiltinSelected ? 'Выбран: GGUF' : 'Выбран: Ollama'"
    >
      <!-- Индикатор неактивного контура -->
      <div 
        v-if="!settingsStore.useLocalLLM"
        class="px-4 py-3 rounded-[14px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-between gap-3 text-xs"
      >
        <div class="flex items-center gap-2.5 text-[var(--arc-text-secondary)]">
          <Info class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
          <span>Локальный контур сейчас отключён. Клик по карточке любого движка ниже автоматически активирует его.</span>
        </div>
        <button
          type="button"
          @click="settingsStore.useLocalLLM = true"
          class="px-3 py-1.5 rounded-[8px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-primary)] uppercase tracking-wider cursor-pointer shrink-0 transition"
        >
          Включить контур
        </button>
      </div>

      <!-- Две колонки рядом на широких экранах (xl:grid-cols-2) -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch" :class="{ 'opacity-85': !settingsStore.useLocalLLM }">
        <!-- Модуль 1: Встроенный GGUF -->
        <BuiltinModelCard 
          id="settings.localai.builtin_engine"
          data-setting-id="settings.localai.builtin_engine"
          data-search="выбор локальной модели local llm model webgpu builtin встроенный движок gguf" 
          :settingsStore="settingsStore"
          :downloadStore="downloadStore"
          :translations="translations"
          :isBuiltinDownloaded="isBuiltinDownloaded"
          :checkingBuiltin="checkingBuiltin"
          :builtinCheckError="builtinCheckError"
          :isBuiltinVerified="isTargetVerified('builtin', settingsStore.builtinLLMModel)"
          :verifiedAt="isTargetVerified('builtin', settingsStore.builtinLLMModel) ? verifiedInference?.checkedAt : undefined"
          :downloadingBuiltin="downloadingBuiltin"
          :computedModelSizeEstimate="computedModelSizeEstimate"
          :formatBytes="formatBytes"
          :downloadBuiltin="downloadBuiltin"
          :runTestInference="() => runTestInference('builtin')"
          :isRunningTestInference="isRunningTestInference"
          :testInferenceOutput="testInferenceOutput"
          :testInferenceError="testInferenceError"
        />

        <!-- Модуль 2: Внешний Ollama -->
        <OllamaEngineCard 
          id="settings.localai.ollama_endpoint"
          data-setting-id="settings.localai.ollama_endpoint"
          data-search="ollama локальный движок сторонние local engine connection сервер ollama" 
          :settingsStore="settingsStore"
          :translations="translations"
          :isOllamaOnline="isOllamaOnline"
          :checkingOllama="checkingOllama"
          :isOllamaVerified="isTargetVerified('ollama', lastOllamaModel)"
          :verifiedAt="isTargetVerified('ollama', lastOllamaModel) ? verifiedInference?.checkedAt : undefined"
          :isRunningTestInference="isRunningTestInference"
          :runTestInference="() => runTestInference('ollama')"
          v-model:lastOllamaModel="lastOllamaModel"
          :checkOllama="checkOllama"
        />
      </div>

      <!-- Связанные разделы -->
      <div class="px-4 py-3 rounded-[14px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] flex flex-wrap items-center justify-between gap-3">
        <CrossLink 
          label="Подключить локальный сервер по IP (FreeAPILLM 127.0.0.1:3067)" 
          tab="intelligence" 
          sectionId="section-providers" 
        />
        <CrossLink 
          label="Менеджер весов и памяти (Model Hub)" 
          tab="intelligence" 
          sectionId="section-models" 
        />
      </div>
    </SettingsGroup>
  </section>
</template>
