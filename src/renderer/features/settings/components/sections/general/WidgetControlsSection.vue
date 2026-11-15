<template>
  <section id="section-widgets" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 04"
      :icon="Layout"
      title="Панели и виджеты"
      description="Пресеты раскладки, закрепление информационных приборов HUD и индивидуальные габариты виджетов."
      :statusLabel="`ВКЛЮЧЕНО: ${enabledWidgetsCount}/5`"
      :statusTone="enabledWidgetsCount > 0 ? 'accent' : 'off'"
      blockCountText="3 функциональные группы"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Пресеты рабочего пространства -->
    <SettingsGroup
      indexLabel="01"
      title="Пресеты рабочего пространства"
      description="Готовые профили расположения приборов и фиксация координат на экране."
      :badgeText="WIDGET_PRESETS[store.widgetPreset]?.label || 'Свой'"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Presets Row (stacked to prevent button row from crushing label) -->
          <SettingsRow
            id="widgets.presets"
            label="Готовые профили расположения"
            description="Быстрое переключение между минималистичным, стандартным и полным набором приборов."
            data-search="пресеты раскладка виджетов minimal standard full custom"
            layout="stacked"
          >
            <div class="flex flex-wrap items-center gap-2 w-full">
              <button
                v-for="(p, key) in WIDGET_PRESETS"
                :key="key"
                type="button"
                @click="applyPreset(key)"
                class="px-3.5 py-1.5 rounded-[9px] border text-left transition cursor-pointer select-none"
                :class="store.widgetPreset === key
                  ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)] shadow-sm'
                  : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
              >
                <span class="text-xs font-mono font-bold uppercase" :class="store.widgetPreset === key ? 'text-[var(--accent)]' : 'text-[var(--arc-text-primary)]'">
                  {{ p.label }}
                </span>
              </button>
            </div>
          </SettingsRow>

          <!-- Lock Panels Toggle -->
          <SettingsRow
            id="widgets.lock"
            label="Закрепить панели на рабочем столе"
            description="Блокировка перемещения и перетаскивания виджетов для защиты от случайного сдвига."
            data-search="закрепить панели блокировка lock widgets"
          >
            <ArcToggle v-model="store.widgetsLocked" class="shrink-0" />
          </SettingsRow>

          <!-- Reset Positions -->
          <SettingsRow
            id="widgets.reset_positions"
            label="Сброс координат виджетов"
            description="Возвращает все панели и виджеты в исходные точки экрана."
            data-search="сбросить положение виджетов reset positions"
          >
            <button
              type="button"
              @click="resetPositions"
              class="flex items-center gap-1.5 px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] transition-all duration-200 font-mono text-xs font-semibold text-[var(--arc-text-primary)] shrink-0 cursor-pointer"
            >
              <RefreshCw class="w-3.5 h-3.5 text-[var(--accent)]" :class="{ 'animate-spin': isResetting }" />
              <span>СБРОС</span>
            </button>
          </SettingsRow>
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Группа 02 — Фоновое приглушение -->
    <SettingsGroup
      indexLabel="02"
      title="Фоновое приглушение"
      description="Автоматическое снижение яркости неактивных приборов для фокуса на 3D-Ядре."
      :badgeText="store.widgetsDim ? `${store.widgetDimOpacity}%` : 'Выкл'"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <SettingsRow
            id="widgets.dim"
            label="Приглушать неактивные виджеты"
            description="Снижать яркость неактивных панелей в фоне; восстановление 100% при наведении курсора."
            data-search="приглушать виджеты прозрачность затемнение widgets dim"
          >
            <ArcToggle v-model="store.widgetsDim" class="shrink-0" />
          </SettingsRow>

          <SettingsRow
            v-if="store.widgetsDim"
            id="widgets.dim_opacity"
            label="Яркость панелей в фоне"
            description="Уровень фоновой непрозрачности для неактивных виджетов."
            data-search="яркость в фоне opacity widgets"
          >
            <div class="w-48 sm:w-60 shrink-0">
              <ArcSlider
                v-model="store.widgetDimOpacity"
                :min="10"
                :max="100"
                :step="5"
                unit="%"
                :show-value="true"
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Группа 03 — Модули приборов дока -->
    <SettingsGroup
      indexLabel="03"
      title="Модули приборов HUD"
      description="Индивидуальное включение и выбор типоразмера (S / M / L) каждого системного прибора."
      :badgeText="`${enabledWidgetsCount} из 5 активно`"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- 1. Music Widget -->
          <SettingsRow
            id="widgets.module.music"
            label="Музыкальный хаб"
            description="Медиа-капсула, визуализатор трека и интеграция VK Музыки."
            data-search="музыкальный хаб music player vk"
          >
            <div class="flex items-center gap-3">
              <div class="inline-flex gap-0.5 bg-[var(--arc-well)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button
                  v-for="s in (['S', 'M', 'L'] as const)"
                  :key="'music-' + s"
                  type="button"
                  @click="setWidgetSize('music', s)"
                  class="px-2.5 py-0.5 text-xs font-mono font-bold rounded-[6px] transition cursor-pointer"
                  :class="store.widgetSizes['music'] === s ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                >
                  {{ s }}
                </button>
              </div>
              <ArcToggle v-model="store.showMusicWidget" @update:model-value="onCustomChange" class="shrink-0" />
            </div>
          </SettingsRow>

          <!-- 1a. Music Widget VK URL -->
          <SettingsRow
            id="widgets.module.music_url"
            data-setting-id="widgets.module.music_url"
            label="Ссылка на VK Музыку"
            description="Плейлист или аудиозаписи для воспроизведения в музыкальном виджете."
            data-search="vk music вк музыка интеграция плейлист виджет ссылка url"
          >
            <div class="w-72 max-w-full">
              <input
                v-model="store.vkAudioUrl"
                type="text"
                placeholder="https://vk.ru/audios..."
                class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[8px] px-3 py-1.5 text-xs font-mono text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--arc-text-muted)]"
              />
            </div>
          </SettingsRow>

          <!-- 1b. Music Widget Auto-hide on Pause -->
          <SettingsRow
            id="widgets.module.music_autohide"
            data-setting-id="widgets.module.music_autohide"
            label="Скрывать на паузе"
            description="Автоматически прятать музыкальный виджет при остановке трека."
            data-search="скрывать на паузе autohide музыкальный виджет vk"
          >
            <ArcToggle v-model="store.autoHideMusicWidget" class="shrink-0" />
          </SettingsRow>

          <!-- 2. Technical HUD -->
          <SettingsRow
            id="widgets.module.hud"
            label="Технический HUD"
            description="Мониторинг ресурсов в реальном времени: тактовая частота, CPU, RAM и системные потоки."
            data-search="технический hud телеметрия cpu ram"
          >
            <div class="flex items-center gap-3">
              <div class="inline-flex gap-0.5 bg-[var(--arc-well)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button
                  v-for="s in (['S', 'M', 'L'] as const)"
                  :key="'tech-hud-' + s"
                  type="button"
                  @click="setWidgetSize('tech-hud', s)"
                  class="px-2.5 py-0.5 text-xs font-mono font-bold rounded-[6px] transition cursor-pointer"
                  :class="store.widgetSizes['tech-hud'] === s ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                >
                  {{ s }}
                </button>
              </div>
              <ArcToggle v-model="store.showTechnicalHUD" @update:model-value="onCustomChange" class="shrink-0" />
            </div>
          </SettingsRow>

          <!-- 3. Timeline Widget -->
          <SettingsRow
            id="widgets.module.timeline"
            label="Таймлайн ИИ-действий"
            description="Хронологический поток задач, событий оркестратора и системных вызовов."
            data-search="таймлайн ии действий timeline events"
          >
            <div class="flex items-center gap-3">
              <div class="inline-flex gap-0.5 bg-[var(--arc-well)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button
                  v-for="s in (['S', 'M', 'L'] as const)"
                  :key="'timeline-' + s"
                  type="button"
                  @click="setWidgetSize('timeline', s)"
                  class="px-2.5 py-0.5 text-xs font-mono font-bold rounded-[6px] transition cursor-pointer"
                  :class="store.widgetSizes['timeline'] === s ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                >
                  {{ s }}
                </button>
              </div>
              <ArcToggle v-model="store.showTimelineWidget" @update:model-value="onCustomChange" class="shrink-0" />
            </div>
          </SettingsRow>

          <!-- 4. Smart Router Widget -->
          <SettingsRow
            id="widgets.module.router"
            label="Схема умного роутера"
            description="Визуальная диаграмма маршрутизации запросов между LLM моделями."
            data-search="схема умного роутера smart router widget"
          >
            <div class="flex items-center gap-3">
              <div class="inline-flex gap-0.5 bg-[var(--arc-well)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button
                  v-for="s in (['S', 'M', 'L'] as const)"
                  :key="'smart-router-' + s"
                  type="button"
                  @click="setWidgetSize('smart-router', s)"
                  class="px-2.5 py-0.5 text-xs font-mono font-bold rounded-[6px] transition cursor-pointer"
                  :class="store.widgetSizes['smart-router'] === s ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                >
                  {{ s }}
                </button>
              </div>
              <ArcToggle v-model="store.showSmartRouterWidget" @update:model-value="onCustomChange" class="shrink-0" />
            </div>
          </SettingsRow>

          <!-- 5. FPS Overlay -->
          <SettingsRow
            id="widgets.module.fps"
            label="FPS Оверлей"
            description="Компактный индикатор частоты кадров графического рендера Three.js."
            data-search="fps оверлей frames per second webgl"
          >
            <div class="flex items-center gap-3">
              <div class="inline-flex gap-0.5 bg-[var(--arc-well)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button
                  v-for="s in (['S', 'M', 'L'] as const)"
                  :key="'fps-' + s"
                  type="button"
                  @click="setWidgetSize('fps', s)"
                  class="px-2.5 py-0.5 text-xs font-mono font-bold rounded-[6px] transition cursor-pointer"
                  :class="store.widgetSizes['fps'] === s ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
                >
                  {{ s }}
                </button>
              </div>
              <ArcToggle v-model="store.showFpsOverlay" @update:model-value="onCustomChange" class="shrink-0" />
            </div>
          </SettingsRow>
        </div>
      </SettingsBlock>
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { Layout, RefreshCw } from 'lucide-vue-next';
import { WIDGET_PRESETS, type WidgetPresetKey } from '../../../../../components/widgets/presets';

