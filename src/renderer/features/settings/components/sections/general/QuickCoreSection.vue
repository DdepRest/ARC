<template>
  <section id="section-general" class="scroll-mt-14 flex flex-col gap-5 text-[var(--arc-text-primary)]">
    <!-- Page Header -->
    <SettingsSectionHeader 
      title="Быстрые настройки" 
      description="Ключевые операционные параметры системы, фонового режима и звука для оперативного доступа."
      blockCountText="2 блока · оперативный доступ"
      :icon="Zap" 
    />

    <div class="flex flex-col gap-6">
      <!-- 1. Блок «Мгновенно» (4 контрола) -->
      <SettingsBlock title="Оперативный контур" subtitle="Часто используемые системные переключатели">
        <!-- 1. Auto-Speak Toggle -->
        <SettingsRow 
          id="quick.autospeak" 
          data-setting-id="quick.autospeak"
          label="Авто-озвучка ответов" 
          description="Автоматически озвучивать входящие текстовые сообщения ИИ в диалоге."
          data-search="авто-озвучка ответов auto speak голос voice tts озвучивание диалог"
        >
          <ArcToggle v-model="settingsStore.autoSpeak" class="shrink-0" />
        </SettingsRow>

        <!-- 2. Autostart -->
        <SettingsRow 
          id="quick.autostart" 
          data-setting-id="quick.autostart"
          label="Автозапуск A.R.C." 
          description="Запускать среду A.R.C. при входе в систему."
          title="Регистрация в реестре HKCU\Run"
          data-search="автозапуск autostart windows система boot"
        >
          <ArcToggle v-model="settingsStore.autoStart" class="shrink-0" :title="'Регистрация в реестре HKCU\\Run'" />
        </SettingsRow>

        <!-- 3. Eco Mode -->
        <SettingsRow 
          id="quick.ecomode" 
          data-setting-id="quick.ecomode"
          label="Эко-режим" 
          description="Снижение частоты кадров реактора до 30 FPS для экономии ресурсов GPU."
          data-search="эко eco mode энергосбережение батарея fps"
        >
          <ArcToggle 
            :model-value="settingsStore.ecoMode === 'always' || settingsStore.ecoMode === 'auto'"
            @update:model-value="(val: boolean) => { settingsStore.ecoMode = val ? 'auto' : 'off'; }"
            class="shrink-0" 
          />
        </SettingsRow>

        <!-- 4. Run in Background -->
        <SettingsRow 
          id="quick.background" 
          data-setting-id="quick.background"
          label="Работа в фоне" 
          description="Поддержание голосового канала и горячих клавиш при сворачивании в системный трей."
          data-search="фон background трей работа в фоне tray"
        >
          <ArcToggle v-model="settingsStore.runInBackground" class="shrink-0" />
        </SettingsRow>
      </SettingsBlock>

      <!-- 2. Компактная навигационная сетка вместо длинного списка пустых строк -->
      <SettingsBlock title="Быстрый переход к ключевым узлам" subtitle="Прямая навигация к профильным приборам настройки">
        <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Palette class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
            <CrossLink tab="core" sectionId="section-appearance" label="Цветовая тема и кинетика ядра" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Layout class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
            <CrossLink tab="core" sectionId="section-widgets" label="Раскладка HUD-виджетов" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Brain class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
            <CrossLink tab="intelligence" sectionId="section-router" label="Маршрутизация и приоритеты ИИ" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Gauge class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
            <CrossLink tab="system" sectionId="section-performance" label="Качество графики и лимит FPS" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Volume2 class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
            <CrossLink tab="voice" sectionId="section-audio" label="Микрофон, VAD и слова активации" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Zap class="w-4 h-4 text-[var(--arc-text-muted)] shrink-0" />
            <CrossLink tab="intelligence" sectionId="section-providers" label="Шлюзы API и подключение по IP" class="flex-1 justify-between text-xs" />
          </div>
        </div>
      </SettingsBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import { Gauge, Palette, Layout, Zap, Brain, Volume2 } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
</script>
