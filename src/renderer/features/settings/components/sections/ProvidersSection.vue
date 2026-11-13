<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RefreshCw, Sparkles, ShieldAlert, Cpu, Globe, Cloud } from 'lucide-vue-next';
import { useAiConfigStore, buildProviderFingerprint } from '../../../../stores/aiConfig';
import { validateProviderEndpoint } from '../../logic/provider-validation';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsGroup from '../primitives/SettingsGroup.vue';
import CrossLink from '../primitives/CrossLink.vue';
import { ProviderPreset } from './providers/presetsData';
import PresetCatalogComp from './providers/PresetCatalog.vue';
import ProviderCard from './providers/ProviderCard.vue';
import GeminiKeyModal from './providers/GeminiKeyModal.vue';
import ManualIpModal from './providers/ManualIpModal.vue';

const aiStore = useAiConfigStore();

const fetchedModels = ref<Record<string, string[]>>({});
const modelFetchStates = ref<Record<string, 'loading' | 'idle'>>({});
const expandedProvider = ref<string | null>(null);
const showGeminiModal = ref(false);
const showManualIpModal = ref(false);

const hasGeminiKey = computed(() => {
  const p = aiStore.providers.find(prov => 
    (prov.name && prov.name.toLowerCase().includes('gemini')) || 
    (prov.endpoint && prov.endpoint.includes('generativelanguage'))
  );
  return Boolean(p && p.apiKey && p.apiKey.trim().length > 0);
});

const enabledProvidersCount = computed(() => aiStore.providers.filter(p => p.enabled).length);
const configuredProvidersCount = computed(() => aiStore.providers.filter(p => {
  if (!p.enabled) return false;
  if (!validateProviderEndpoint(p.endpoint).valid) return false;
  if (p.type !== 'local' && !p.noAuthHeader && !(p.apiKey && p.apiKey.trim().length > 0)) return false;
  return true;
}).length);
const verifiedProvidersCount = computed(() => aiStore.providers.filter(p =>
  p.enabled && aiStore.getProviderTestState(p)?.status === 'success'
).length);
const localGatewaysCount = computed(() => aiStore.providers.filter(p => p.type === 'local').length);
const cloudGatewaysCount = computed(() => aiStore.providers.filter(p => p.type !== 'local').length);
const activeQuarantineCount = computed(() =>
  aiStore.quarantinedProviders.filter(q => q.quarantineUntil > Date.now()).length
);

const providersHeaderStatus = computed(() => {
  if (aiStore.providers.length === 0) return { label: 'НЕТ ШЛЮЗОВ', tone: 'warn' as const };
  if (activeQuarantineCount.value > 0) return { label: `КАРАНТИН (${activeQuarantineCount.value})`, tone: 'warn' as const };
  if (verifiedProvidersCount.value > 0) return { label: `ПРОВЕРЕНО: ${verifiedProvidersCount.value}`, tone: 'ok' as const };
  if (configuredProvidersCount.value > 0) return { label: 'НАСТРОЕНО · НЕ ПРОВЕРЕНО', tone: 'warn' as const };
  if (enabledProvidersCount.value > 0) return { label: 'ТРЕБУЕТ НАСТРОЙКИ', tone: 'warn' as const };
  return { label: 'ВСЕ ОТКЛЮЧЕНЫ', tone: 'off' as const };
});

const loadProviders = () => { aiStore.loadProviders(); };

const toggleExpand = (provider: any) => {
  if (expandedProvider.value === provider.id) {
    expandedProvider.value = null;
  } else {
    expandedProvider.value = provider.id;
    if (!fetchedModels.value[provider.id] || fetchedModels.value[provider.id].length === 0) {
      fetchModels(provider);
    }
  }
};

