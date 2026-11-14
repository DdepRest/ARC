<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RefreshCw, Sparkles, ShieldAlert, Cpu, Globe, Cloud } from 'lucide-vue-next';
import { useAiConfigStore, buildProviderFingerprint, type AIProvider } from '../../../../stores/aiConfig';
import { validateProviderEndpoint } from '../../logic/provider-validation';
import {
  getProviderListStatus,
  useProviderInspectorDraft,
  useQuarantineWatch
} from '../../composables/useProviderInspectorDraft';
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
const togglingIds = ref<Record<string, boolean>>({});
const showGeminiModal = ref(false);
const showManualIpModal = ref(false);

const {
  activeQuarantineCount,
  isProviderQuarantined,
  getQuarantineMinutesLeft
} = useQuarantineWatch(
  computed(() => aiStore.quarantinedProviders),
  () => aiStore.refreshQuarantine()
);

const {
  selectedProviderId: expandedProvider,
  selectedStoreProvider: selectedProvider,
  draftProvider,
  saveError,
  saveLifecycleState,
  pendingSwitchProvider,
  loadDraftFromProvider,
  buildMergedProviderPayload,
  saveDraft,
  resetDraft,
  requestSelectProvider,
  confirmSaveAndSwitch,
  discardAndSwitch,
  cancelSwitch
} = useProviderInspectorDraft(
  {
    providers: computed(() => aiStore.providers),
    saveProvider: (p) => aiStore.saveProvider(p)
  },
  (prov) => {
    if (!fetchedModels.value[prov.id] || fetchedModels.value[prov.id].length === 0) {
      fetchModels(prov);
    }
  }
);

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

const providersHeaderStatus = computed(() => {
  if (aiStore.providers.length === 0) return { label: 'НЕТ ШЛЮЗОВ', tone: 'warn' as const };
  if (activeQuarantineCount.value > 0) return { label: `КАРАНТИН (${activeQuarantineCount.value})`, tone: 'warn' as const };
  if (verifiedProvidersCount.value > 0) return { label: `ПРОВЕРЕНО: ${verifiedProvidersCount.value}`, tone: 'ok' as const };
  if (configuredProvidersCount.value > 0) return { label: 'НАСТРОЕНО · НЕ ПРОВЕРЕНО', tone: 'warn' as const };
  if (enabledProvidersCount.value > 0) return { label: 'ТРЕБУЕТ НАСТРОЙКИ', tone: 'warn' as const };
  return { label: 'ВСЕ ОТКЛЮЧЕНЫ', tone: 'off' as const };
});

const getListStatus = (p: AIProvider) =>
  getProviderListStatus(p, aiStore.getProviderTestState(p), isProviderQuarantined(p.id));

const draftTestResult = computed(() => {
  if (!draftProvider.value) return null;
  return aiStore.getProviderTestState(draftProvider.value);
});

const toggleProviderEnabled = async (provider: AIProvider) => {
  if (!provider || togglingIds.value[provider.id]) return;
  togglingIds.value[provider.id] = true;
  try {
    provider.enabled = !provider.enabled;
    await aiStore.saveProvider(provider);
  } finally {
    togglingIds.value[provider.id] = false;
  }
};

const loadProviders = () => { aiStore.loadProviders(); };

const selectProvider = (provider: AIProvider) => {
  requestSelectProvider(provider);
};

