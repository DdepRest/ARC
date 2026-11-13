<template>
  <div ref="scrollContainer" @scroll="nav.handleViewScroll('hub', $event)" class="settings-scroll-container flex-1 min-h-0 h-full w-full overflow-y-auto custom-scrollbar py-2 pr-2 pb-16 scroll-smooth">
    <div class="flex flex-col gap-8 max-w-4xl mx-auto">
      
      <!-- Section: Model Hub -->
      <section id="section-models" class="scroll-mt-14 min-h-[180px]">
        <SettingsSectionHeader 
          :icon="DownloadCloud" 
          title="Менеджер моделей (Хаб)" 
          :is-collapsed="collapsed.isCollapsed('section-models')"
          @toggle="collapsed.toggleCollapsed('section-models')"
        />
        <div 
          class="grid transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          :class="!collapsed.isCollapsed('section-models') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'"
        >
          <div class="overflow-hidden min-h-0">
            <div class="pb-6 mb-6 border-b border-white/5 p-5">
              <ModelManagerSection v-if="visibleSections['section-models']" />
              <div v-else class="flex flex-col gap-3 py-6 px-2">
                <div class="h-4 w-1/3 bg-white/10 rounded shimmer-skeleton"></div>
                <div class="h-12 w-full bg-white/5 rounded-xl shimmer-skeleton"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DownloadCloud } from 'lucide-vue-next';
import { useSettingsNav } from '../composables/useSettingsNav';
import { useCollapsedSections } from '../composables/useCollapsedSections';
import { useLazySection } from '../composables/useLazySection';
import SettingsSectionHeader from './SettingsSectionHeader.vue';
import ModelManagerSection from './sections/ModelManagerSection.vue';

const nav = useSettingsNav();
const collapsed = useCollapsedSections();
const scrollContainer = ref<HTMLElement | null>(null);

const { visibleSections } = useLazySection(scrollContainer, ['section-models']);
</script>
