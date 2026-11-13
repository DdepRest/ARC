<template>
  <section id="section-widgets" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      :icon="Layout" 
      title="Панели и виджеты" 
      description="Пресеты раскладки, закрепление информационных виджетов и параметров HUD."
      blockCountText="3 блока · конфигурация HUD"
    />

    <div class="flex flex-col gap-4">
      <!-- Workspace Control Deck: Presets + Docking Actions -->
      <SettingsBlock title="Пресеты рабочего пространства" subtitle="Раскладка виджетов">
        <!-- Presets Row -->
        <SettingsRow
          id="widgets.presets"
          label="Готовые профили расположения"
          description="Быстрое переключение между минималистичным, стандартным и полным набором приборов."
          data-search="пресеты раскладка виджетов minimal standard full custom"
        >
          <div class="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              v-for="(p, key) in WIDGET_PRESETS"
              :key="key"
              type="button"
              @click="applyPreset(key)"
              class="px-3 py-1.5 rounded-[10px] border text-left transition cursor-pointer select-none"
              :class="store.widgetPreset === key
                ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)] shadow-sm'
                : 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
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
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] transition-all duration-200 font-mono text-xs font-semibold text-[var(--arc-text-primary)] shrink-0 cursor-pointer"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isResetting }" />
            <span>СБРОС</span>
          </button>
        </SettingsRow>
      </SettingsBlock>

      <!-- Atmospheric Dimming Block -->
      <SettingsBlock title="Фоновое приглушение" subtitle="Автоматическая яркость">
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
      </SettingsBlock>

      <!-- Widget Modules Matrix Block -->
      <SettingsBlock title="Модули виджетов" subtitle="5 системных панелей">
        <!-- 1. Music Widget -->
        <SettingsRow
          id="widgets.module.music"
          label="Музыкальный хаб"
          description="Медиа-капсула, визуализатор трека и интеграция VK Музыки."
          data-search="музыкальный хаб music player vk"
        >
          <div class="flex items-center gap-3">
            <div 
              class="inline-flex gap-0.5 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
            >
              <button
                v-for="s in ['S', 'M', 'L']"
                :key="'music-' + s"
                type="button"
                @click="setWidgetSize('music', s as any)"
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
            <div 
              class="inline-flex gap-0.5 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
            >
              <button
                v-for="s in ['S', 'M', 'L']"
                :key="'tech-hud-' + s"
                type="button"
                @click="setWidgetSize('tech-hud', s as any)"
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
            <div 
              class="inline-flex gap-0.5 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
            >
              <button
                v-for="s in ['S', 'M', 'L']"
                :key="'timeline-' + s"
                type="button"
                @click="setWidgetSize('timeline', s as any)"
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
            <div 
              class="inline-flex gap-0.5 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
            >
              <button
                v-for="s in ['S', 'M', 'L']"
                :key="'smart-router-' + s"
                type="button"
                @click="setWidgetSize('smart-router', s as any)"
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
            <div 
              class="inline-flex gap-0.5 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
            >
              <button
                v-for="s in ['S', 'M', 'L']"
                :key="'fps-' + s"
                type="button"
                @click="setWidgetSize('fps', s as any)"
                class="px-2.5 py-0.5 text-xs font-mono font-bold rounded-[6px] transition cursor-pointer"
                :class="store.widgetSizes['fps'] === s ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
              >
                {{ s }}
              </button>
            </div>
            <ArcToggle v-model="store.showFpsOverlay" @update:model-value="onCustomChange" class="shrink-0" />
          </div>
        </SettingsRow>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { Layout, RefreshCw } from 'lucide-vue-next';
import { WIDGET_PRESETS, type WidgetPresetKey } from '../../../../../components/widgets/presets';

const store = useSettingsStore();
const isResetting = ref(false);

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
