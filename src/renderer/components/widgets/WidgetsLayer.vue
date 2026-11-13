<template>
  <Transition name="widgets-fade">
    <div 
      v-if="!isHidden" 
      class="widgets-layer fixed inset-0 pointer-events-none z-35"
      :style="{
        opacity: isWindowFocused ? 1 : 0.6,
        transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }"
    >
      <!-- NARROW / SMALL SCREEN LAYOUT (<= 768px): Pure flex-column stream, 0 overlapping -->
      <template v-if="isMobile">
        <!-- Narrow Mode Trigger Pill -->
        <div class="fixed right-3 top-12 pointer-events-auto z-40 flex items-center gap-1.5">
          <button
            @click="mobileDrawerCollapsed = !mobileDrawerCollapsed"
            class="min-h-[36px] px-3 py-1.5 rounded-[8px] bg-[var(--arc-frame)] hover:bg-[var(--arc-block)] border border-white/[0.16] text-white/90 hover:text-white flex items-center gap-1.5 text-[11px] font-mono shadow-2xl cursor-pointer transition-all active:scale-95"
            aria-label="Переключить видимость приборов"
          >
            <Columns class="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{{ mobileDrawerCollapsed ? 'ПРИБОРЫ' : 'ЗАКРЫТЬ' }}</span>
            <span class="text-[var(--arc-text-muted)] text-[10px]">({{ activeWidgetsList.length }})</span>
          </button>
        </div>

        <!-- Narrow Stream Container (Flex Column Stream, zero absolute positioning inside) -->
        <Transition name="drawer-slide">
          <div 
            v-if="!mobileDrawerCollapsed"
            class="fixed inset-x-2.5 top-12 bottom-18 max-w-[440px] mx-auto z-45 overflow-y-auto overflow-x-hidden arc-scroll flex flex-col gap-3 p-3 pb-10 pointer-events-auto bg-[var(--arc-frame)] rounded-[14px] border border-white/[0.12] shadow-[0_16px_48px_rgba(0,0,0,0.85)] max-h-[calc(100vh-110px)] touch-pan-y"
          >
            <!-- Drawer Header (In-flow) -->
            <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] text-[11px] font-mono text-[var(--arc-text-hint)] shrink-0 select-none">
              <div class="flex items-center gap-1.5">
                <span class="uppercase tracking-wider font-semibold text-white/90">ПРИБОРЫ ЯДРА</span>
                <span class="text-[10px] text-[var(--arc-text-muted)]">({{ activeWidgetsList.length }})</span>
              </div>
              <button 
                @click="mobileDrawerCollapsed = true" 
                class="min-w-[32px] min-h-[32px] flex items-center justify-center text-[var(--arc-text-muted)] hover:text-white rounded hover:bg-[var(--arc-hover)] cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)] text-sm font-bold"
                aria-label="Закрыть приборы ядра"
              >
                ✕
              </button>
            </div>

            <!-- In-flow flex-column stack of instruments (shrink-0 prevents card height compression) -->
            <div 
              v-for="w in activeWidgetsList" 
              :key="w.id"
              class="w-full shrink-0"
            >
              <component 
                :is="w.component" 
                v-bind="w.props"
                v-on="w.events"
              />
            </div>
          </div>
        </Transition>
      </template>

      <!-- DESKTOP DOCK MODE LAYOUT -->
      <template v-else>
        <!-- Left Dock Trigger (When collapsed) -->
        <button
          v-if="settingsStore.leftDockCollapsed"
          @click="settingsStore.toggleLeftDock"
          class="fixed left-0 top-18 z-40 px-2.5 py-2 rounded-r-[8px] bg-[var(--arc-frame)] hover:bg-[var(--arc-block)] border border-l-0 border-white/[0.12] hover:border-[var(--accent)]/40 text-[var(--arc-text-hint)] hover:text-white flex items-center gap-1.5 text-[10px] font-mono shadow-2xl pointer-events-auto transition-all cursor-pointer group focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title="Развернуть рабочий поток"
          aria-label="Развернуть рабочий поток"
        >
          <ChevronRight class="w-3.5 h-3.5 text-[var(--accent)] group-hover:translate-x-0.5 transition-transform" />
          <span>ПОТОК</span>
        </button>

        <!-- Left Dock Column: Routing, Actions, Environment (w=310px) -->
        <aside 
          class="fixed left-4 top-14 bottom-18 max-h-[calc(100vh-130px)] w-[310px] flex flex-col pointer-events-none transition-transform duration-300 z-30 overflow-y-auto arc-scroll pr-1"
          :class="settingsStore.leftDockCollapsed ? '-translate-x-[340px]' : 'translate-x-0'"
        >
          <!-- Left Rail Header (No 0N.) -->
          <div v-if="!settingsStore.leftDockCollapsed" class="flex items-center justify-between px-1 pb-2 mb-1 border-b border-white/[0.08] text-[10px] font-mono tracking-wider text-[var(--arc-text-muted)] uppercase select-none">
            <span class="text-white/80 font-semibold">ПОТОК</span>
            <button
              @click="settingsStore.toggleLeftDock"
              class="pointer-events-auto min-h-[28px] flex items-center gap-1 px-1.5 py-1 text-[10px] font-mono text-[var(--arc-text-muted)] hover:text-white rounded hover:bg-[var(--arc-hover)] transition cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              title="Скрыть панель"
              aria-label="Скрыть панель потока"
            >
              <span>СВЕРНУТЬ</span>
              <ChevronLeft class="w-3 h-3" />
            </button>
          </div>

          <!-- Left Widgets Stack -->
          <div class="flex flex-col gap-3 pointer-events-auto">
            <component 
              v-for="w in leftDockWidgets" 
              :key="w.id"
              :is="w.component" 
              v-bind="w.props"
              v-on="w.events"
            />
          </div>
        </aside>

        <!-- Right Dock Trigger (When collapsed) -->
        <button
          v-if="settingsStore.rightDockCollapsed"
          @click="settingsStore.toggleRightDock"
          class="fixed right-0 top-18 z-40 px-2.5 py-2 rounded-l-[8px] bg-[var(--arc-frame)] hover:bg-[var(--arc-block)] border border-r-0 border-white/[0.12] hover:border-[var(--status-ok)]/40 text-[var(--arc-text-hint)] hover:text-white flex items-center gap-1.5 text-[10px] font-mono shadow-2xl pointer-events-auto transition-all cursor-pointer group focus-visible:ring-1 focus-visible:ring-[var(--status-ok)]"
          title="Развернуть телеметрию ядра"
          aria-label="Развернуть телеметрию ядра"
        >
          <span>ТЕЛЕМЕТРИЯ</span>
          <ChevronLeft class="w-3.5 h-3.5 text-[var(--status-ok)] group-hover:-translate-x-0.5 transition-transform" />
        </button>

        <!-- Right Dock Column: Core, Voice, Media (w=310px) -->
        <aside 
          class="fixed right-4 top-14 bottom-18 max-h-[calc(100vh-130px)] w-[310px] flex flex-col pointer-events-none transition-transform duration-300 z-30 overflow-y-auto arc-scroll pr-1"
          :class="settingsStore.rightDockCollapsed ? 'translate-x-[340px]' : 'translate-x-0'"
        >
          <!-- Right Rail Header (No 0N.) -->
          <div v-if="!settingsStore.rightDockCollapsed" class="flex items-center justify-between px-1 pb-2 mb-1 border-b border-white/[0.08] text-[10px] font-mono tracking-wider text-[var(--arc-text-muted)] uppercase select-none">
            <button
              @click="settingsStore.toggleRightDock"
              class="pointer-events-auto min-h-[28px] flex items-center gap-1 px-1.5 py-1 text-[10px] font-mono text-[var(--arc-text-muted)] hover:text-white rounded hover:bg-[var(--arc-hover)] transition cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              title="Скрыть панель"
              aria-label="Скрыть панель телеметрии"
            >
              <ChevronRight class="w-3 h-3" />
              <span>СВЕРНУТЬ</span>
            </button>
            <span class="text-white/80 font-semibold">ТЕЛЕМЕТРИЯ</span>
          </div>

          <!-- Right Widgets Stack -->
          <div class="flex flex-col gap-3 pointer-events-auto">
            <component 
              v-for="w in rightDockWidgets" 
              :key="w.id"
              :is="w.component" 
              v-bind="w.props"
              v-on="w.events"
            />
          </div>
        </aside>
      </template>

    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useUIStore } from '../../stores/ui.store';
