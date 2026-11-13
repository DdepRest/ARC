<template>
  <section id="section-performance" class="scroll-mt-14 flex flex-col gap-4 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Производительность" 
      description="Параметры графического рендеринга, ограничение частоты кадров (FPS) и оптимизация под оборудование."
      blockCountText="1 основной блок · аппаратная нагрузка"
      :icon="Gauge" 
    />

    <div class="flex flex-col gap-4">
      <SettingsBlock title="Графика и Частота кадров" subtitle="Ограничение частоты обновления">
        <SettingsRow 
          id="system.perf.target_fps"
          label="Целевая частота кадров (Target FPS)" 
          description="Ограничение максимального FPS для снижения нагрева GPU и энергопотребления."
          data-search="целевая частота кадров target fps частота кадров 30 60 auto ограничение gpu"
        >
          <div 
            class="inline-flex gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
          >
            <button
              v-for="fps in ['30', '60', 'auto'] as const"
              :key="fps"
              type="button"
              @click="store.targetFps = fps"
              class="px-3 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
              :class="store.targetFps === fps 
                ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] font-semibold' 
                : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
            >
              {{ fps === 'auto' ? 'Авто' : fps + ' FPS' }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow 
          id="system.perf.gfx_quality"
          label="Быстрый шаблон графики реактора" 
          description="Глобальный профиль рендеринга (Низкий, Средний, Высокий, Ультра, Ультра плюс)."
          data-search="качество графики реактора graphics quality low medium high ultra ultraplus ультра плюс высокие средние низкие"
        >
          <div class="flex flex-wrap items-center gap-2">
            <div 
              class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]"
              :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65)' }"
            >
              <button
                v-for="q in (['Low', 'Medium', 'High', 'Ultra', 'UltraPlus'] as const)"
                :key="q"
                type="button"
                @click="store.applyGraphicsPreset(q)"
                class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer"
                :class="store.graphicsPreset === q 
                  ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] font-semibold' 
                  : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent'"
              >
                {{ q === 'Low' ? 'Низкий' : q === 'Medium' ? 'Средний' : q === 'High' ? 'Высокий' : q === 'Ultra' ? 'Ультра' : 'Ультра плюс' }}
              </button>
            </div>
            <CrossLink tab="system" sectionId="section-graphics" label="Тонкая настройка 3D-Ядра" />
          </div>
        </SettingsRow>

        <SettingsRow 
          id="system.perf.fps_overlay"
          label="Показывать оверлей FPS на экране" 
          description="Плавающий счётчик частоты кадров настраивается в панели виджетов."
          data-search="показывать оверлей fps на экране виджет fps overlay счетчик"
        >
          <CrossLink tab="core" sectionId="section-widgets" label="Виджет FPS" />
        </SettingsRow>

        <SettingsRow 
          id="system.perf.vsync"
          label="Отключить вертикальную синхронизацию (VSync)" 
          description="Может устранить микрофризы на некоторых мониторах с переменной частотой."
          data-search="отключить вертикальную синхронизацию vsync вертикальная синхронизация микрофризы"
        >
          <ArcToggle v-model="store.disableVsync" />
        </SettingsRow>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../../stores/settings.store';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import { Gauge } from 'lucide-vue-next';

const store = useSettingsStore();
</script>
