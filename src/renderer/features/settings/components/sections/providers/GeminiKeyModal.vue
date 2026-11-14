<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { 
  Sparkles, Eye, EyeOff, Check, ExternalLink, 
  ShieldCheck, AlertTriangle, RefreshCw, Key, CheckCircle2
} from 'lucide-vue-next';
import ArcModal from '../../../../../components/ui/ArcModal.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import { useAiConfigStore } from '../../../../../stores/aiConfig';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', value: boolean): void; (e: 'saved', key: string): void }>();

const aiStore = useAiConfigStore();
const apiKey = ref('');
const showKey = ref(false);
const selectedModel = ref('gemini-2.5-flash');
const makePrimaryInRouter = ref(true);
const isTesting = ref(false);
const isSaving = ref(false);
const testStatus = ref<{ status: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ status: 'idle' });
const existingKeyMasked = ref('');
const isEncryptedVault = ref(false);

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Рекомендуется', desc: 'Ультра-быстрая и мощная модель по умолчанию' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'Когнитивный флагман', desc: 'Глубокое рассуждение и сложный анализ' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tag: 'Стабильная', desc: 'Проверенная классическая рабочая модель' }
];

const hasValidInput = computed(() => apiKey.value.trim().length >= 10);

const loadInitialState = async () => {
  testStatus.value = { status: 'idle' };
  
  if (window.api && (window.api as any).settingsIsSafeStorageAvailable) {
    try {
      const res = await (window.api as any).settingsIsSafeStorageAvailable();
      isEncryptedVault.value = res?.available ?? false;
    } catch {
      isEncryptedVault.value = false;
    }
  }

  let currentKey = '';
  const geminiProvider = aiStore.providers.find(p => 
    (p.name && p.name.toLowerCase().includes('gemini')) || 
    (p.endpoint && p.endpoint.includes('generativelanguage'))
  );

  if (geminiProvider && geminiProvider.apiKey) {
    currentKey = geminiProvider.apiKey;
    if (geminiProvider.model && GEMINI_MODELS.some(m => m.id === geminiProvider.model)) {
      selectedModel.value = geminiProvider.model;
    }
  }

  if (!currentKey && window.api && (window.api as any).settingsGetKey) {
    try {
      const res = await (window.api as any).settingsGetKey('gemini_api_key');
      if (res && res.success && res.value) {
        currentKey = res.value;
      }
    } catch {
      // Ignored
    }
  }

  if (currentKey) {
    apiKey.value = currentKey;
    const trimmed = currentKey.trim();
    if (trimmed.length > 8) {
      existingKeyMasked.value = `${trimmed.slice(0, 6)}••••••••${trimmed.slice(-4)}`;
    } else {
      existingKeyMasked.value = '••••••••';
    }
  } else {
    apiKey.value = '';
    existingKeyMasked.value = '';
  }
};

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    loadInitialState();
  }
});

const handleClose = () => {
  emit('update:show', false);
};

const openAiStudio = () => {
  if (typeof window !== 'undefined') {
    window.open('https://aistudio.google.com/app/apikey', '_blank');
  }
};

const testCurrentKey = async () => {
  const key = apiKey.value.trim();
  if (!key) {
    testStatus.value = {
      status: 'error',
      message: 'Введите ключ API перед проверкой.'
    };
    return;
  }

  isTesting.value = true;
  testStatus.value = { status: 'loading', message: 'Проверка ключа через Google API...' };

  try {
    const testProvider = {
      id: 'gemini_test_' + Date.now(),
      name: 'Google Gemini API',
      type: 'cloud' as const,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: selectedModel.value,
      apiKey: key,
      maxTokens: 50,
      temperature: 0.1,
      enabled: true,
      priority: 1
    };

    const res = await aiStore.testConnection(testProvider);
    if (res.success) {
      testStatus.value = {
        status: 'success',
        message: 'Соединение успешно! Ключ валиден, 401 Unauthorized устранен.'
      };
    } else {
      const is401 = res.error && (res.error.includes('401') || res.error.toLowerCase().includes('unauthorized') || res.error.toLowerCase().includes('invalid'));
      testStatus.value = {
        status: 'error',
        message: is401 
          ? 'Ошибка 401 Unauthorized: Ключ не распознан Google API. Проверьте правильность ключа.'
          : (res.error || 'Ошибка проверки связи.')
      };
    }
  } catch (err: any) {
    testStatus.value = {
      status: 'error',
      message: err.message || 'Сетевой сбой при проверке соединения.'
    };
  } finally {
    isTesting.value = false;
  }
};

