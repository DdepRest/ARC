<template>
  <section id="section-appearance" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 02"
      title="Внешний вид"
      description="Спектральный акцент светового ядра, кинетика вращения колец и аудио-реактивность визуальной среды."
      :statusLabel="activeTheme.name"
      statusTone="accent"
      blockCountText="2 функциональные группы"
      :icon="Palette"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Цветовой спектр и свечение -->
    <SettingsGroup
      indexLabel="01"
      title="Цветовой спектр и свечение"
      description="Выбор спектрального акцента интерфейса и калибровка яркости эмиссии 3D-ядра."
      :badgeText="activeTheme.displayName"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Theme Selector -->
          <SettingsRow
            id="appearance.theme"
            data-setting-id="appearance.theme"
            label="Цветовая тема реактора"
            description="Спектральный акцент светового ядра, фокуса интерактивных элементов и HUD."
            data-search="цветовая тема color theme акцент accent реактор"
            layout="stacked"
          >
            <div class="flex flex-wrap items-center gap-2 w-full">
              <button
                v-for="theme in themes"
                :key="theme.id"
                type="button"
                @click="store.reactorColorTheme = theme.id"
                class="group inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] border transition cursor-pointer select-none text-left"
                :class="store.reactorColorTheme === theme.id
                  ? 'bg-[var(--arc-selected)] border-[var(--accent)] text-[var(--arc-text-primary)] shadow-sm'
                  : 'bg-[var(--arc-block)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
                :title="`${theme.displayName} (${theme.name})`"
              >
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }"
                />
                <span class="text-xs font-mono" :class="store.reactorColorTheme === theme.id ? 'font-semibold text-[var(--arc-text-primary)]' : 'font-normal'">
                  {{ theme.displayName }}
                </span>
              </button>
            </div>
          </SettingsRow>

          <!-- Glow Intensity Slider -->
          <SettingsRow
            id="appearance.glow"
            data-setting-id="appearance.glow"
            label="Интенсивность свечения"
            description="Яркость свечения и плотность частиц энергетического ядра."
            data-search="интенсивность свечения power intensity реактор reactor"
          >
            <div class="w-48 sm:w-60 shrink-0">
              <ArcSlider
                v-model="reactorPowerPercent"
                :min="0"
                :max="150"
                :step="1"
                unit="%"
                :show-value="true"
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Группа 02 — Кинетика и аудио-отклик -->
    <SettingsGroup
      indexLabel="02"
      title="Кинетика и аудио-реактивность"
      description="Динамика вращения колец реактора и синхронизация свечения с голосовым трактом."
      :badgeText="`${store.reactorSpeed}x · ${store.isAudioReactive ? 'Аудио ВКЛ' : 'Статика'}`"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
          <!-- Animation Speed Slider -->
          <SettingsRow
            id="appearance.speed"
            data-setting-id="appearance.speed"
            label="Скорость анимации реактора"
            description="Скорость вращения колец и кинетической пульсации."
            data-search="скорость анимации speed rotation вращение реактор reactor"
          >
            <div class="w-48 sm:w-60 shrink-0">
              <ArcSlider
                v-model="store.reactorSpeed"
                :min="0.5"
                :max="2.0"
                :step="0.1"
                unit="x"
                :show-value="true"
              />
            </div>
          </SettingsRow>

          <!-- Audio Reactivity -->
          <SettingsRow
            id="appearance.audio_reactive"
            data-setting-id="appearance.audio_reactive"
            label="Аудио-реактивность"
            description="Реакция кольцевого свечения на голос и системный звук."
            data-search="аудио-реактивность audio reactive визуализация voice feedback"
          >
            <ArcToggle v-model="store.isAudioReactive" class="shrink-0" />
          </SettingsRow>
        </div>

        <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
          <span class="text-xs font-mono text-[var(--arc-text-machine)] tracking-wide">Связанные разделы:</span>
          <div class="flex flex-wrap items-center gap-4">
            <CrossLink tab="system" sectionId="section-graphics" label="Шейдеры и сглаживание 3D-Ядра" />
            <CrossLink tab="core" sectionId="section-widgets" label="Приглушение и раскладка виджетов" />
          </div>
        </div>
      </SettingsBlock>
    </SettingsGroup>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import { Palette } from 'lucide-vue-next';

const store = useSettingsStore();

const reactorPowerPercent = computed({
  get: () => Math.round((store.reactorPower || 1) * 100),
  set: (val: number) => {
    store.reactorPower = val / 100;
  }
});

const themes = [
  { id: 'gold', displayName: 'Янтарный', name: 'PHOTON_AMBER', color: '#f59e0b' },
  { id: 'blue', displayName: 'Плазменный бирюзовый', name: 'PLASMA_CYAN', color: '#00d4ff' },
  { id: 'red', displayName: 'Критический красный', name: 'CRITICAL_RED', color: 'var(--status-err)' },
  { id: 'purple', displayName: 'Фиолетовый', name: 'SINGULARITY_PURPLE', color: '#a855f7' },
  { id: 'green', displayName: 'Изумрудный', name: 'HYPER_EMERALD', color: '#34d399' },
] as const;

const activeTheme = computed(() => {
  return themes.find(t => t.id === store.reactorColorTheme) || themes[2];
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Спектральный акцент',
    value: activeTheme.value.displayName,
    detail: activeTheme.value.name,
    tone: 'accent'
  },
  {
    label: 'Мощность свечения',
    value: `${reactorPowerPercent.value}%`,
    detail: 'Яркость эмиссии ядра',
    tone: reactorPowerPercent.value > 0 ? 'default' : 'off'
  },
  {
    label: 'Кинетика вращения',
    value: `${store.reactorSpeed}x`,
    detail: 'Скорость колец реактора',
    tone: 'default'
  },
  {
    label: 'Аудио-реактивность',
    value: store.isAudioReactive ? 'Активна' : 'Отключена',
    detail: store.isAudioReactive ? 'Синхронизация с голосом' : 'Статический контур',
    tone: store.isAudioReactive ? 'accent' : 'off'
  }
]);
</script>