const fetchModels = async (provider: any, isAutoDetect = false) => {
  modelFetchStates.value[provider.id] = 'loading';
  try {
    if (window.api) {
      if (provider.apiKey && provider.apiKey.trim().length > 0 && provider.apiKey !== '••••••••••••••••') {
        provider.noAuthHeader = false;
      }
      const result = await window.api.getAvailableModels(JSON.parse(JSON.stringify(provider)));
      const rawList = Array.isArray(result) ? result : (result?.models || []);
      const models = rawList.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      fetchedModels.value[provider.id] = models;
      provider.lastModelsFetchAt = Date.now();
      if (models.length > 0) {
        provider.modelsUpdatedAt = Date.now();
        provider.modelsFetchError = undefined;
        let hasChanges = isAutoDetect || Boolean(provider.apiKey && provider.apiKey !== '••••••••••••••••');
        if (!provider.model || (provider.model !== 'auto' && !models.includes(provider.model))) {
          provider.model = models[0];
          hasChanges = true;
        }
        if (!provider.selectedModels || provider.selectedModels.length === 0) {
          provider.selectedModels = [provider.model];
          hasChanges = true;
        }
        if (hasChanges) await aiStore.saveProvider(provider);
      } else {
        provider.modelsFetchError = 'Сервер не вернул модели или недоступен';
      }
    }
  } catch (e: any) {
    console.warn(`[Providers] Fetch models failed for ${provider?.name || provider?.id}:`, e?.message || e);
    fetchedModels.value[provider.id] = [];
    provider.lastModelsFetchAt = Date.now();
    provider.modelsFetchError = e.message || 'Ошибка загрузки моделей';
  } finally {
    modelFetchStates.value[provider.id] = 'idle';
  }
};

const testProvider = async (provider: any) => {
  const endpointCheck = validateProviderEndpoint(provider.endpoint);
  if (!endpointCheck.valid) {
    aiStore.setProviderTestState(provider.id, {
      status: 'error',
      message: endpointCheck.error,
      checkedAt: Date.now(),
      configFingerprint: buildProviderFingerprint(provider)
    });
    return;
  }

  if (provider.apiKey && provider.apiKey.trim().length > 0 && provider.apiKey !== '••••••••••••••••') {
    provider.noAuthHeader = false;
  }
  const saveRes = await aiStore.saveProvider(provider);
  if (saveRes && saveRes.success === false) {
    aiStore.setProviderTestState(provider.id, {
      status: 'error',
      message: saveRes.error || 'Не удалось сохранить конфигурацию провайдера',
      checkedAt: Date.now(),
      configFingerprint: buildProviderFingerprint(provider)
    });
    return;
  }

  const result = await aiStore.testConnection(provider);
  if ((result as any).models && (result as any).models.length > 0) {
    fetchedModels.value[provider.id] = [...new Set([...(fetchedModels.value[provider.id] || []), ...(result as any).models])];
  }
  if (result.success) {
    provider.enabled = true;
    const isLocalFree =
      provider.type === 'local' ||
      Boolean(provider.endpoint && /:3067|:31415|freeapi|freellm/i.test(provider.endpoint)) ||
      Boolean(provider.name && /freeapi|freellm/i.test(provider.name));
    if (isLocalFree && (!provider.priority || provider.priority > 1)) provider.priority = 1;
    if ((result as any).workingModel && (!provider.model || (provider.model !== 'auto' && provider.model !== (result as any).workingModel))) {
      provider.model = (result as any).workingModel;
    }
    await aiStore.saveProvider(provider);
    fetchModels(provider, true);
  }
};

const addProvider = async (preset: ProviderPreset) => {
  const newId = 'new_' + Date.now();
  const defaultModels = preset.model ? [preset.model] : [];
  const isLocalFreeGateway = preset.type === 'local' && preset.freeTier === 'free';
  const newProvider = {
    id: newId,
    name: preset.name,
    type: preset.type,
    endpoint: preset.endpoint,
    model: preset.model || '',
    selectedModels: defaultModels,
    routingStrategy: 'smart_route' as const,
    priority: isLocalFreeGateway ? 1 : aiStore.providers.length + 1,
    maxTokens: 2048,
    temperature: 0.7,
    enabled: true,
    apiKey: '',
    noAuthHeader: isLocalFreeGateway,
    freeTier: preset.freeTier,
    isExclusive: false
  };
  await aiStore.saveProvider(newProvider);
  expandedProvider.value = newId;
  fetchModels(newProvider);
};

const handleManualIpConnected = async (newProvider: any) => {
  await loadProviders();
  if (newProvider?.id) {
    expandedProvider.value = newProvider.id;
    testProvider(newProvider);
  }
};

const deleteProvider = async (id: string) => { await aiStore.deleteProvider(id); };
onMounted(loadProviders);
</script>

