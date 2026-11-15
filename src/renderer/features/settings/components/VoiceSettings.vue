<template>
  <div
    ref="scrollContainer"
    @scroll="(e) => handleViewScroll('voice', e)"
    class="settings-scroll-container flex-1 min-h-0 h-full w-full overflow-y-auto arc-scroll px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-12 lg:pr-10 pt-5 sm:pt-7 pb-24 scroll-smooth bg-transparent"
  >
    <div class="max-w-[1120px] w-full mx-auto flex flex-col gap-12">
      <!-- Section 1: Speech Recognition (STT) -->
      <STTSection />

      <!-- Section 2: Speech Synthesis (TTS) -->
      <TTSSection />

      <!-- Section 3: Audio & Microphone Activation -->
      <VoiceAudioSection />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsNav } from '../composables/useSettingsNav';

import STTSection from './sections/STTSection.vue';
import TTSSection from './sections/TTSSection.vue';
import VoiceAudioSection from './sections/voice/VoiceAudioSection.vue';

const scrollContainer = ref<HTMLElement | null>(null);
const { handleViewScroll } = useSettingsNav();
</script>

