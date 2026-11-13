<script setup lang="ts">
import SettingsSectionHeader from '../SettingsSectionHeader.vue';
import SettingsBlock from '../primitives/SettingsBlock.vue';
import CrossLink from '../primitives/CrossLink.vue';
import SttEngineSelector from './stt/SttEngineSelector.vue';
import SttProcessing from './stt/SttProcessing.vue';
import SttCorrectionsManager from './SttCorrectionsManager.vue';
import { Mic } from 'lucide-vue-next';
</script>

<template>
  <section id="section-stt" class="scroll-mt-14 flex flex-col gap-5 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader 
      title="Распознавание речи (STT)" 
      description="Нейросетевой конвейер преобразования голоса в текст (Sherpa / GigaAM / Whisper) и словарь автозамен."
      blockCountText="3 блока · нейросеть и словарь"
      :icon="Mic" 
    />

    <div id="section-stt-content" class="flex flex-col gap-5">
      <!-- Block 1: Recognition Engine & Model -->
      <SettingsBlock title="Движок и архитектура распознавания" subtitle="Выбор провайдера STT и активных весов модели">
        <SttEngineSelector />
      </SettingsBlock>

      <!-- Block 2: Post-processing -->
      <SettingsBlock title="Постобработка речи" subtitle="Умная автокоррекция и расстановка пунктуации">
        <SttProcessing />

        <div class="px-4 py-3 border-t border-[var(--arc-hairline)] flex flex-wrap items-center justify-between gap-3 bg-[var(--arc-plane)]/40">
          <span class="text-xs text-[var(--arc-text-muted)]">
            Аппаратный выбор микрофона, калибровка шума и активация по голосу:
          </span>
          <CrossLink tab="voice" sectionId="section-audio" label="Порог VAD, шумоподавление и слова активации — в разделе Микрофон и активация" />
        </div>
      </SettingsBlock>

      <!-- Block 3: Corrections Dictionary -->
      <div id="stt.corrections" data-setting-id="stt.corrections" data-search="словарь исправлений corrections dictionary автозамена" class="flex flex-col gap-2">
        <SttCorrectionsManager data-search="словарь исправлений corrections dictionary автозамена" />
      </div>
    </div>
  </section>
</template>