const fetchModels = async (providerArg?: AIProvider | null, isAutoDetect = false) => {
  const base = providerArg || buildMergedProviderPayload() || selectedProvider.value;
  if (!base) return;
  modelFetchStates.value[base.id] = 'loading';
  try {
    if (window.api) {
      const queryPayload = JSON.parse(JSON.stringify(base));
      if (queryPayload.apiKey && queryPayload.apiKey.trim().length > 0 && queryPayload.apiKey !== '••••••••••••••••') {
        queryPayload.noAuthHeader = false;
      }
      const result = await window.api.getAvailableModels(queryPayload);
      const rawList = Array.isArray(result) ? result : (result?.models || []);
      const models = rawList.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      fetchedModels.value[base.id] = models;
      if (draftProvider.value && draftProvider.value.id === base.id) {
        draftProvider.value.lastModelsFetchAt = Date.now();
        if (models.length > 0) {
          draftProvider.value.modelsUpdatedAt = Date.now();
          draftProvider.value.modelsFetchError = undefined;
          if (!draftProvider.value.model || (draftProvider.value.model !== 'auto' && !models.includes(draftProvider.value.model))) {
            draftProvider.value.model = models[0];
          }
          if (!draftProvider.value.selectedModels || draftProvider.value.selectedModels.length === 0) {
            draftProvider.value.selectedModels = [draftProvider.value.model];
          }
          if (isAutoDetect && draftProvider.value.apiKey && draftProvider.value.apiKey !== '••••••••••••••••') {
            draftProvider.value.noAuthHeader = false;
          }
        } else {
          draftProvider.value.modelsFetchError = 'Сервер не вернул модели или недоступен';
        }
      }
    }
  } catch (e: any) {
    console.warn(`[Providers] Fetch models failed for ${base?.name || base?.id}:`, e?.message || e);
    fetchedModels.value[base.id] = [];
    if (draftProvider.value && draftProvider.value.id === base.id) {
      draftProvider.value.lastModelsFetchAt = Date.now();
      draftProvider.value.modelsFetchError = e.message || 'Ошибка загрузки моделей';
    }
  } finally {
    modelFetchStates.value[base.id] = 'idle';
  }
};

const testProvider = async (explicitProvider?: AIProvider) => {
  const candidate = explicitProvider || buildMergedProviderPayload() || selectedProvider.value;
  if (!candidate) return;
  const endpointCheck = validateProviderEndpoint(candidate.endpoint);
  if (!endpointCheck.valid) {
    aiStore.setProviderTestState(candidate.id, {
      status: 'error',
      message: endpointCheck.error,
      checkedAt: Date.now(),
      configFingerprint: buildProviderFingerprint(candidate)
    });
    return;
  }

  if (candidate.apiKey && candidate.apiKey.trim().length > 0 && candidate.apiKey !== '••••••••••••••••') {
    candidate.noAuthHeader = false;
    if (draftProvider.value && draftProvider.value.id === candidate.id) {
      draftProvider.value.noAuthHeader = false;
    }
  }

  const result = await aiStore.testConnection(candidate);
  if ((result as any)?.models && (result as any).models.length > 0) {
    fetchedModels.value[candidate.id] = [...new Set([...(fetchedModels.value[candidate.id] || []), ...(result as any).models])];
  }
  if (result?.success && draftProvider.value && draftProvider.value.id === candidate.id) {
    if ((result as any).workingModel && (!draftProvider.value.model || (draftProvider.value.model !== 'auto' && draftProvider.value.model !== (result as any).workingModel))) {
      draftProvider.value.model = (result as any).workingModel;
    }
    fetchModels(candidate, true);
  }
};

const addProvider = async (preset: ProviderPreset) => {
  const newId = 'new_' + Date.now();
  const defaultModels = preset.model ? [preset.model] : [];
  const isLocalFreeGateway = preset.type === 'local' && preset.freeTier === 'free';
  const newProvider: AIProvider = {
    id: newId, name: preset.name, type: preset.type, endpoint: preset.endpoint,
    model: preset.model || '', selectedModels: defaultModels, routingStrategy: 'smart_route' as const,
    priority: isLocalFreeGateway ? 1 : aiStore.providers.length + 1, maxTokens: 2048, temperature: 0.7,
    enabled: true, apiKey: '', noAuthHeader: isLocalFreeGateway, isExclusive: false
  };
  await aiStore.saveProvider(newProvider);
  loadDraftFromProvider(newProvider);
  fetchModels(newProvider);
};

const handleManualIpConnected = async (newProvider: any) => {
  await loadProviders();
  if (newProvider?.id) {
    loadDraftFromProvider(newProvider);
    testProvider(newProvider);
  }
};