import { useEcoStore } from '../../stores/eco.store';
import { useCommandCenter } from '../../layouts/composables/useCommandCenter';
import { registerSingleton } from '../../utils/arcGhostDetector';
import CoreTelemetryWidget from './CoreTelemetryWidget.vue';
import RoutingWidget from './RoutingWidget.vue';
import ActionTimelineWidget from './ActionTimelineWidget.vue';
import MediaHudWidget from './MediaHudWidget.vue';
import EnvironmentWidget from './EnvironmentWidget.vue';
import VoiceHudWidget from './VoiceHudWidget.vue';
import FpsOverlay from '../debug/FpsOverlay.vue';
import { 
  ChevronLeft, 
  ChevronRight, 
  Columns 
} from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  isCanvasActive?: boolean;
}>(), {
  isCanvasActive: false
});

const settingsStore = useSettingsStore();
const uiStore = useUIStore();
const ecoStore = useEcoStore();

const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
const mobileDrawerCollapsed = ref(true);

const handleResize = () => {
  isMobile.value = window.innerWidth < 768;
};

// Window focus tracking (Requirement 6: весь док opacity 0.6 при потере фокуса)
const isWindowFocused = ref(typeof document !== 'undefined' ? document.hasFocus() : true);
const onWindowFocus = () => { isWindowFocused.value = true; };
const onWindowBlur = () => { isWindowFocused.value = false; };

