<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';
import { useAiConfigStore } from '../../../../stores/aiConfig';
import { getLocalEngineSessionState } from '../../composables/useLocalAIEngine';
import { getFallbackContourStatus } from '../../logic/ai-status';
import SettingsGroup from '../primitives/SettingsGroup.vue';
import SettingsBlock from '../primitives/SettingsBlock.vue';
import SettingsRow from '../primitives/SettingsRow.vue';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import CrossLink from '../primitives/CrossLink.vue';
import ArcToggle from '../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../components/ui/ArcSlider.vue';
import { GitBranch, Settings2, Activity, ShieldAlert } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const aiConfigStore = useAiConfigStore();
const localSession = getLocalEngineSessionState();

const fallbackStatus = computed(() =>
  getFallbackContourStatus({
    forcedOfflineMode: settingsStore.forcedOfflineMode,
    useLocalLLM: settingsStore.useLocalLLM,
    useSmartRouting: settingsStore.useSmartRouting,
    localLLMPriority: settingsStore.localLLMPriority,
    localLLMModel: settingsStore.localLLMModel,
    builtinLLMModel: settingsStore.builtinLLMModel,
    providers: aiConfigStore.providers,
    getProviderTestState: (p) => aiConfigStore.getProviderTestState(p),
    isBuiltinDownloaded: localSession.isBuiltinDownloaded.value,
    builtinCheckError: localSession.builtinCheckError.value,
    isOllamaOnline: localSession.isOllamaOnline.value,
    verifiedInference: localSession.verifiedInference.value
  })
);

const activeRouteSummary = computed(() => {
  if (settingsStore.forcedOfflineMode) {
    return {
      mode: 'Строгий офлайн (только локально)',
      shortStatus: 'ОФЛАЙН КОНТУР',
      tone: 'warn' as const,
      detail: 'Все внешние сетевые запросы заблокированы'
    };
  }
  if (settingsStore.useSmartRouting) {
    return {
      mode: `Семантический роутер (≤ ${settingsStore.smartRoutingThreshold} симв. → локально)`,
      shortStatus: 'УМНЫЙ МАРШРУТ',
      tone: 'ok' as const,
      detail: `Короткие реплики обрабатываются локально, сложные — в облаке`
    };
  }
  if (settingsStore.useLocalLLM) {
    return {
      mode: settingsStore.localLLMPriority === 'primary'
        ? 'Приоритет: Локальный ИИ → Облако'
        : 'Приоритет: Облако → Локальный резерв',
      shortStatus: settingsStore.localLLMPriority === 'primary' ? 'ЛОКАЛЬНЫЙ ПРИОРИТЕТ' : 'ОБЛАЧНЫЙ ПРИОРИТЕТ',
      tone: 'ok' as const,
      detail: settingsStore.localLLMPriority === 'primary'
        ? 'Основной контур — локальный процессор/GPU'
        : 'Локальный движок используется как фолбек'
    };
  }
  return {
    mode: 'Прямой облачный маршрут',
    shortStatus: 'ТОЛЬКО ОБЛАКО',
    tone: 'off' as const,
    detail: 'Локальный контур отключён, запросы идут через API-шлюзы'
  };
});

const localRuntimeLabel = computed(() => {
  if (!settingsStore.useLocalLLM) return 'Отключён';
  return settingsStore.localLLMModel === 'builtin'
    ? `Встроенный GGUF (${settingsStore.builtinLLMModel || 'LFM3'})`
    : `Ollama (${settingsStore.localLLMModel || 'llama3.2'})`;
});

const thresholdPercent = computed(() => {
  return Math.max(0, Math.min(100, ((settingsStore.smartRoutingThreshold - 10) / (250 - 10)) * 100));
});
</script>