const handleSave = async () => {
  const key = apiKey.value.trim();
  if (!key) return;

  isSaving.value = true;
  try {
    if (window.api && (window.api as any).settingsSetKey) {
      await (window.api as any).settingsSetKey('gemini_api_key', key);
    }

    const existingIndex = aiStore.providers.findIndex(p => 
      (p.name && p.name.toLowerCase().includes('gemini')) || 
      (p.endpoint && p.endpoint.includes('generativelanguage'))
    );

    const providerId = existingIndex !== -1 ? aiStore.providers[existingIndex].id : 'gemini';
    const updatedProvider = {
      id: providerId,
      name: 'Google Gemini API',
      type: 'cloud' as const,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: selectedModel.value,
      selectedModels: [selectedModel.value],
      routingStrategy: 'smart_route' as const,
      priority: makePrimaryInRouter.value ? 1 : (existingIndex !== -1 ? aiStore.providers[existingIndex].priority : aiStore.providers.length + 1),
      maxTokens: 4096,
      temperature: 0.7,
      enabled: true,
      apiKey: key,
      isExclusive: makePrimaryInRouter.value
    };

    if (makePrimaryInRouter.value) {
      aiStore.providers.forEach(p => {
        if (p.id !== providerId) {
          p.isExclusive = false;
          if (p.priority === 1) p.priority = 2;
        }
      });
    }

    aiStore.clearProviderTestState(providerId);
    await aiStore.saveProvider(updatedProvider);
    await aiStore.resetQuarantine(providerId);

    emit('saved', key);
    handleClose();
  } catch (err: any) {
    testStatus.value = {
      status: 'error',
      message: 'Не удалось сохранить ключ: ' + (err.message || String(err))
    };
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <ArcModal
    :show="show"
    title="Конфигурация Google Gemini API"
    subtitle="Безопасное сохранение ключа и устранение 401 Unauthorized в роутере"
    max-width="max-w-xl"
    @close="handleClose"
  >
    <template #title-prefix>
      <div class="p-1 rounded bg-[var(--arc-plane)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)]">
        <Sparkles class="w-3.5 h-3.5" />
      </div>
    </template>

    <div class="flex flex-col gap-4 text-[var(--arc-text-primary)]">
      <!-- Status & Security Badges -->
      <div 
        class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-[14px] bg-[var(--arc-block)] border border-[var(--arc-hairline)]"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full" :class="existingKeyMasked ? 'bg-[var(--status-ok)] shadow-[0_0_8px_rgba(var(--status-ok-rgb,34,197,94),0.8)]' : 'bg-[var(--status-warn)] shadow-[0_0_8px_rgba(var(--status-warn-rgb,234,179,8),0.8)]'"></div>
          <span class="text-xs font-mono tracking-wider uppercase text-[var(--arc-text-primary)]">
            {{ existingKeyMasked ? `Ключ установлен: ${existingKeyMasked}` : 'Ключ не настроен' }}
          </span>
        </div>
        
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--arc-plane)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)] text-xs font-mono tracking-wider uppercase">
          <ShieldCheck class="w-3 h-3" />
          <span>{{ isEncryptedVault ? 'OS DPAPI AES-256' : 'SafeStorage' }}</span>
        </div>
      </div>

      <!-- Quick AI Studio Banner -->
      <div 
        class="p-3.5 rounded-[14px] bg-[var(--arc-block)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.25)] flex items-center justify-between gap-3"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-[10px] bg-[var(--arc-plane)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)] shrink-0">
            <Key class="w-4 h-4" />
          </div>
          <div class="flex flex-col">
            <span class="text-xs font-medium text-[var(--arc-text-primary)]">Бесплатный ключ Gemini API</span>
            <span class="text-xs text-[var(--arc-text-secondary)]">Мгновенная генерация без привязки карты в Google AI Studio.</span>
          </div>
        </div>
        <button
          type="button"
          @click="openAiStudio"
          class="shrink-0 px-3.5 py-1.5 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-ok)] border border-[rgba(var(--status-ok-rgb,34,197,94),0.35)] text-xs font-mono tracking-wide transition flex items-center gap-1.5 cursor-pointer outline-none"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
        >
          <span>Получить ключ</span>
          <ExternalLink class="w-3 h-3" />
        </button>
      </div>

      <!-- Key Input Field -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs font-mono text-[var(--arc-text-secondary)] tracking-wider uppercase">API Ключ (Gemini Key)</label>
          <span class="text-xs text-[var(--arc-text-muted)] font-mono">Шифруется в SafeStorage</span>
        </div>

        <div class="relative flex items-center">
          <input
            :type="showKey ? 'text' : 'password'"
            v-model="apiKey"
            placeholder="AIzaSy..."
            class="w-full h-11 pl-4 pr-24 rounded-[12px] bg-[var(--arc-input)] hover:bg-[var(--arc-hover)] focus:bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] text-sm font-mono text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-hint)] transition duration-200 outline-none"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.03)' }"
          />

          <div class="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              @click="showKey = !showKey"
              class="w-8 h-8 rounded-[8px] flex items-center justify-center text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] transition cursor-pointer"
              title="Показать / скрыть ключ"
            >
              <EyeOff v-if="showKey" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Model Selection -->
      <div class="flex flex-col gap-2 pt-1">
        <label class="text-xs font-mono text-[var(--arc-text-secondary)] tracking-wider uppercase">Основная модель Gemini</label>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            v-for="model in GEMINI_MODELS"
            :key="model.id"
            type="button"
            @click="selectedModel = model.id"
            class="p-3 rounded-[14px] border text-left transition flex flex-col gap-1 cursor-pointer outline-none"
            :class="selectedModel === model.id 
              ? 'bg-[var(--arc-selected)] border-[var(--accent)] shadow-[0_0_12px_rgba(var(--accent-rgb),0.15)]' 
              : 'bg-[var(--arc-block)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] hover:bg-[var(--arc-hover)]'"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--arc-text-primary)]">{{ model.name }}</span>
              <span v-if="selectedModel === model.id" class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
            </div>
            <span class="text-xs text-[var(--arc-text-muted)] leading-tight">{{ model.desc }}</span>
          </button>
        </div>
      </div>

      <!-- Priority Router Option -->
      <div 
        class="p-3.5 rounded-[14px] bg-[var(--arc-block)] border transition-colors"
        :class="makePrimaryInRouter ? 'border-[rgba(var(--accent-rgb),0.45)]' : 'border-[var(--arc-hairline)] hover:border-[var(--arc-edge-strong)]'"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
      >
        <ArcToggle
          v-model="makePrimaryInRouter"
          size="sm"
          label="Приоритет в роутере"
          description="Назначить Gemini основным шлюзом и сбросить карантин ошибок 401."
          wrapper-class="w-full"
        />
      </div>

      <!-- Test Status Box -->
      <div 
        v-if="testStatus.status !== 'idle'" 
        class="p-3 rounded-[14px] text-xs flex items-center gap-2.5 transition bg-[var(--arc-block)] border"
        :class="{
          'border-[var(--arc-hairline)] text-[var(--arc-text-secondary)]': testStatus.status === 'loading',
          'border-[rgba(var(--status-ok-rgb,34,197,94),0.3)] text-[var(--status-ok)]': testStatus.status === 'success',
          'border-[rgba(var(--status-err-rgb,239,68,68),0.3)] text-[var(--status-err)]': testStatus.status === 'error'
        }"
      >
        <RefreshCw v-if="testStatus.status === 'loading'" class="w-4 h-4 animate-spin shrink-0 text-[var(--arc-text-muted)]" />
        <CheckCircle2 v-else-if="testStatus.status === 'success'" class="w-4 h-4 shrink-0 text-[var(--status-ok)]" />
        <AlertTriangle v-else-if="testStatus.status === 'error'" class="w-4 h-4 shrink-0 text-[var(--status-err)]" />
        <span class="font-sans leading-relaxed">{{ testStatus.message }}</span>
      </div>
    </div>

    <!-- Modal Footer Actions -->
    <template #footer>
      <div class="w-full flex items-center justify-between gap-3">
        <button
          type="button"
          @click="testCurrentKey"
          :disabled="!hasValidInput || isTesting || isSaving"
          class="px-4 py-2 rounded-[10px] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] text-xs font-mono tracking-wider uppercase transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isTesting }" />
          <span>{{ isTesting ? 'Проверка...' : 'Проверить ключ' }}</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="handleClose"
            class="px-4 py-2 rounded-[10px] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] bg-transparent text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] text-xs font-mono tracking-wider uppercase transition cursor-pointer outline-none"
          >
            Отмена
          </button>

          <button
            type="button"
            @click="handleSave"
            :disabled="!hasValidInput || isSaving"
            class="px-5 py-2 rounded-[10px] bg-[var(--accent)] hover:opacity-90 text-white text-xs font-mono tracking-wider uppercase transition shadow-[0_0_16px_rgba(var(--accent-rgb),0.3)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-none"
          >
            <Check class="w-3.5 h-3.5" />
            <span>{{ isSaving ? 'Сохранение...' : 'Сохранить и активировать' }}</span>
          </button>
        </div>
      </div>
    </template>
  </ArcModal>
</template>
