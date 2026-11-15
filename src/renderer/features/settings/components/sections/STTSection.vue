<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsGroup from '../primitives/SettingsGroup.vue';
import SettingsBlock from '../primitives/SettingsBlock.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../primitives/SettingsSummaryStrip.vue';
import CrossLink from '../primitives/CrossLink.vue';
import SttEngineSelector from './stt/SttEngineSelector.vue';
import SttProcessing from './stt/SttProcessing.vue';
import SttCorrectionsManager from './SttCorrectionsManager.vue';
import { Mic } from 'lucide-vue-next';

const settingsStore = useSettingsStore();

const providerDisplay = computed(() => {
  if (settingsStore.sttProvider === 'sherpa') return 'Sherpa ONNX (Локальный)';
  if (settingsStore.sttProvider === 'whisper') return 'OpenAI Whisper';
  return 'Native Web Speech';
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  {
    label: 'Движок STT',
    value: providerDisplay.value,
    detail: settingsStore.sttProvider === 'sherpa' ? `Контур: ${settingsStore.sttEngine === 'gigaam' ? 'GigaAM CTC' : 'Legacy'}` : 'Системный / Web',
    tone: 'ok'
  },
  {
    label: 'Активная модель',
    value: settingsStore.sttModel || 'gigaam-ctc',
    detail: 'Веса нейросети распознавания',
    tone: 'accent'
  },
  {
    label: 'AI-постобработка',
    value: settingsStore.aiPreprocessEnabled ? 'Включена' : 'Отключена',
    detail: 'Пунктуация и автокоррекция',
    tone: settingsStore.aiPreprocessEnabled ? 'ok' : 'off'
  },
  {
    label: 'Словарь автозамен',
    value: `${Object.keys(settingsStore.sttCorrections || {}).length} правил`,
    detail: 'Пользовательские замены',
    tone: 'default'
  }
]);
</script>

<template>
  <section id="section-stt" class="scroll-mt-14 flex flex-col gap-8 text-[var(--arc-text-primary)]">
    <!-- Уровень 1: Workspace Header + HUD Readout Strip -->
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Голос · Подсистема 01"
      title="Распознавание речи (STT)"
      description="Нейросетевой конвейер преобразования голоса в текст (Sherpa / GigaAM / Whisper), постобработка и словарь автозамен."
      :statusLabel="settingsStore.sttProvider === 'sherpa' ? 'ЛОКАЛЬНЫЙ КОНТУР' : 'ВНЕШНИЙ КОНТУР'"
      statusTone="ok"
      blockCountText="3 функциональные группы"
      :icon="Mic"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <div id="section-stt-content" class="flex flex-col gap-8">
      <!-- Группа 01: Движок и архитектура распознавания -->
      <SettingsGroup
        indexLabel="01"
        title="Движок и архитектура распознавания"
        description="Выбор провайдера STT, режима конвейера и активных весов модели."
        :badgeText="settingsStore.sttModel || 'gigaam-ctc'"
      >
        <SettingsBlock>
          <SttEngineSelector />
        </SettingsBlock>
      </SettingsGroup>

      <!-- Группа 02: Постобработка речи -->
      <SettingsGroup
        indexLabel="02"
        title="Постобработка речи"
        description="Интеллектуальная автокоррекция оговорок и расстановка пунктуации."
        :badgeText="settingsStore.aiPreprocessEnabled ? 'AI ВКЛ' : 'Прямой текст'"
      >
        <SettingsBlock>
          <SttProcessing />

          <div class="px-5 py-3 border-t border-[var(--arc-divider)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-well)]">
            <span class="text-xs font-mono text-[var(--arc-text-machine)]">
              Аппаратный выбор микрофона, калибровка шума и активация по голосу:
            </span>
            <CrossLink tab="voice" sectionId="section-audio" label="Порог VAD, шумоподавление и слова активации — в разделе Микрофон и активация" />
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <!-- Группа 03: Пользовательский словарь исправлений -->
      <SettingsGroup
        indexLabel="03"
        title="Пользовательский словарь исправлений"
        description="Детерминированная замена частых оговорок и специальных терминов."
        :badgeText="`${Object.keys(settingsStore.sttCorrections || {}).length} пар`"
      >
        <div id="stt.corrections" data-setting-id="stt.corrections" data-search="словарь исправлений corrections dictionary автозамена" class="flex flex-col gap-2">
          <SttCorrectionsManager data-search="словарь исправлений corrections dictionary автозамена" />
        </div>
      </SettingsGroup>
    </div>
  </section>
</template>
