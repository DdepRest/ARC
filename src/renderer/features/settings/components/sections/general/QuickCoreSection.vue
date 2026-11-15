<template>
  <section id="section-general" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Общие · Подсистема 01"
      title="Быстрые настройки"
      description="Ключевые операционные параметры системы, фонового режима и звука для оперативного доступа."
      :statusLabel="activeCount > 0 ? `АКТИВНО: ${activeCount}/4` : 'БАЗОВЫЙ ПРОФИЛЬ'"
      :statusTone="activeCount > 0 ? 'ok' : 'off'"
      blockCountText="2 функциональные группы"
      :icon="Zap"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <!-- Уровень 2: Группа 01 — Оперативный контур -->
    <SettingsGroup
      indexLabel="01"
      title="Оперативный контур ядра"
      description="Часто используемые системные переключатели старта, озвучки и фонового режима."
      :badgeText="`${activeCount} из 4 включено`"
    >
      <SettingsBlock>
        <div class="flex flex-col divide-y divide-[var(--arc-divider)]">
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
              :model-value="isEcoActive"
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
        </div>
      </SettingsBlock>
    </SettingsGroup>

    <!-- Уровень 2: Группа 02 — Навигационная матрица быстрых переходов -->
    <SettingsGroup
      indexLabel="02"
      title="Быстрый переход к ключевым узлам"
      description="Прямая маршрутизация к профильным приборам настройки A.R.C."
      badgeText="6 узлов"
    >
      <SettingsBlock>
        <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Palette class="w-4 h-4 text-[var(--accent)] shrink-0" />
            <CrossLink tab="core" sectionId="section-appearance" label="Цветовая тема и кинетика ядра" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Layout class="w-4 h-4 text-[var(--accent)] shrink-0" />
            <CrossLink tab="core" sectionId="section-widgets" label="Раскладка HUD-виджетов" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Brain class="w-4 h-4 text-[var(--accent)] shrink-0" />
            <CrossLink tab="intelligence" sectionId="section-router" label="Маршрутизация и приоритеты ИИ" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Gauge class="w-4 h-4 text-[var(--accent)] shrink-0" />
            <CrossLink tab="system" sectionId="section-performance" label="Качество графики и лимит FPS" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Volume2 class="w-4 h-4 text-[var(--accent)] shrink-0" />
            <CrossLink tab="voice" sectionId="section-audio" label="Микрофон, VAD и слова активации" class="flex-1 justify-between text-xs" />
          </div>
          <div class="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)] transition-colors">
            <Zap class="w-4 h-4 text-[var(--accent)] shrink-0" />
            <CrossLink tab="intelligence" sectionId="section-providers" label="Шлюзы API и подключение по IP" class="flex-1 justify-between text-xs" />
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
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import CrossLink from '../../primitives/CrossLink.vue';
import { Gauge, Palette, Layout, Zap, Brain, Volume2 } from 'lucide-vue-next';

const settingsStore = useSettingsStore();

const isEcoActive = computed(() => settingsStore.ecoMode === 'always' || settingsStore.ecoMode === 'auto');

const activeCount = computed(() => {
  return [
    settingsStore.autoSpeak,
    settingsStore.autoStart,
    isEcoActive.value,
    settingsStore.runInBackground
  ].filter(Boolean).length;
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Авто-озвучка TTS',
    value: settingsStore.autoSpeak ? 'Включена' : 'Отключена',
    detail: settingsStore.autoSpeak ? 'Озвучивание ответов в чате' : 'Только текстовый вывод',
    tone: settingsStore.autoSpeak ? 'ok' : 'off'
  },
  {
    label: 'Старт с ОС',
    value: settingsStore.autoStart ? 'Автозапуск' : 'Вручную',
    detail: 'Реестр HKCU\\Run',
    tone: settingsStore.autoStart ? 'ok' : 'default'
  },
  {
    label: 'Энергопрофиль',
    value: isEcoActive.value ? 'Эко (30 FPS)' : 'Полный (60 FPS)',
    detail: isEcoActive.value ? 'Снижение нагрузки GPU' : 'Штатная частота ядра',
    tone: isEcoActive.value ? 'warn' : 'ok'
  },
  {
    label: 'Фоновый контур',
    value: settingsStore.runInBackground ? 'В системном трее' : 'Выход при закрытии',
    detail: settingsStore.runInBackground ? 'Хоткеи и голос активны' : 'Полная выгрузка процесса',
    tone: settingsStore.runInBackground ? 'ok' : 'off'
  }
]);
</script>
