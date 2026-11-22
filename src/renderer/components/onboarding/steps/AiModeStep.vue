<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAiConfigStore, type AIProvider } from '../../../stores/aiConfig';
import { useSettingsStore } from '../../../features/settings/stores/settings.store';
import {
  LOCAL_RUNTIME_OPTIONS,
  CLOUD_PRESET_OPTIONS,
  normalizeGatewayEndpoint,
  type LocalRuntimeId
} from '../utils/ai-mode-presets';
import ArcSelect from '../../ui/ArcSelect.vue';
import { saveAiStepSelection } from '../utils/wizard-save';
import { persistLocalGatewayConfig, persistCloudContourConfig } from '../utils/ai-step-persistence';

const emit = defineEmits<{ (e: 'skip-step'): void }>();

const aiConfigStore = useAiConfigStore();
const settingsStore = useSettingsStore();

type ContourId = 'openrouter' | 'gemini' | 'local';
type KeyCheckStatus = 'verified' | 'unverified' | 'skipped';

const selectedContour = ref<ContourId>('openrouter');
const selectedCloudPresetId = ref<string>('openrouter');
const apiKey = ref('');
const showApiKey = ref(false);
const keyStatus = ref<KeyCheckStatus>('unverified');
const statusMessage = ref('');
const isTesting = ref(false);

const localRuntime = ref<LocalRuntimeId>('freellmapi');
const localGatewayEndpoint = ref('http://127.0.0.1:31415/v1/chat/completions');
const localGatewayModel = ref('auto');

const contours = [
  { id: 'openrouter' as const, code: 'CLOUD API', title: 'Облачные API', tagline: 'OpenRouter, Groq, DeepSeek, NIM и др.' },
  { id: 'gemini' as const, code: 'GEMINI', title: 'Gemini', tagline: 'Прямой мультимодальный контур' },
  { id: 'local' as const, code: 'LOCAL / FREE', title: 'Локальный / Free', tagline: 'FreeLLMAPI, FreeAPILLM, Ollama, GGUF' }
];

const activeCloudPreset = computed(() => {
  if (selectedContour.value === 'gemini') {
    return CLOUD_PRESET_OPTIONS.find(p => p.id === 'gemini') || CLOUD_PRESET_OPTIONS[0];
  }
  return CLOUD_PRESET_OPTIONS.find(p => p.id === selectedCloudPresetId.value) || CLOUD_PRESET_OPTIONS[0];
});

const activeLocalOption = computed(
  () => LOCAL_RUNTIME_OPTIONS.find(o => o.id === localRuntime.value) || LOCAL_RUNTIME_OPTIONS[0]
);

const statusBadge = computed(() => {
  if (keyStatus.value === 'verified') {
    return { label: 'проверен', classes: 'border-[var(--status-ok)] text-[var(--status-ok)] bg-[var(--arc-plane)]', dot: 'bg-[var(--status-ok)]' };
  }
  if (keyStatus.value === 'skipped') {
    return { label: 'пропущен', classes: 'border-[var(--arc-hairline)] text-[var(--arc-text-muted)] bg-[var(--arc-plane)]', dot: 'bg-[var(--arc-text-muted)]' };
  }
  return { label: 'не проверен', classes: 'border-[var(--status-warn)] text-[var(--status-warn)] bg-[var(--arc-plane)]', dot: 'bg-[var(--status-warn)]' };
});

onMounted(async () => {
  await aiConfigStore.loadProviders();
  if (settingsStore.useLocalLLM) {
    selectedContour.value = 'local';
    localRuntime.value = settingsStore.localLLMModel === 'builtin' ? 'builtin' : 'ollama';
    return;
  }
  const activeLocal = aiConfigStore.providers.find(p => p.type === 'local' && p.enabled);
  if (activeLocal) {
    selectedContour.value = 'local';
    const match = LOCAL_RUNTIME_OPTIONS.find(
      o => o.isGateway && (activeLocal.name.toLowerCase().includes(o.id) || activeLocal.endpoint.includes(o.endpoint.replace('/v1/chat/completions', '')))
    );
    localRuntime.value = match ? match.id : 'freellmapi';
    localGatewayEndpoint.value = activeLocal.endpoint;
    localGatewayModel.value = activeLocal.model || 'auto';
    return;
  }
  const activeCloud = aiConfigStore.providers.find(p => p.type === 'cloud' && p.enabled);
  if (activeCloud) {
    selectedContour.value = activeCloud.id === 'gemini' ? 'gemini' : 'openrouter';
    const foundPreset = CLOUD_PRESET_OPTIONS.find(p => p.id === activeCloud.id || p.endpoint === activeCloud.endpoint);
    if (foundPreset) selectedCloudPresetId.value = foundPreset.id;
    if (activeCloud.hasApiKey) keyStatus.value = 'verified';
  }
});