const store = useSettingsStore();
const isResetting = ref(false);

const enabledWidgetsCount = computed(() => {
  return [
    store.showMusicWidget,
    store.showTechnicalHUD,
    store.showTimelineWidget,
    store.showSmartRouterWidget,
    store.showFpsOverlay
  ].filter(Boolean).length;
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Активный профиль',
    value: WIDGET_PRESETS[store.widgetPreset]?.label || 'Пользовательский',
    detail: 'Шаблон раскладки HUD',
    tone: 'accent'
  },
  {
    label: 'Включено приборов',
    value: `${enabledWidgetsCount.value} из 5`,
    detail: 'Отображаются над ядром',
    tone: enabledWidgetsCount.value > 0 ? 'default' : 'off'
  },
  {
    label: 'Фиксация координат',
    value: store.widgetsLocked ? 'Закреплены' : 'Свободное перетаскивание',
    detail: 'Защита от сдвига',
    tone: store.widgetsLocked ? 'accent' : 'default'
  },
  {
    label: 'Фоновое затухание',
    value: store.widgetsDim ? `${store.widgetDimOpacity}% яркости` : 'Без затухания (100%)',
    detail: 'В неактивном состоянии',
    tone: store.widgetsDim ? 'default' : 'off'
  }
]);

const applyPreset = (key: WidgetPresetKey) => {
  const p = WIDGET_PRESETS[key];
  if (!p) return;
  store.widgetPreset = key;

  if (key !== 'custom') {
    store.showTechnicalHUD = p.widgets.showTechnicalHUD;
    store.showTimelineWidget = p.widgets.showTimelineWidget;
    store.showSmartRouterWidget = p.widgets.showSmartRouterWidget;
    store.showMusicWidget = p.widgets.showMusicWidget;
    store.showFpsOverlay = p.widgets.showFpsOverlay;

    store.widgetSizes = { ...p.sizes };
    store.widgetCompact = { ...p.compact };
    if (p.modes) {
      store.widgetModes = { ...p.modes };
    }
  }
};

const onCustomChange = () => {
  store.widgetPreset = 'custom';
};

const setWidgetSize = (widgetKey: string, size: 'S' | 'M' | 'L') => {
  store.widgetSizes[widgetKey] = size;
  onCustomChange();
};

const resetPositions = () => {
  isResetting.value = true;
  store.resetWidgetPositions();
  store.triggerSyncToast('Позиции виджетов сброшены', () => {});

  setTimeout(() => {
    isResetting.value = false;
  }, 600);
};
</script>
