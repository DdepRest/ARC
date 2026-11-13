<template>
  <div ref="scrollContainer" class="settings-scroll-container flex-1 min-h-0 h-full w-full overflow-y-auto arc-scroll px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-14 lg:pr-12 pt-4 sm:pt-6 pb-24 scroll-smooth bg-transparent">
    <div class="max-w-[880px] w-full mx-auto flex flex-col gap-8">
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

import STTSection from './sections/STTSection.vue';
import TTSSection from './sections/TTSSection.vue';
import VoiceAudioSection from './sections/voice/VoiceAudioSection.vue';

const scrollContainer = ref<HTMLElement | null>(null);
</script>