function applyLocalRuntimeState(runtime: LocalRuntimeId) {
  localRuntime.value = runtime;
  const opt = LOCAL_RUNTIME_OPTIONS.find(o => o.id === runtime);
  if (!opt) return;
  if (!opt.isGateway) {
    settingsStore.useLocalLLM = true;
    settingsStore.localLLMModel = runtime === 'builtin' ? 'builtin' : 'llama3.2';
  } else {
    settingsStore.useLocalLLM = false;
    localGatewayEndpoint.value = opt.endpoint;
    localGatewayModel.value = opt.model;
  }
}

function selectContour(id: ContourId) {
  selectedContour.value = id;
  statusMessage.value = '';
  if (id === 'local') {
    applyLocalRuntimeState(localRuntime.value);
  } else {
    settingsStore.useLocalLLM = false;
    if (id === 'gemini') selectedCloudPresetId.value = 'gemini';
    else if (selectedCloudPresetId.value === 'gemini') selectedCloudPresetId.value = 'openrouter';
    keyStatus.value = 'unverified';
  }
}

function selectLocalRuntime(runtime: LocalRuntimeId) {
  statusMessage.value = '';
  applyLocalRuntimeState(runtime);
}

function persistLocalGateway() {
  return persistLocalGatewayConfig({
    opt: activeLocalOption.value,
    rawEndpoint: localGatewayEndpoint.value,
    rawModel: localGatewayModel.value,
    rawApiKey: apiKey.value,
    settingsStore,
    saveProvider: (c) => aiConfigStore.saveProvider(c)
  });
}

function persistCurrentContour(trimmedKey: string) {
  return persistCloudContourConfig({
    preset: activeCloudPreset.value,
    trimmedKey,
    saveProvider: (c) => aiConfigStore.saveProvider(c)
  });
}

async function verifyAndSaveKey() {
  if (selectedContour.value === 'local') {
    if (!activeLocalOption.value.isGateway) {
      settingsStore.useLocalLLM = true;
      settingsStore.localLLMModel = localRuntime.value === 'builtin' ? 'builtin' : 'llama3.2';
      keyStatus.value = 'verified';
      statusMessage.value = 'Локальный контур активирован';
      return;
    }
    isTesting.value = true;
    statusMessage.value = '';
    try {
      const saved = await persistLocalGateway();
      if (!saved.success) {
        keyStatus.value = 'unverified';
        statusMessage.value = saved.error || 'Ошибка сохранения шлюза';
        return;
      }
      const res = await aiConfigStore.testConnection(saved.provider);
      keyStatus.value = res.success ? 'verified' : 'unverified';
      statusMessage.value = res.success ? `Шлюз ${saved.provider.name} подключён` : (res.error || `Шлюз ${saved.provider.name} сохранён`);
    } catch (err: any) {
      keyStatus.value = 'unverified';
      statusMessage.value = err?.message || 'Ошибка проверки шлюза';
    } finally {
      isTesting.value = false;
    }
    return;
  }

  const trimmedKey = apiKey.value.trim();
  if (!trimmedKey) {
    keyStatus.value = 'unverified';
    statusMessage.value = 'Введите API-ключ для проверки канала';
    return;
  }

  isTesting.value = true;
  statusMessage.value = '';
  try {
    const preset = activeCloudPreset.value;
    const candidate: AIProvider = {
      id: preset.id, name: preset.name, type: 'cloud', endpoint: preset.endpoint,
      apiKey: trimmedKey, model: preset.model, priority: 1, maxTokens: 4096, temperature: 0.7, enabled: true
    };
    const res = await aiConfigStore.testConnection(candidate);
    if (res.success) {
      const saved = await persistCurrentContour(trimmedKey);
      if (!saved.success) {
        keyStatus.value = 'unverified';
        statusMessage.value = saved.error || 'Соединение подтверждено, но ключ не сохранён в сейфе';
        return;
      }
      keyStatus.value = 'verified';
      statusMessage.value = 'Соединение подтверждено, ключ сохранён в сейфе';
    } else {
      keyStatus.value = 'unverified';
      statusMessage.value = res.error || 'Проверка канала не пройдена';
    }
  } catch (err: any) {
    keyStatus.value = 'unverified';
    statusMessage.value = err?.message || 'Ошибка проверки соединения';
  } finally {
    isTesting.value = false;
  }
}

