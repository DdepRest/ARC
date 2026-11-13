<template>
  <div ref="scrollContainer" class="settings-scroll-container flex-1 min-h-0 h-full w-full overflow-y-auto arc-scroll px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-14 lg:pr-12 pt-4 sm:pt-6 pb-24 scroll-smooth bg-transparent">
    <div class="max-w-[880px] w-full mx-auto flex flex-col gap-8">
      <!-- Section 1: Quick Core Settings -->
      <QuickCoreSection />

      <!-- Section 2: Appearance & Visuals -->
      <AppearanceSection />

      <!-- Section 3: Navigation & Tabs -->
      <TabNavigationSection />

      <!-- Section 4: Panels & Widgets -->
      <WidgetControlsSection />

      <!-- Section 5: Hotkeys -->
      <HotkeysSection />
      
      <!-- Section 6: Integrations (VK Music) -->
      <VkIntegrationsSection />

      <!-- Section 7: Diagnostics Export (Task 4.1) -->
      <DiagnosticsExportSection />

      <!-- Section 8: Application Updates (Task 6.1) -->
      <AppUpdatesSection />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import QuickCoreSection from './general/QuickCoreSection.vue';
import AppearanceSection from './general/AppearanceSection.vue';
import TabNavigationSection from './general/TabNavigationSection.vue';
import WidgetControlsSection from './general/WidgetControlsSection.vue';
import VkIntegrationsSection from './general/VkIntegrationsSection.vue';
import HotkeysSection from './general/HotkeysSection.vue';
import DiagnosticsExportSection from './general/DiagnosticsExportSection.vue';
import AppUpdatesSection from './general/AppUpdatesSection.vue';

const scrollContainer = ref<HTMLElement | null>(null);
</script>