<template>
  <section id="section-router" class="scroll-mt-14 flex flex-col gap-7 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + Сводка активного маршрута -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Интеллект · Подсистема 01"
      title="Маршрутизация моделей"
      description="Управление распределением диалоговых запросов между локальным контуром и облачными шлюзами, калибровка семантического роутера и политики автономности."
      :statusLabel="activeRouteSummary.shortStatus"
      :statusTone="activeRouteSummary.tone"
      blockCountText="2 функциональные группы"
      :icon="GitBranch"
    >
      <template #summary>
        <!-- Текущий маршрут (Реальные показатели без декоративных значений) -->
        <div
          class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-[14px] bg-[var(--arc-block)] border border-[var(--arc-hairline)]"
          :style="{ background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
        >
          <!-- Колонка 1: Реальная стратегия исполнения -->
          <div class="flex flex-col gap-1 px-2 py-1">
            <div class="flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">
              <Activity class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Текущая стратегия</span>
            </div>
            <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] truncate">{{ activeRouteSummary.mode }}</span>
            <span class="text-xs text-[var(--arc-text-hint)] leading-snug">{{ activeRouteSummary.detail }}</span>
          </div>

          <!-- Колонка 2: Состояние локального ИИ -->
          <div class="flex flex-col gap-1 px-2 py-1 md:border-l border-t md:border-t-0 border-[var(--arc-hairline)] pt-2.5 md:pt-1 md:pl-4">
            <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">Контур локального ИИ</span>
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="settingsStore.useLocalLLM ? 'bg-[var(--status-ok)]' : 'bg-[var(--arc-text-muted)]'"></span>
              <span class="text-xs font-mono font-semibold" :class="settingsStore.useLocalLLM ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'">{{ settingsStore.useLocalLLM ? 'АКТИВЕН' : 'ВЫКЛЮЧЕН' }}</span>
            </div>
            <span class="text-xs font-mono text-[var(--arc-text-hint)] truncate">{{ localRuntimeLabel }}</span>
          </div>

          <!-- Колонка 3: Резервный контур и потоковый вывод -->
          <div class="flex flex-col gap-1 px-2 py-1 md:border-l border-t md:border-t-0 border-[var(--arc-hairline)] pt-2.5 md:pt-1 md:pl-4">
            <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">Резервный контур · SSE {{ settingsStore.llmStreamingEnabled ? 'ВКЛ' : 'ВЫКЛ' }}</span>
            <div class="flex items-center gap-2 text-xs font-mono">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="fallbackStatus.tone === 'ok' ? 'bg-[var(--status-ok)]' : fallbackStatus.tone === 'warn' ? 'bg-[var(--status-warn)]' : fallbackStatus.tone === 'err' ? 'bg-[var(--status-err)]' : 'bg-[var(--arc-text-muted)]'"></span>
              <span class="font-semibold truncate" :class="fallbackStatus.tone === 'ok' ? 'text-[var(--status-ok)]' : fallbackStatus.tone === 'warn' ? 'text-[var(--status-warn)]' : fallbackStatus.tone === 'err' ? 'text-[var(--status-err)]' : 'text-[var(--arc-text-muted)]'">{{ fallbackStatus.label }}</span>
            </div>
            <span class="text-xs text-[var(--arc-text-hint)] leading-snug">{{ fallbackStatus.detail }}</span>
          </div>
        </div>
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Функциональная группа 1 — Логика распределения запросов -->
    <SettingsGroup
      indexLabel="01"
      title="Логика распределения запросов"
      description="Правила автоматического выбора между локальной моделью и облачными API по длине и приоритету."
      :badgeText="settingsStore.useSmartRouting ? `Порог: ${settingsStore.smartRoutingThreshold} симв.` : 'Ручной приоритет'"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <!-- Семантический роутер -->
          <SettingsRow
            id="router.smartRouting"
            label="Семантический роутер (Умный маршрут)"
            description="Автоматическое разделение запросов между быстрой локальной моделью и облачным API по длине и сложности."
            data-search="семантический роутер умный маршрут smart routing автовыбор"
          >
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs font-mono tracking-wider uppercase text-[var(--arc-text-muted)]">
                {{ settingsStore.useSmartRouting ? 'АКТИВЕН' : 'ОТКЛЮЧЕН' }}
              </span>
              <ArcToggle 
                v-model="settingsStore.useSmartRouting" 
                data-setting-id="router.smartRouting"
              />
            </div>
          </SettingsRow>

          <!-- Уровень 3: Вложенная панель калибровки порога маршрутизации -->
          <div 
            v-show="settingsStore.useSmartRouting" 
            class="p-4 sm:p-5 flex flex-col gap-4 bg-[var(--arc-plane)]"
            data-search="порог роутера router threshold уверенность лимит символов"
          >
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Settings2 class="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span class="text-xs font-mono font-semibold text-[var(--arc-text-primary)] uppercase tracking-wider">
                  Калибровка порога маршрутизации
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  v-for="presetVal in [40, 100, 180]"
                  :key="presetVal"
                  type="button"
                  @click="settingsStore.smartRoutingThreshold = presetVal"
                  class="px-2 py-0.5 rounded-[6px] text-xs font-mono border transition-colors cursor-pointer tabular-nums"
                  :class="settingsStore.smartRoutingThreshold === presetVal
                    ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold'
                    : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
                >
                  {{ presetVal }} симв.
                </button>
              </div>
            </div>

            <!-- Двухзонная шкала распределения -->
            <div class="flex flex-col gap-2 p-3 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)]">
              <div class="flex items-center justify-between text-xs font-mono tabular-nums">
                <span class="text-[var(--status-ok)]">
                  ≤ {{ settingsStore.smartRoutingThreshold }} симв. → Локальный контур
                </span>
                <span class="text-[var(--arc-text-secondary)]">
                  > {{ settingsStore.smartRoutingThreshold }} симв. → Облачный шлюз
                </span>
              </div>

              <div class="relative h-2 rounded-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] overflow-hidden">
                <div 
                  class="absolute inset-y-0 left-0 bg-[var(--status-ok)]/45"
                  :style="{ width: thresholdPercent + '%' }"
                ></div>
                <div 
                  class="absolute inset-y-0 right-0 bg-[var(--arc-selected)]"
                  :style="{ width: (100 - thresholdPercent) + '%' }"
                ></div>
                <div 
                  class="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[var(--arc-text-primary)] border border-[var(--arc-block)] shadow"
                  :style="{ left: 'calc(' + thresholdPercent + '% - 5px)' }"
                ></div>
              </div>

              <div class="pt-1">
                <ArcSlider 
                  v-model="settingsStore.smartRoutingThreshold" 
                  :min="10" 
                  :max="250" 
                  :step="5"
                  label="Лимит символов для локальной обработки"
                  unit=" симв."
                  :show-value="true"
                />
                <div class="flex justify-between text-xs text-[var(--arc-text-hint)] font-mono mt-1.5 tabular-nums">
                  <span>10 симв. (чаще облако)</span>
                  <span>250 симв. (чаще локально)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Базовый приоритет исполнения -->
          <SettingsRow
            id="localai.priority"
            label="Базовый приоритет исполнения"
            description="Определяет, какой контур отвечает первым при отключённом семантическом роутере или равном приоритете."
            :tech="settingsStore.forcedOfflineMode ? 'Внимание: активен принудительный офлайн-режим (облачный контур заблокирован)' : undefined"
            data-search="приоритет локального ии local priority сначала облако сначала локальная"
          >
            <div 
              class="flex gap-1.5 p-1 bg-[var(--arc-input)] rounded-[10px] border border-[var(--arc-hairline)] shrink-0"
              :style="{ boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.75)' }"
              data-setting-id="localai.priority"
            >
              <button 
                type="button"
                class="py-1.5 px-3 rounded-[8px] text-xs font-mono font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                :class="settingsStore.localLLMPriority === 'fallback' 
                  ? 'bg-[var(--arc-block)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' 
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                @click="settingsStore.localLLMPriority = 'fallback'"
              >
                <span v-if="settingsStore.localLLMPriority === 'fallback'" class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                Сначала облако
              </button>
              <button 
                type="button"
                class="py-1.5 px-3 rounded-[8px] text-xs font-mono font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                :class="settingsStore.localLLMPriority === 'primary' 
                  ? 'bg-[var(--arc-block)] text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' 
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                @click="settingsStore.localLLMPriority = 'primary'"
              >
                <span v-if="settingsStore.localLLMPriority === 'primary'" class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                Сначала локальная
              </button>
            </div>
          </SettingsRow>
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Функциональная группа 2 — Оркестрация генерации и автономность -->
    <SettingsGroup
      indexLabel="02"
      title="Оркестрация генерации и автономность"
      description="Потоковый вывод токенов, строгая сетевая изоляция и автоматическая разгрузка видеокарты в фоне."
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
          <!-- Потоковая генерация -->
          <SettingsRow
            id="providers.streaming"
            label="Потоковая генерация ответов (LLM Streaming)"
            description="Отображать ответ по мере генерации токенов в реальном времени."
            data-search="потоковая генерация streaming llm tokens"
          >
            <div class="flex items-center gap-3 shrink-0">
              <span class="text-xs font-mono tracking-wider uppercase text-[var(--arc-text-muted)]">
                {{ settingsStore.llmStreamingEnabled ? 'ВКЛ' : 'ВЫКЛ' }}
              </span>
              <ArcToggle 
                v-model="settingsStore.llmStreamingEnabled" 
                data-setting-id="providers.streaming"
              />
            </div>
          </SettingsRow>

          <!-- Принудительный офлайн-режим -->
          <SettingsRow
            id="localai.forcedOfflineMode"
            label="Принудительный офлайн-режим"
            description="Блокировать все сетевые запросы к внешним облачным сервисам ИИ и работать строго локально."
            data-search="принудительный офлайн forced offline mode без интернета"
            data-setting-id="localai.forcedOfflineMode"
          >
            <ArcToggle 
              v-model="settingsStore.forcedOfflineMode" 
            />
          </SettingsRow>

          <!-- Облачный режим в фоне -->
          <SettingsRow
            id="localai.cloudLlmInGameMode"
            label="Облачные API в фоновом режиме"
            description="При сворачивании окна переключать инференс на облачный шлюз для освобождения видеокарты."
            :tech="settingsStore.forcedOfflineMode ? 'Недоступно при включённом принудительном офлайн-режиме' : undefined"
            :disabled="settingsStore.forcedOfflineMode"
            data-search="эко режим облако фоновый режим stealth eco cloud"
            data-setting-id="localai.cloudLlmInGameMode"
          >
            <ArcToggle 
              v-model="settingsStore.cloudLlmInGameMode" 
              :disabled="settingsStore.forcedOfflineMode"
            />
          </SettingsRow>
        </div>

        <!-- Предупреждение при офлайн-режиме без локального ИИ -->
        <div v-if="settingsStore.forcedOfflineMode && !settingsStore.useLocalLLM" class="px-4 py-3 border-t border-[var(--status-warn)]/30 bg-[var(--arc-plane)] flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-xs text-[var(--status-warn)]">
            <ShieldAlert class="w-4 h-4 shrink-0" />
            <span>Офлайн-режим включён, но локальный ИИ деактивирован. Включите локальный контур для работы диалогов.</span>
          </div>
          <CrossLink label="Открыть Локальный ИИ" tab="intelligence" sectionId="section-local" />
        </div>

        <!-- Связанные подсистемы -->
        <div class="px-4 sm:px-5 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">Связанные разделы:</span>
          <div class="flex flex-wrap items-center gap-4">
            <CrossLink label="Облачные провайдеры" tab="intelligence" sectionId="section-providers" />
            <CrossLink label="Локальный ИИ (GGUF / Ollama)" tab="intelligence" sectionId="section-local" />
            <CrossLink label="Кэширование и хранилище" tab="system" sectionId="section-storage" />
          </div>
        </div>
      </SettingsBlock>
    </SettingsGroup>
  </section>
</template>