const deleteProvider = async (id: string) => { await aiStore.deleteProvider(id); };
onMounted(loadProviders);
</script>

<template>
  <section id="section-providers" class="flex flex-col gap-10 text-[var(--arc-text-primary)] scroll-mt-14">
    <SettingsSectionHeader variant="workspace" categoryLabel="Интеллект · Подсистема 02" title="Облачные провайдеры" description="Управление внешними API-провайдерами, защищённое хранение ключей (DPAPI) и подключение локальных сетевых шлюзов по IP (FreeAPILLM)." :statusLabel="providersHeaderStatus.label" :statusTone="providersHeaderStatus.tone" :blockCountText="`${aiStore.providers.length} зарегистрировано`" :icon="Cloud">
      <template #summary>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] font-mono text-xs tabular-nums" :style="{ boxShadow: 'var(--arc-well-shadow)' }">
          <div class="flex flex-col gap-1 px-2.5">
            <span class="text-[var(--arc-text-hint)]">Всего шлюзов</span>
            <span class="text-sm font-semibold text-[var(--arc-text-primary)]">{{ aiStore.providers.length }} <span class="text-xs font-normal text-[var(--arc-text-hint)]">({{ cloudGatewaysCount }} обл. / {{ localGatewaysCount }} лок.)</span></span>
          </div>
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Состояние проверки</span>
            <span class="text-sm font-semibold" :class="verifiedProvidersCount > 0 ? 'text-[var(--status-ok)]' : configuredProvidersCount > 0 ? 'text-[var(--status-warn)]' : 'text-[var(--arc-text-muted)]'">{{ verifiedProvidersCount }} проверено <span class="text-xs font-normal text-[var(--arc-text-hint)]">из {{ enabledProvidersCount }} вкл.</span></span>
          </div>
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Google Gemini API</span>
            <span class="text-sm font-semibold" :class="hasGeminiKey ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">{{ hasGeminiKey ? 'Ключ задан' : 'Не настроен' }}</span>
          </div>
          <div class="flex flex-col gap-1 px-2.5 sm:border-l border-[var(--arc-hairline)]">
            <span class="text-[var(--arc-text-hint)]">Карантин сбоев</span>
            <span class="text-sm font-semibold" :class="activeQuarantineCount > 0 ? 'text-[var(--status-err)]' : 'text-[var(--arc-text-secondary)]'">{{ activeQuarantineCount > 0 ? `${activeQuarantineCount} заблокировано` : '0 (норма)' }}</span>
          </div>
        </div>
      </template>
    </SettingsSectionHeader>

    <SettingsGroup indexLabel="01" title="Подключение нового шлюза" description="Добавьте готовый профиль из каталога пресетов, настройте базовый ключ Google Gemini или подключите локальный сервер по IP.">
      <div class="p-4 sm:p-5 rounded-[16px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex flex-col lg:flex-row lg:items-center justify-between gap-3.5" :style="{ background: 'var(--arc-block-gradient, linear-gradient(180deg, #161616 0%, #0F0F0F 100%))', boxShadow: 'var(--arc-block-elevation)' }">
        <div class="flex flex-col gap-1">
          <span class="text-[13.5px] font-sans font-semibold text-[var(--arc-text-primary)]">Инструменты регистрации API и сетевых узлов</span>
          <span class="text-xs text-[var(--arc-text-hint)]">OpenRouter, OpenAI, DeepSeek, Anthropic, Groq, а также локальные шлюзы FreeLLMAPI и LM Studio.</span>
        </div>

        <div class="flex items-center gap-2 flex-wrap shrink-0">
          <PresetCatalogComp @select-preset="addProvider" />
          <button id="providers.gemini_key" type="button" data-setting-id="providers.gemini_key" data-search="ключ google gemini api key облако провайдеры" @click="showGeminiModal = true" class="px-3 py-1.5 bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono text-[var(--arc-text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap" title="Настройка Google Gemini API ключа">
            <Sparkles class="w-3.5 h-3.5" :class="hasGeminiKey ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'" />
            <span>GEMINI КЛЮЧ</span>
            <span class="w-1.5 h-1.5 rounded-full" :class="hasGeminiKey ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-warn)]'"></span>
          </button>
          <button id="providers.manual_ip" type="button" data-setting-id="providers.manual_ip" @click="showManualIpModal = true" class="px-3 py-1.5 bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap" title="Ручной ввод IP для FreeAPILLM (127.0.0.1:3067) или локального шлюза" data-search="freeapillm локальный шлюз по ip 127.0.0.1:3067 ввести ip">
            <Globe class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" />
            <span>ВВЕСТИ IP</span>
          </button>
          <button type="button" @click="loadProviders" class="px-3 py-1.5 bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap" title="Обновить список провайдеров">
            <RefreshCw class="w-3.5 h-3.5 text-[var(--arc-text-muted)]" :class="{ 'animate-spin': aiStore.isLoading }" />
            <span>ОБНОВИТЬ</span>
          </button>
        </div>
      </div>

      <div v-if="!hasGeminiKey" class="px-4 py-3 rounded-[14px] bg-[var(--arc-well)] border border-[var(--status-warn)]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2.5 text-[var(--status-warn)]">
          <ShieldAlert class="w-4 h-4 shrink-0 text-[var(--status-warn)]" />
          <span class="text-xs text-[var(--arc-text-secondary)] font-sans">Ключ Google Gemini API не указан. Укажите ключ для облачного контура по умолчанию и мультимодальных функций.</span>
        </div>
        <button type="button" @click="showGeminiModal = true" class="text-xs font-mono text-[var(--status-warn)] hover:text-[var(--arc-text-primary)] uppercase tracking-wider px-3 py-1.5 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition shrink-0 cursor-pointer whitespace-nowrap self-start sm:self-center">Ввести ключ</button>
      </div>
    </SettingsGroup>

    <SettingsGroup indexLabel="02" title="Реестр шлюзов и инспектор провайдера" description="Выберите шлюз в списке слева для настройки авторизации, моделей и параметров генерации в инспекторе справа." :badgeText="`Всего: ${aiStore.providers.length}`">
      <div v-if="aiStore.isLoading && aiStore.providers.length === 0" class="py-8 px-4 border border-[var(--arc-hairline)] rounded-[16px] text-center flex flex-col items-center gap-2 bg-[var(--arc-block)]">
        <RefreshCw class="w-5 h-5 text-[var(--accent)] animate-spin mb-1" />
        <span class="text-xs font-mono text-[var(--arc-text-primary)]">Загрузка конфигурации провайдеров...</span>
      </div>

      <div v-else-if="aiStore.providers.length === 0" class="py-9 px-4 border border-dashed border-[var(--arc-hairline)] rounded-[16px] text-center flex flex-col items-center gap-2.5 bg-[var(--arc-well)]">
        <Cpu class="w-5 h-5 text-[var(--arc-text-muted)]" />
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase">Зарегистрированные шлюзы отсутствуют</span>
        <span class="text-xs text-[var(--arc-text-hint)] max-w-md">В системе не настроен ни один внешний провайдер. Добавьте профиль из каталога пресетов выше или подключите локальный сервер по IP.</span>
      </div>

      <!-- MASTER-DETAIL WORKSPACE -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-[296px_minmax(0,1fr)] gap-5 items-start">
        <div class="p-2.5 rounded-[16px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] flex flex-col gap-2 min-w-0" :style="{ boxShadow: 'var(--arc-well-shadow)' }">
          <div class="px-2.5 py-1.5 flex items-center justify-between border-b border-[var(--arc-hairline)] text-xs font-mono">
            <span class="text-[var(--arc-text-hint)] uppercase">Список шлюзов</span>
            <span class="text-[var(--arc-text-secondary)] tabular-nums">{{ enabledProvidersCount }} / {{ aiStore.providers.length }} вкл.</span>
          </div>

          <div class="flex flex-col gap-1.5 max-h-[540px] overflow-y-auto pr-0.5" role="list" aria-label="Список шлюзов провайдеров">
            <div v-for="p in aiStore.providers" :key="p.id" role="listitem" class="p-2.5 rounded-[12px] border transition-colors flex items-center gap-2 select-none" :class="selectedProvider?.id === p.id ? 'bg-[var(--arc-block-elevated)] border-[var(--accent)]/45' : 'bg-[var(--arc-block)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]'">
              <button type="button" :disabled="Boolean(togglingIds[p.id])" :aria-pressed="Boolean(p.enabled)" :aria-label="`${p.enabled ? 'Отключить' : 'Включить'} шлюз ${p.name}`" @click="toggleProviderEnabled(p)" class="w-7 h-7 rounded-[8px] border border-[var(--arc-hairline)] bg-[var(--arc-well)] hover:bg-[var(--arc-hover)] flex items-center justify-center shrink-0 cursor-pointer transition-colors focus:outline-none focus:border-[var(--accent)] disabled:opacity-50" :title="p.enabled ? 'Шлюз включён в ротации (нажмите для отключения)' : 'Шлюз отключён (нажмите для включения)'">
                <span class="w-2 h-2 rounded-full" :class="getListStatus(p).dot"></span>
              </button>

              <button type="button" :aria-pressed="selectedProvider?.id === p.id" :aria-label="`Выбрать шлюз ${p.name}, статус: ${getListStatus(p).label}`" @click="selectProvider(p)" class="flex-1 min-w-0 text-left flex flex-col gap-1.5 px-1.5 py-0.5 rounded-[8px] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-mono font-bold text-[var(--arc-text-primary)] truncate">{{ p.name }}</span>
                  <span class="text-xs font-mono font-semibold shrink-0" :class="getListStatus(p).text">{{ getListStatus(p).label }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 text-xs font-mono text-[var(--arc-text-hint)]">
                  <span class="truncate">{{ p.model || (p.selectedModels && p.selectedModels[0]) || 'Модель не выбрана' }}</span>
                  <span class="px-1.5 py-0.5 rounded bg-[var(--arc-well)] border border-[var(--arc-hairline)] uppercase shrink-0">{{ p.type === 'local' ? 'LOC' : 'API' }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <ProviderCard
          v-if="selectedProvider && draftProvider"
          :key="selectedProvider.id"
          :provider="draftProvider"
          :enabled="Boolean(selectedProvider.enabled)"
          :is-expanded="true"
          :test-result="draftTestResult"
          :fetched-models="fetchedModels[selectedProvider.id] || []"
          :is-loading-models="modelFetchStates[selectedProvider.id] === 'loading'"
          :save-state="saveLifecycleState"
          :save-error="saveError"
          :pending-switch-target-name="pendingSwitchProvider?.name || null"
          :is-quarantined="isProviderQuarantined(selectedProvider.id)"
          :quarantine-mins-left="getQuarantineMinutesLeft(selectedProvider.id)"
          @toggle-expand="selectProvider(selectedProvider)"
          @toggle-enabled="toggleProviderEnabled(selectedProvider)"
          @save-draft="saveDraft"
          @reset-draft="resetDraft"
          @confirm-save-switch="confirmSaveAndSwitch"
          @discard-switch="discardAndSwitch"
          @cancel-switch="cancelSwitch"
          @test-provider="testProvider()"
          @fetch-models="(isAuto) => fetchModels(undefined, isAuto)"
          @delete-provider="deleteProvider(selectedProvider.id)"
        />
      </div>

      <div class="px-4 py-3 rounded-[14px] border border-[var(--arc-hairline)] bg-[var(--arc-well)] flex flex-wrap items-center justify-between gap-3">
        <span class="text-xs font-mono text-[var(--arc-text-hint)]">Связанные разделы:</span>
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