function skipKeyStep() {
  keyStatus.value = 'skipped';
  statusMessage.value = 'Настройка ключа отложена';
  emit('skip-step');
}

defineExpose({
  saveCurrentState: () => saveAiStepSelection({
    contour: selectedContour.value,
    isLocalGateway: activeLocalOption.value.isGateway,
    localRuntime: localRuntime.value,
    trimmedKey: apiKey.value.trim(),
    settingsStore,
    persistLocalGateway,
    persistCurrentContour
  })
});
</script>

<template>
  <div class="space-y-4">
    <!-- 3 Radio-Cards in A.R.C. HUD Style -->
    <div class="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Выбор контура ядра">
      <div
        v-for="item in contours"
        :key="item.id"
        role="radio"
        :aria-checked="selectedContour === item.id"
        tabindex="0"
        @click="selectContour(item.id)"
        @keydown.enter.prevent="selectContour(item.id)"
        @keydown.space.prevent="selectContour(item.id)"
        class="p-3.5 rounded-[12px] border transition-colors cursor-pointer flex flex-col justify-between select-none outline-none"
        :class="selectedContour === item.id
          ? 'border-[var(--accent)] bg-[var(--arc-selected)] text-[var(--arc-text-primary)]'
          : 'border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)]'"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-xs font-bold uppercase tracking-wider text-[var(--arc-text-primary)]">{{ item.title }}</span>
          <span class="w-2 h-2 rounded-full shrink-0" :class="selectedContour === item.id ? 'bg-[var(--accent)]' : 'bg-[var(--arc-divider)]'"></span>
        </div>
        <p class="text-xs text-[var(--arc-text-secondary)] mt-2">{{ item.tagline }}</p>
        <div class="mt-3 pt-2 border-t border-[var(--arc-divider)] font-mono text-xs text-[var(--arc-text-muted)]">{{ item.code }}</div>
      </div>
    </div>

    <!-- Cloud Contour Configuration Block -->
    <div v-if="selectedContour !== 'local'" class="p-4 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] space-y-3.5">
      <div class="flex items-center justify-between gap-3">
        <span class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-secondary)]">КАНАЛ: {{ activeCloudPreset.name }}</span>
        <div class="px-2.5 py-0.5 rounded-[6px] border font-mono text-xs uppercase tracking-wider flex items-center gap-2" :class="statusBadge.classes">
          <span class="w-1.5 h-1.5 rounded-full" :class="statusBadge.dot"></span>
          <span>{{ statusBadge.label }}</span>
        </div>
      </div>

      <div v-if="selectedContour === 'openrouter'" class="space-y-1.5">
        <label class="font-mono text-xs text-[var(--arc-text-secondary)]">ОБЛАЧНЫЙ ПРОВАЙДЕР ({{ CLOUD_PRESET_OPTIONS.length }} В КАТАЛОГЕ)</label>
        <ArcSelect
          :model-value="selectedCloudPresetId"
          :options="CLOUD_PRESET_OPTIONS.map(preset => ({ label: `${preset.name} — ${preset.freeTierInfo}`, value: preset.id }))"
          @update:model-value="val => { selectedCloudPresetId = val; keyStatus = 'unverified'; statusMessage = ''; }"
        />
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="font-mono text-xs text-[var(--arc-text-secondary)]">КЛЮЧ ДОСТУПА API</label>
          <button type="button" @click="showApiKey = !showApiKey" class="font-mono text-xs text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer">
            {{ showApiKey ? 'Скрыть' : 'Показать' }}
          </button>
        </div>
        <input
          :type="showApiKey ? 'text' : 'password'"
          v-model="apiKey"
          @input="keyStatus = 'unverified'"
          placeholder="Введите секретный ключ провайдера..."
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 font-mono text-xs text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none"
        />
      </div>

      <div class="pt-1 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <button
            type="button"
            @click="verifyAndSaveKey"
            :disabled="isTesting"
            class="px-4 py-1.5 rounded-[10px] bg-[var(--accent)] text-white font-mono text-xs font-semibold border border-[rgba(var(--accent-rgb),0.5)] shadow-[0_0_16px_rgba(var(--accent-rgb),0.25)] hover:opacity-90 cursor-pointer disabled:opacity-50"
          >
            {{ isTesting ? 'Проверка...' : 'Проверить и сохранить' }}
          </button>
          <button
            type="button"
            @click="skipKeyStep"
            class="px-3.5 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-transparent hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] font-mono text-xs cursor-pointer"
          >
            Пропустить
          </button>
        </div>
        <span v-if="statusMessage" class="font-mono text-xs truncate" :class="keyStatus === 'verified' ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-secondary)]'">
          {{ statusMessage }}
        </span>
      </div>
    </div>

    <!-- Local Contour Configuration Block -->
    <div v-else class="p-4 rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] space-y-3.5">
      <div class="flex items-center justify-between">
        <span class="font-mono text-xs uppercase tracking-wider text-[var(--arc-text-secondary)]">
          ЛОКАЛЬНЫЙ ИСПОЛНИТЕЛЬ ИЛИ FREE-ШЛЮЗ ({{ LOCAL_RUNTIME_OPTIONS.length }} ВАРИАНТОВ)
        </span>
        <span class="px-2.5 py-0.5 rounded-[6px] border border-[var(--status-ok)] bg-[var(--arc-plane)] font-mono text-xs text-[var(--status-ok)]">
          автономный / локальный
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
        <div
          v-for="opt in LOCAL_RUNTIME_OPTIONS"
          :key="opt.id"
          role="radio"
          :aria-checked="localRuntime === opt.id"
          tabindex="0"
          @click="selectLocalRuntime(opt.id)"
          @keydown.enter.prevent="selectLocalRuntime(opt.id)"
          @keydown.space.prevent="selectLocalRuntime(opt.id)"
          class="p-2.5 rounded-[10px] border cursor-pointer transition-colors select-none outline-none"
          :class="localRuntime === opt.id
            ? 'border-[var(--accent)] bg-[var(--arc-selected)] text-[var(--arc-text-primary)]'
            : 'border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)]'"
        >
          <div class="font-mono text-xs font-bold text-[var(--arc-text-primary)] truncate">{{ opt.title }}</div>
          <div class="text-xs text-[var(--arc-text-muted)] mt-0.5 truncate">{{ opt.subtitle }}</div>
        </div>
      </div>

      <div v-if="activeLocalOption.isGateway" class="space-y-2.5 pt-1 border-t border-[var(--arc-divider)]">
        <div class="grid grid-cols-3 gap-2">
          <div class="col-span-2 space-y-1">
            <label class="font-mono text-xs text-[var(--arc-text-secondary)]">ЭНДПОИНТ / IP ШЛЮЗА</label>
            <input
              type="text"
              v-model="localGatewayEndpoint"
              placeholder="http://127.0.0.1:31415/v1/chat/completions"
              class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 font-mono text-xs text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none"
            />
          </div>
          <div class="space-y-1">
            <label class="font-mono text-xs text-[var(--arc-text-secondary)]">МОДЕЛЬ</label>
            <input
              type="text"
              v-model="localGatewayModel"
              placeholder="auto"
              class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 font-mono text-xs text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none"
            />
          </div>
        </div>
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="font-mono text-xs text-[var(--arc-text-secondary)]">КЛЮЧ API (ОПЦИОНАЛЬНО — ИЗ ВЕБ-ПАНЕЛИ ШЛЮЗА)</label>
            <button type="button" @click="showApiKey = !showApiKey" class="font-mono text-xs text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] cursor-pointer">
              {{ showApiKey ? 'Скрыть' : 'Показать' }}
            </button>
          </div>
          <input
            :type="showApiKey ? 'text' : 'password'"
            v-model="apiKey"
            placeholder="Ключ из http://127.0.0.1:31415 (вкладка Keys) или пусто..."
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 font-mono text-xs text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none"
          />
        </div>
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            @click="verifyAndSaveKey"
            :disabled="isTesting"
            class="px-4 py-1.5 rounded-[10px] bg-[var(--accent)] text-white font-mono text-xs font-semibold border border-[rgba(var(--accent-rgb),0.5)] hover:opacity-90 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {{ isTesting ? 'Проверка...' : `Подключить ${activeLocalOption.title}` }}
          </button>
          <span v-if="statusMessage" class="font-mono text-xs leading-snug" :class="keyStatus === 'verified' ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-secondary)]'">
            {{ statusMessage }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
