<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';
import { useAiConfigStore } from '../../../../stores/aiConfig';
import { getLocalEngineSessionState } from '../../composables/useLocalAIEngine';
import { getFallbackContourStatus, getLocalContourStatus } from '../../logic/ai-status';
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

const localContourStatus = computed(() => getLocalContourStatus({
  useLocalLLM: settingsStore.useLocalLLM,
  localLLMModel: settingsStore.localLLMModel,
  builtinLLMModel: settingsStore.builtinLLMModel,
  isBuiltinDownloaded: localSession.isBuiltinDownloaded.value,
  builtinCheckError: localSession.builtinCheckError.value,
  checkingBuiltin: localSession.checkingBuiltin.value,
  hasProbedBuiltin: localSession.hasProbedBuiltin.value,
  isOllamaOnline: localSession.isOllamaOnline.value,
  checkingOllama: localSession.checkingOllama.value,
  hasProbedOllama: localSession.hasProbedOllama.value,
  verifiedInference: localSession.verifiedInference.value
}));

const fallbackStatus = computed(() => getFallbackContourStatus({
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
  hasProbedBuiltin: localSession.hasProbedBuiltin.value,
  isOllamaOnline: localSession.isOllamaOnline.value,
  hasProbedOllama: localSession.hasProbedOllama.value,
  verifiedInference: localSession.verifiedInference.value
}));

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
      tone: localContourStatus.value.tone === 'ok' ? ('ok' as const) : ('warn' as const),
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
  <section
    id="section-router"
    class="scroll-mt-14 flex flex-col gap-10 text-[var(--arc-text-primary)]"
    :style="{ fontFamily: 'var(--font-ui)' }"
  >
    <!-- Уровень 1: Workspace Header + Приборная шкала телеметрии маршрута (HUD Readout Strip) -->
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
        <!-- Приборная шкала телеметрии (HUD Readout Strip — Recessed Well, отличная от карточек настроек) -->
        <div
          class="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-[12px] bg-[var(--arc-well)] border border-[var(--arc-hairline)] overflow-hidden"
          :style="{ boxShadow: 'var(--arc-well-shadow)' }"
        >
          <!-- Колонка 1: Реальная стратегия исполнения -->
          <div class="flex flex-col gap-1 px-4 py-3 min-w-0">
            <div class="flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-machine)] tracking-wider uppercase">
              <Activity class="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Текущая стратегия</span>
            </div>
            <span class="text-[14px] font-semibold text-[var(--arc-text-primary)] truncate">{{ activeRouteSummary.mode }}</span>
            <span class="text-xs text-[var(--arc-text-hint)] leading-snug">{{ activeRouteSummary.detail }}</span>
          </div>

          <!-- Колонка 2: Состояние локального ИИ -->
          <div class="flex flex-col gap-1 px-4 py-3 min-w-0 md:border-l border-t md:border-t-0 border-[var(--arc-divider)]">
            <span class="text-xs font-mono text-[var(--arc-text-machine)] tracking-wider uppercase">Контур локального ИИ</span>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full shrink-0" :class="localContourStatus.tone === 'ok' ? 'bg-[var(--status-ok)]' : localContourStatus.tone === 'warn' ? 'bg-[var(--status-warn)]' : localContourStatus.tone === 'err' ? 'bg-[var(--status-err)]' : 'bg-[var(--arc-text-muted)]'"></span>
              <span class="text-[14px] font-mono font-semibold tabular-nums truncate" :class="localContourStatus.tone === 'ok' ? 'text-[var(--status-ok)]' : localContourStatus.tone === 'warn' ? 'text-[var(--status-warn)]' : localContourStatus.tone === 'err' ? 'text-[var(--status-err)]' : 'text-[var(--arc-text-muted)]'">{{ localContourStatus.label }}</span>
            </div>
            <span class="text-xs font-mono text-[var(--arc-text-hint)] truncate tabular-nums" :title="localContourStatus.detail">{{ localRuntimeLabel }} · {{ localContourStatus.detail }}</span>
          </div>

          <!-- Колонка 3: Резервный контур и потоковый вывод -->
          <div class="flex flex-col gap-1 px-4 py-3 min-w-0 md:border-l border-t md:border-t-0 border-[var(--arc-divider)]">
            <span class="text-xs font-mono text-[var(--arc-text-machine)] tracking-wider uppercase tabular-nums">Резервный контур · SSE {{ settingsStore.llmStreamingEnabled ? 'ВКЛ' : 'ВЫКЛ' }}</span>
            <div class="flex items-center gap-2 text-[14px] font-mono">
              <span class="w-2 h-2 rounded-full shrink-0" :class="fallbackStatus.tone === 'ok' ? 'bg-[var(--status-ok)]' : fallbackStatus.tone === 'warn' ? 'bg-[var(--status-warn)]' : fallbackStatus.tone === 'err' ? 'bg-[var(--status-err)]' : 'bg-[var(--arc-text-muted)]'"></span>
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
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Семантический роутер -->
          <SettingsRow
            id="router.smartRouting"
            label="Семантический роутер (Умный маршрут)"
            description="Автоматическое разделение запросов между быстрой локальной моделью и облачным API по длине и сложности."
            data-search="семантический роутер умный маршрут smart routing автовыбор"
          >
            <div class="flex items-center gap-3 shrink-0">
              <span
                class="inline-flex items-center gap-1.5 text-xs font-mono font-medium tabular-nums"
                :class="settingsStore.useSmartRouting ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :class="settingsStore.useSmartRouting ? 'bg-[var(--status-ok)]' : 'bg-[var(--arc-text-muted)]'"
                ></span>
                <span>{{ settingsStore.useSmartRouting ? 'Активен' : 'Отключён' }}</span>
              </span>
              <ArcToggle 
                v-model="settingsStore.useSmartRouting" 
                data-setting-id="router.smartRouting"
              />
            </div>
          </SettingsRow>

          <!-- Уровень 3: Втопленный Приборный Колодец (Recessed Well) калибровки порога маршрутизации -->
          <div 
            v-show="settingsStore.useSmartRouting" 
            class="px-5 py-5 flex flex-col gap-4 bg-[var(--arc-well)]"
            :style="{ boxShadow: 'var(--arc-well-shadow)' }"
            data-search="порог роутера router threshold уверенность лимит символов"
          >
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <Settings2 class="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span class="text-[13.5px] font-semibold text-[var(--arc-text-primary)] tracking-tight">
                  Калибровка порога маршрутизации
                </span>
                <span class="text-xs font-mono text-[var(--arc-text-muted)] tabular-nums">
                  · {{ settingsStore.smartRoutingThreshold }} симв.
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  v-for="presetVal in [40, 100, 180]"
                  :key="presetVal"
                  type="button"
                  @click="settingsStore.smartRoutingThreshold = presetVal"
                  class="px-2.5 py-1 rounded-[7px] text-xs font-mono border transition-colors cursor-pointer tabular-nums"
                  :class="settingsStore.smartRoutingThreshold === presetVal
                    ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border-[var(--accent)] font-semibold'
                    : 'bg-[var(--arc-block)] text-[var(--arc-text-muted)] border-[var(--arc-hairline)] hover:text-[var(--arc-text-primary)]'"
                >
                  {{ presetVal }} симв.
                </button>
              </div>
            </div>

            <!-- Двухзонная шкала распределения -->
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                <span class="text-[var(--status-ok)] font-medium">
                  ≤ {{ settingsStore.smartRoutingThreshold }} симв. → Локальный контур
                </span>
                <span class="text-[var(--arc-text-secondary)]">
                  &gt; {{ settingsStore.smartRoutingThreshold }} симв. → Облачный шлюз
                </span>
              </div>

              <div class="relative h-2.5 rounded-full bg-[var(--arc-block)] border border-[var(--arc-hairline)] overflow-hidden">
                <div 
                  class="absolute inset-y-0 left-0 bg-[var(--status-ok)]/50 transition-all duration-150"
                  :style="{ width: thresholdPercent + '%' }"
                ></div>
                <div 
                  class="absolute inset-y-0 right-0 bg-[var(--arc-selected)]"
                  :style="{ width: (100 - thresholdPercent) + '%' }"
                ></div>
                <div 
                  class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--arc-text-primary)] border-2 border-[var(--arc-well)] shadow"
                  :style="{ left: 'calc(' + thresholdPercent + '% - 6px)' }"
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
              class="flex gap-1.5 p-1 bg-[var(--arc-well)] rounded-[10px] border border-[var(--arc-hairline)] shrink-0"
              :style="{ boxShadow: 'var(--arc-well-shadow)' }"
              data-setting-id="localai.priority"
            >
              <button 
                type="button"
                class="py-1.5 px-3.5 rounded-[7px] text-xs font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-2"
                :class="settingsStore.localLLMPriority === 'fallback' 
                  ? 'bg-[var(--arc-block)] text-[var(--arc-text-primary)] border border-[var(--arc-edge-strong)] shadow-sm' 
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                @click="settingsStore.localLLMPriority = 'fallback'"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="settingsStore.localLLMPriority === 'fallback' ? 'bg-[var(--accent)]' : 'bg-[var(--arc-text-disabled)]'"></span>
                <span>Сначала облако</span>
              </button>
              <button 
                type="button"
                class="py-1.5 px-3.5 rounded-[7px] text-xs font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-2"
                :class="settingsStore.localLLMPriority === 'primary' 
                  ? 'bg-[var(--arc-block)] text-[var(--arc-text-primary)] border border-[var(--arc-edge-strong)] shadow-sm' 
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                @click="settingsStore.localLLMPriority = 'primary'"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="settingsStore.localLLMPriority === 'primary' ? 'bg-[var(--status-ok)]' : 'bg-[var(--arc-text-disabled)]'"></span>
                <span>Сначала локальная</span>
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
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Потоковая генерация -->
          <SettingsRow
            id="providers.streaming"
            label="Потоковая генерация ответов (LLM Streaming)"
            description="Отображать ответ по мере генерации токенов в реальном времени."
            data-search="потоковая генерация streaming llm tokens"
          >
            <div class="flex items-center gap-3 shrink-0">
              <span
                class="inline-flex items-center gap-1.5 text-xs font-mono font-medium tabular-nums"
                :class="settingsStore.llmStreamingEnabled ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :class="settingsStore.llmStreamingEnabled ? 'bg-[var(--status-ok)]' : 'bg-[var(--arc-text-muted)]'"
                ></span>
                <span>{{ settingsStore.llmStreamingEnabled ? 'Вкл' : 'Выкл' }}</span>
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

        <!-- Предупреждение при офлайн-режиме без локального ИИ (Well) -->
        <div
          v-if="settingsStore.forcedOfflineMode && !settingsStore.useLocalLLM"
          class="px-5 py-3.5 border-t border-[var(--status-warn)]/30 bg-[var(--arc-well)] flex flex-wrap items-center justify-between gap-3"
          :style="{ boxShadow: 'var(--arc-well-shadow)' }"
        >
          <div class="flex items-center gap-2 text-xs text-[var(--status-warn)]">
            <ShieldAlert class="w-4 h-4 shrink-0" />
            <span>Офлайн-режим включён, но локальный ИИ деактивирован. Включите локальный контур для работы диалогов.</span>
          </div>
          <CrossLink label="Открыть Локальный ИИ" tab="intelligence" sectionId="section-local" />
        </div>

        <!-- Связанные подсистемы (Well footer) -->
        <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] tracking-wide">Связанные разделы:</span>
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
