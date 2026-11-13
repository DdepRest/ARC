<template>
  <div 
    ref="scrollContainer" 
    class="settings-scroll-container flex-1 min-h-0 h-full w-full overflow-y-auto arc-scroll px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-14 lg:pr-12 pt-4 sm:pt-6 pb-24 scroll-smooth select-none text-[var(--arc-text-primary)] bg-transparent"
  >
    <div class="max-w-[880px] w-full mx-auto flex flex-col gap-8">
      <!-- Section 1: Graphics & 3D Reactor Engine -->
      <GraphicsReactorSection />

      <!-- Section 2: Performance Options -->
      <PerformanceOptionsSection />

      <!-- Section 3: Diagnostics & Logs -->
      <DiagnosticsSection />

      <!-- Section 4: Safety & Permissions -->
      <SafetySecuritySection />

      <!-- Section 5: Storage & Data -->
      <StorageDataSection />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import GraphicsReactorSection from './sections/system/GraphicsReactorSection.vue';
import StorageDataSection from './sections/system/StorageDataSection.vue';
import SafetySecuritySection from './sections/system/SafetySecuritySection.vue';
import DiagnosticsSection from './sections/system/DiagnosticsSection.vue';
import PerformanceOptionsSection from './sections/system/PerformanceOptionsSection.vue';

const scrollContainer = ref<HTMLElement | null>(null);
</script>
