<script setup lang="ts">
import { useSettingsStore } from '../../../stores/settings.store';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import { Sparkles } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="flex flex-col divide-y divide-[var(--arc-hairline)]">
    <!-- Умная автокоррекция текста -->
    <SettingsRow
      id="stt.ai_preprocess"
      label="Умная автокоррекция текста (AI Preprocessing)"
      description="Автоматическое исправление оговорок, слов-паразитов и расстановка знаков препинания."
      data-search="умная автокоррекция текста ai preprocess пунктуация"
    >
      <div class="flex items-center gap-2 shrink-0">
        <Sparkles class="w-4 h-4 text-[var(--accent)]" />
        <ArcToggle v-model="settingsStore.aiPreprocessEnabled" />
      </div>
    </SettingsRow>
  </div>
</template>
