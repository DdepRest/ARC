<template>
  <div 
    ref="scrollContainer" 
    @scroll="onScroll"
    class="settings-scroll-container flex-1 min-h-0 h-full w-full overflow-y-auto arc-scroll px-3 sm:px-6 md:pl-10 md:pr-8 lg:pl-12 lg:pr-10 pt-4 sm:pt-6 pb-20 bg-transparent"
  >
    <div class="max-w-[1040px] w-full mx-auto flex flex-col gap-6">
      <!-- Page 1: Model Routing & Orchestration -->
      <RoutingSection v-if="currentSectionId === 'section-router'" />

      <!-- Page 2: Cloud Providers & Gateways -->
      <ProvidersSection v-else-if="currentSectionId === 'section-providers'" />

      <!-- Page 3: Local AI Runtimes -->
      <LocalAISection v-else-if="currentSectionId === 'section-local'" />

      <!-- Page 4: Models & Downloads Hub -->
      <ModelManagerSection v-else-if="currentSectionId === 'section-models'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useSettingsNav } from '../composables/useSettingsNav';
import { useSettingsStore } from '../stores/settings.store';

import RoutingSection from './sections/RoutingSection.vue';
import ProvidersSection from './sections/ProvidersSection.vue';
import LocalAISection from './sections/LocalAISection.vue';
import ModelManagerSection from './sections/ModelManagerSection.vue';

const VALID_SECTIONS = ['section-router', 'section-providers', 'section-local', 'section-models'] as const;

const scrollContainer = ref<HTMLElement | null>(null);
const settingsStore = useSettingsStore();
const { activeSection, saveSectionScroll, getSectionScroll } = useSettingsNav();

const currentSectionId = computed(() => {
  if (activeSection.value && (VALID_SECTIONS as readonly string[]).includes(activeSection.value)) {
    return activeSection.value;
  }
  return 'section-router';
});

function onScroll(e: Event) {
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;
  saveSectionScroll(currentSectionId.value, el.scrollTop);
}

watch(currentSectionId, async (newSec) => {
  await nextTick();
  if (!scrollContainer.value) return;
  if (!settingsStore.pendingHighlightId && !settingsStore.pendingHighlightQuery) {
    scrollContainer.value.scrollTop = getSectionScroll(newSec);
  }
});

onMounted(() => {
  if (!activeSection.value || !(VALID_SECTIONS as readonly string[]).includes(activeSection.value)) {
    activeSection.value = 'section-router';
  }
  if (scrollContainer.value && !settingsStore.pendingHighlightId) {
    scrollContainer.value.scrollTop = getSectionScroll(currentSectionId.value);
  }
});
</script>
