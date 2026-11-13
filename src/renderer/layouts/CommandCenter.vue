<template>
  <div class="h-full w-full relative overflow-hidden bg-black text-white select-none">
    <!-- Deep Space Background -->
    <SpaceBackground />
    
    <!-- Core Awakening Visual Effects Overlay -->
    <AwakeningOverlay :isAwakening="isAwakening" />

    <!-- Widescreen full-bleed Three.js Canvas Layer -->
    <ReactorCore 
      :state="uiStore.reactorState" 
      :coreCenter="coreCenter" 
      :coreScale="coreScaleProps"
      class="absolute inset-0 z-0 pointer-events-none" 
    />
    
    <!-- Visual Overlays -->
    <div class="terminal-overlay" style="z-index: 0;"></div>
    <div class="noise-overlay" style="z-index: 1;"></div>

    <!-- Invisible click target for Core interactions when projection is active -->
    <div 
      v-if="isCanvasActive"
      class="absolute rounded-full pointer-events-auto cursor-default z-30"
      :style="coreStyle"
      @click="handleCoreClick"
    ></div>

    <!-- TabBar Position Top -->
    <div 
      v-if="settingsStore.tabBarPosition === 'top'"
      class="absolute top-0 left-0 right-0 z-40 transition duration-500"
    >
      <TabBar />
    </div>

    <!-- Atmospheric Backdrop to close projection on click outside (Veil 0.22 + Ring Earth, without blur) -->
    <div 
      v-if="isCanvasActive" 
      class="absolute inset-0 z-20 pointer-events-auto cursor-default transition-opacity duration-300"
      :style="{
        backgroundColor: 'var(--arc-veil)',
        background: 'var(--arc-veil-ring)'
      }"
      @click="closeProjection"
    ></div>

    <!-- Active Holographic Projection Panel -->
    <HolographicProjectionPanel 
      :isCanvasActive="isCanvasActive"
      :tabBarPosition="settingsStore.tabBarPosition"
      :activeTab="uiStore.activeTab"
      :localizations="localizations"
      :projectionTitle="projectionTitle"
      :filteredFiles="filteredFiles"
      v-model:fileSearch="fileSearch"
      :isUnhandledTab="isUnhandledTab"
      :isCameraActive="isCameraActive"
      :videoPlayer="videoPlayer"
      @closeProjection="closeProjection"
      @selectFile="selectedFile = $event"
      @triggerAction="triggerWorkspaceAction"
      @initializeCamera="initializeCamera"
      @stopCamera="stopCamera"
    />

    <!-- Center Anchor Bottom (Unified Command Matte Dock) -->
    <div 
      :inert="isCanvasActive || undefined"
      class="absolute bottom-5 left-1/2 -translate-x-1/2 w-[780px] max-w-[calc(100%-48px)] transition-all duration-500 translate-y-0 flex flex-col items-center gap-1"
      :class="isCanvasActive ? 'pointer-events-none invisible opacity-0 translate-y-10 scale-95 -z-10' : 'pointer-events-auto visible scale-100 opacity-100 z-30'"
    >
      <VoiceQuickPanel />
      
      <!-- Command Center Dock: Unified Single Container -->
      <div 
        id="arc-dock-container"
        data-arc-dock-container="true"
        class="w-full max-w-2xl sm:max-w-3xl rounded-[22px] border border-white/[0.06] hover:border-white/10 flex flex-col z-50 transition-all duration-200 overflow-hidden"
        :class="isCanvasActive ? 'pointer-events-none invisible' : 'pointer-events-auto visible'"
        :style="{
          backgroundColor: isEcoActive ? 'var(--arc-block)' : 'rgba(10, 10, 10, 0.76)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 20px 48px rgba(0, 0, 0, 0.90)',
          backdropFilter: isEcoActive ? 'none' : 'blur(10px)',
          WebkitBackdropFilter: isEcoActive ? 'none' : 'blur(10px)'
        }"
      >
        <!-- Row 1: TabBar (when bottom tab bar active and expanded on Core) -->
        <div 
          v-if="settingsStore.tabBarPosition === 'bottom' && !isCanvasActive && isWorkspacesExpanded" 
          class="w-full border-b border-[var(--arc-divider)] bg-transparent shrink-0 animate-fade-in"
        >
          <TabBar class="!bg-transparent !border-none !h-10" />
        </div>

        <!-- Row 2: Voice & Command Input (BottomBar) -->
        <div class="w-full flex justify-center bg-transparent">
          <BottomBar 
            :is-workspaces-expanded="isWorkspacesExpanded" 
            @toggle-workspaces="isWorkspacesExpanded = !isWorkspacesExpanded" 
          />
        </div>
      </div>
    </div>

    <!-- Neural Lyrics Panel -->
    <NeuralLyricsOverlay 
      v-if="!isCanvasActive"
      :lyrics="uiStore.musicLyrics"
      :musicState="uiStore.musicState"
      :visibleLyrics="visibleLyrics"
    />

    <!-- Unified System Widgets Overlay -->
    <WidgetsLayer :isCanvasActive="isCanvasActive" />

    <!-- Spotlight Search Overlay -->
    <SpotlightSearch />

    <!-- Custom Toast System (Matte Dark) with WAI-ARIA Live Region -->
    <div 
      class="fixed bottom-6 left-6 z-[999] max-w-sm pointer-events-none" 
      role="region" 
      aria-label="Системные уведомления"
    >
      <TransitionGroup 
        name="toast-fade" 
        tag="div" 
        class="flex flex-col-reverse gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        <div 
          v-for="toast in toasts" 
          :key="toast.id"
          role="status"
          class="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-[0_12px_36px_rgba(0,0,0,0.8)] transition duration-300 transform bg-[#0E0E0E]"
          :class="[
            toast.type === 'success' ? 'border-[var(--status-ok)]/40 text-[var(--status-ok)]' :
            toast.type === 'error' ? 'border-[var(--status-err)]/50 text-[var(--status-err)]' :
            'border-white/[0.08] text-[var(--arc-text-primary)]'
          ]"
        >
          <div class="w-2 h-2 rounded-full shrink-0"
               :class="[
                 toast.type === 'success' ? 'bg-[var(--status-ok)]' :
                 toast.type === 'error' ? 'bg-[var(--status-err)]' :
                 'bg-[var(--arc-text-hint)]'
               ]"></div>
          <span class="text-xs font-mono tracking-wider uppercase font-semibold">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import BottomBar from '../components/panels/BottomBar.vue';