<template>
  <section id="section-providers" class="flex flex-col gap-7 text-[var(--arc-text-primary)] scroll-mt-14">
    <!-- Уровень 1: Workspace Header + Сводка подключений -->
    <SettingsSectionHeader 
      variant="workspace"
      categoryLabel="Интеллект · Подсистема 02"
      title="Облачные провайдеры" 
      description="Управление внешними API-провайдерами, защищённое хранение ключей (DPAPI) и подключение локальных сетевых шлюзов по IP (FreeAPILLM)."
      :statusLabel="providersHeaderStatus.label"
      :statusTone="providersHeaderStatus.tone"
      :blockCountText="`${aiStore.providers.length} зарегистрировано`"
      :icon="Cloud" 
    >
      <template #summary>
        <div 
          class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-[14px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] font-mono text-xs tabular-nums"
          :style="{ background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
        >
          <div class="flex flex-col gap-0.5 px-2">
            <span class="text-[var(--arc-text-machine)] uppercase">Всего шлюзов</span>
            <span class="text-sm font-semibold text-[var(--arc-text-primary)]">
              {{ aiStore.providers.length }} <span class="text-xs font-normal text-[var(--arc-text-hint)]">({{ cloudGatewaysCount }} обл. / {{ localGatewaysCount }} лок.)</span>
            </span>
          </div>
          <div class="flex flex-col gap-0.5 px-2 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-machine)] uppercase">Состояние проверки</span>
            <span class="text-sm font-semibold" :class="verifiedProvidersCount > 0 ? 'text-[var(--status-ok)]' : configuredProvidersCount > 0 ? 'text-[var(--status-warn)]' : 'text-[var(--arc-text-muted)]'">
              {{ verifiedProvidersCount }} проверено <span class="text-xs font-normal text-[var(--arc-text-hint)]">из {{ enabledProvidersCount }} вкл.</span>
            </span>
          </div>
          <div class="flex flex-col gap-0.5 px-2 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-machine)] uppercase">Google Gemini API</span>
            <span class="text-sm font-semibold" :class="hasGeminiKey ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">
              {{ hasGeminiKey ? 'Ключ задан' : 'Не настроен' }}
            </span>
          </div>
          <div class="flex flex-col gap-0.5 px-2 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-machine)] uppercase">Карантин сбоев</span>
            <span class="text-sm font-semibold" :class="activeQuarantineCount > 0 ? 'text-[var(--status-err)]' : 'text-[var(--arc-text-secondary)]'">
              {{ activeQuarantineCount > 0 ? `${activeQuarantineCount} заблокировано` : '0 (норма)' }}
            </span>
          </div>
        </div>
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Функциональная группа 1 — Подключение нового шлюза и диагностика -->
    <SettingsGroup
      indexLabel="01"
      title="Подключение нового шлюза"
      description="Добавьте готовый профиль из каталога пресетов, настройте базовый ключ Google Gemini или подключите локальный сервер по IP."
    >
      <div 
        class="p-4 rounded-[16px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex flex-col lg:flex-row lg:items-center justify-between gap-3.5"
        :style="{ background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 10px 28px rgba(0, 0, 0, 0.60)' }"
      >
        <div class="flex flex-col gap-0.5">
          <span class="text-[13px] font-sans font-semibold text-[var(--arc-text-primary)]">Инструменты регистрации API и сетевых узлов</span>
          <span class="text-xs text-[var(--arc-text-hint)]">OpenRouter, OpenAI, DeepSeek, Anthropic, Groq, а также локальные шлюзы FreeLLMAPI и LM Studio.</span>
        </div>

        <div class="flex items-center gap-2 flex-wrap shrink-0">
          <PresetCatalogComp @select-preset="addProvider" />

          <button 
            id="providers.gemini_key"
            data-setting-id="providers.gemini_key"
            data-search="ключ google gemini api key облако провайдеры"
            @click="showGeminiModal = true"
            class="px-3 py-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono text-[var(--arc-text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
            title="Настройка Google Gemini API ключа"
          >
            <Sparkles class="w-3.5 h-3.5" :class="hasGeminiKey ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'" />
            <span>GEMINI КЛЮЧ</span>
            <span class="w-1.5 h-1.5 rounded-full" :class="hasGeminiKey ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-warn)]'"></span>
          </button>

          <button 
            id="providers.manual_ip"
            data-setting-id="providers.manual_ip"
            @click="showManualIpModal = true"
            class="px-3 py-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
            title="Ручной ввод IP для FreeAPILLM (127.0.0.1:3067) или локального шлюза"
            data-search="freeapillm локальный шлюз по ip 127.0.0.1:3067 ввести ip"
          >
            <Globe class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" />
            <span>ВВЕСТИ IP</span>
          </button>

          <button 
            @click="loadProviders"
            class="px-3 py-1.5 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
            title="Обновить список провайдеров"
          >
            <RefreshCw class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" :class="{ 'animate-spin': aiStore.isLoading }" />
            <span>ОБНОВИТЬ</span>
          </button>
        </div>
      </div>

      <!-- Состояние конфигурации: предупреждение об отсутствующем ключе Gemini -->
      <div 
        v-if="!hasGeminiKey" 
        class="px-4 py-3 rounded-[14px] bg-[var(--arc-block)] border border-[var(--status-warn)]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
      >
        <div class="flex items-center gap-2.5 text-[var(--status-warn)]">
          <ShieldAlert class="w-4 h-4 shrink-0 text-[var(--status-warn)]" />
          <span class="text-xs text-[var(--arc-text-secondary)] font-sans">
            Ключ Google Gemini API не указан. Укажите ключ для облачного контура по умолчанию и мультимодальных функций.
          </span>
        </div>
        <button 
          @click="showGeminiModal = true" 
          class="text-xs font-mono text-[var(--status-warn)] hover:text-[var(--arc-text-primary)] uppercase tracking-wider px-3 py-1.5 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition shrink-0 cursor-pointer whitespace-nowrap self-start sm:self-center"
        >
          Ввести ключ
        </button>
      </div>
    </SettingsGroup>

    <!-- Уровень 2: Функциональная группа 2 — Зарегистрированные провайдеры -->
    <SettingsGroup
      indexLabel="02"
      title="Зарегистрированные провайдеры"
      description="Нажмите на карточку шлюза для настройки API-ключа, выбора моделей, параметров генерации и проверки соединения."
      :badgeText="`Всего: ${aiStore.providers.length}`"
    >
      <div 
        v-if="aiStore.isLoading && aiStore.providers.length === 0" 
        class="py-8 px-4 border border-[var(--arc-hairline)] rounded-[16px] text-center flex flex-col items-center gap-2 bg-[var(--arc-block)]"
      >
        <RefreshCw class="w-5 h-5 text-[var(--accent)] animate-spin mb-1" />
        <span class="text-xs font-mono text-[var(--arc-text-primary)]">Загрузка конфигурации провайдеров...</span>
      </div>

      <div 
        v-else-if="aiStore.providers.length === 0" 
        class="py-9 px-4 border border-dashed border-[var(--arc-hairline)] rounded-[16px] text-center flex flex-col items-center gap-2.5 bg-[var(--arc-plane)]"
      >
        <Cpu class="w-5 h-5 text-[var(--arc-text-muted)]" />
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">Зарегистрированные шлюзы отсутствуют</span>
        <span class="text-xs text-[var(--arc-text-hint)] max-w-md">
          В системе не настроен ни один внешний провайдер. Добавьте профиль из каталога пресетов выше или подключите локальный сервер по IP.
        </span>
        <div class="flex items-center gap-2 mt-1">
          <button type="button" @click="showGeminiModal = true" class="px-3 py-1.5 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-primary)] cursor-pointer transition">Настроить Gemini API</button>
          <button type="button" @click="showManualIpModal = true" class="px-3 py-1.5 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] cursor-pointer transition">Подключить по IP</button>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3">
        <ProviderCard 
          v-for="provider in aiStore.providers" 
          :key="provider.id"
          :provider="provider"
          :is-expanded="expandedProvider === provider.id"
          :test-result="aiStore.getProviderTestState(provider)"
          :fetched-models="fetchedModels[provider.id] || []"
          :is-loading-models="modelFetchStates[provider.id] === 'loading'"
          @toggle-expand="toggleExpand(provider)"
          @test-provider="testProvider(provider)"
          @fetch-models="(isAuto) => fetchModels(provider, isAuto)"
          @delete-provider="deleteProvider(provider.id)"
        />
      </div>

      <!-- Переходы к смежным подразделам -->
      <div class="px-4 py-3 rounded-[14px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] flex flex-wrap items-center justify-between gap-3">
        <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">Связанные разделы:</span>
        <div class="flex flex-wrap items-center gap-4">
          <CrossLink label="Маршрутизация и потоковый вывод" tab="intelligence" sectionId="section-router" />
          <CrossLink label="Локальный ИИ (GGUF / Ollama)" tab="intelligence" sectionId="section-local" />
        </div>
      </div>
    </SettingsGroup>

    <GeminiKeyModal v-model:show="showGeminiModal" @saved="loadProviders" />
    <ManualIpModal v-model:show="showManualIpModal" @connected="handleManualIpConnected" />
  </section>
</template>