let unregisterSingleton: (() => void) | null = null;

onMounted(() => {
  unregisterSingleton = registerSingleton('WidgetsLayer');
  window.addEventListener('resize', handleResize);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('blur', onWindowBlur);
});

onUnmounted(() => {
  if (unregisterSingleton) {
    unregisterSingleton();
    unregisterSingleton = null;
  }
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('focus', onWindowFocus);
  window.removeEventListener('blur', onWindowBlur);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (unregisterSingleton) {
      unregisterSingleton();
      unregisterSingleton = null;
    }
  });
}

const isHidden = computed(() => {
  return props.isCanvasActive || uiStore.activeTab !== 'core';
});

const {
  toggleMusic,
  prevTrack,
  nextTrack,
  openVk,
  seekTrack,
  toggleShuffle,
  toggleRepeat,
  toggleLike,
  toggleMute,
  handleVolumeInput
} = useCommandCenter();

// Static event handlers for Media widget (prevent recreation)
const mediaEvents = {
  toggle: toggleMusic,
  prev: prevTrack,
  next: nextTrack,
  'open-vk': openVk,
  seek: seekTrack,
  shuffle: toggleShuffle,
  repeat: toggleRepeat,
  like: toggleLike,
  mute: toggleMute,
  volume: handleVolumeInput
};

// Isolated per-widget definitions
const coreWidget = computed(() => ({
  id: 'core',
  visible: settingsStore.showTelemetryWidget,
  component: markRaw(CoreTelemetryWidget),
  props: {},
  events: {}
}));

const voiceWidget = computed(() => ({
  id: 'voice',
  visible: settingsStore.showVoiceWidget,
  component: markRaw(VoiceHudWidget),
  props: {},
  events: {}
}));

const routingWidget = computed(() => ({
  id: 'routing',
  visible: settingsStore.showRoutingDiagramWidget,
  component: markRaw(RoutingWidget),
  props: {},
  events: {}
}));

const actionsWidget = computed(() => ({
  id: 'actions',
  visible: settingsStore.showActionTimelineWidget,
  component: markRaw(ActionTimelineWidget),
  props: {},
  events: {}
}));

const isMediaVisible = computed(() =>
  settingsStore.showMusicWidget && (!settingsStore.autoHideMusicWidget || uiStore.musicState === 'playing')
);

const mediaWidget = computed(() => ({
  id: 'media',
  visible: isMediaVisible.value,
  component: markRaw(MediaHudWidget),
  props: {},
  events: mediaEvents
}));

const environmentWidget = computed(() => ({
  id: 'environment',
  visible: settingsStore.showEnvironmentWidget,
  component: markRaw(EnvironmentWidget),
  props: {},
  events: {}
}));

const fpsWidget = computed(() => ({
  id: 'fps',
  visible: settingsStore.showFpsOverlay,
  component: markRaw(FpsOverlay),
  props: {},
  events: {}
}));

// Left Dock: Routing, Actions, Environment
const leftDockWidgets = computed(() => {
  return [routingWidget.value, actionsWidget.value, environmentWidget.value].filter(w => w.visible);
});

// Right Dock: Core, Voice, Media (authoritative FPS is presented by CoreTelemetry)
const rightDockWidgets = computed(() => {
  return [coreWidget.value, voiceWidget.value, mediaWidget.value].filter(w => w.visible);
});

// List of all active widgets
const activeWidgetsList = computed(() => {
  return [...leftDockWidgets.value, ...rightDockWidgets.value];
});
</script>

<style scoped>
.widgets-fade-enter-active,
.widgets-fade-leave-active {
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.widgets-fade-enter-from,
.widgets-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