import VoiceQuickPanel from '../components/voice/VoiceQuickPanel.vue';
import ReactorCore from '../components/reactor/ReactorCore.vue';
import SpaceBackground from '../components/ui/SpaceBackground.vue';
import TabBar from '../components/ui/TabBar.vue';
import SpotlightSearch from '../components/ui/SpotlightSearch.vue';

import AwakeningOverlay from './components/AwakeningOverlay.vue';
import HolographicProjectionPanel from './components/HolographicProjectionPanel.vue';
import NeuralLyricsOverlay from './components/NeuralLyricsOverlay.vue';
import WidgetsLayer from '../components/widgets/WidgetsLayer.vue';

import { useCommandCenter } from './composables/useCommandCenter';
import { useEcoStore } from '../stores/eco.store';
import { registerSingleton } from '../utils/arcGhostDetector';

const ecoStore = useEcoStore();
const isEcoActive = computed(() => Boolean(ecoStore.isEcoActive));

const isWorkspacesExpanded = ref(false);

let unregister: (() => void) | null = null;

onMounted(() => {
  unregister = registerSingleton('CommandCenter');
});

onUnmounted(() => {
  if (unregister) {
    unregister();
    unregister = null;
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (unregister) {
      unregister();
      unregister = null;
    }
  });
}

const {
  uiStore,
  settingsStore,
  isAwakening,
  toasts,
  localizations,
  isCanvasActive,
  visibleLyrics,
  coreCenter,
  coreScaleProps,
  coreStyle,
  projectionTitle,
  isUnhandledTab,
  closeProjection,
  handleCoreClick,
  formatTime,
  toggleMusic,
  nextTrack,
  prevTrack,
  seekTrack,
  toggleShuffle,
  toggleRepeat,
  toggleLike,
  toggleMute,
  handleVolumeInput,
  fileSearch,
  selectedFile,
  filteredFiles,
  triggerWorkspaceAction,
  isCameraActive,
  videoPlayer,
  initializeCamera,
  stopCamera
} = useCommandCenter();
</script>

<style scoped>
/* Toast animations */
.toast-fade-enter-active, .toast-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-fade-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>
