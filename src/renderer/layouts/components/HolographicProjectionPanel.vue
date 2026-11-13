<template>
  <Transition name="projection">
    <div 
      v-if="isCanvasActive" 
      class="absolute inset-0 top-[38px] z-30 pointer-events-none flex items-center justify-center p-0"
    >
      <!-- Outer Container: Fullscreen edge-to-edge workspace for all tabs -->
      <div 
        class="relative flex flex-col pointer-events-auto overflow-hidden transition-all duration-300 w-full h-full max-w-none max-h-none rounded-none bg-[var(--arc-plane)]"
        :style="{
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--arc-plane)',
          borderTop: '1px solid var(--arc-hairline)',
          borderRadius: '0px',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)'
        }"
        @click.stop
      >
        <!-- Inner Reading Plane (Opaque plane: var(--arc-plane) #0A0A0A, flush inside frame) -->
        <div 
          class="w-full h-full flex flex-col relative z-10 overflow-hidden bg-[var(--arc-plane)]"
        >
          <!-- Mounting Container for Workspace Tabs -->
          <div class="flex-1 min-h-0 overflow-hidden relative z-10 h-full flex flex-col bg-transparent">
            <Transition name="tab-crossfade" mode="out-in">
              <KeepAlive :max="8">
                <component
                  :is="currentTabComponent"
                  :key="activeTab"
                  :active-tab="activeTab"
                  :filtered-files="filteredFiles"
                  :file-search="fileSearch"
                  :localizations="localizations"
                  :is-camera-active="isCameraActive"
                  :video-player="videoPlayer"
                  @update:file-search="emit('update:fileSearch', $event)"
                  @select-file="emit('selectFile', $event)"
                  @trigger-action="emit('triggerAction', $event)"
                  @initialize-camera="emit('initializeCamera')"
                  @stop-camera="emit('stopCamera')"
                  class="w-full h-full min-h-0 bg-transparent"
                />
              </KeepAlive>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import { registerSingleton } from '../../utils/arcGhostDetector';

let unregisterSingleton: (() => void) | null = null;

onMounted(() => {
  unregisterSingleton = registerSingleton('HolographicProjectionPanel');
});

onUnmounted(() => {
  if (unregisterSingleton) {
    unregisterSingleton();
    unregisterSingleton = null;
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (unregisterSingleton) {
      unregisterSingleton();
      unregisterSingleton = null;
    }
  });
}

import FallbackTabView from '../../components/ui/FallbackTabView.vue';
import FilesTabView from '../../features/files/components/FilesTabView.vue';
import VisionTabView from '../../features/vision/components/VisionTabView.vue';

const ChatView = defineAsyncComponent(() => import('../../features/chat/components/ChatView.vue'));
const CommandsView = defineAsyncComponent(() => import('../../features/commands/components/CommandsView.vue'));
const ModulesView = defineAsyncComponent(() => import('../../features/modules/components/ModulesView.vue'));
const MemoryView = defineAsyncComponent(() => import('../../features/memory/components/MemoryView.vue'));
const SettingsPanel = defineAsyncComponent(() => import('../../features/settings/components/SettingsPanel.vue'));
const TasksView = defineAsyncComponent(() => import('../../features/tasks/components/TasksView.vue'));
const ObjectivesView = defineAsyncComponent(() => import('../../features/objectives/components/ObjectivesView.vue'));
const TranscriptionView = defineAsyncComponent(() => import('../../features/transcription/components/TranscriptionView.vue'));
const UpdatesHistorySection = defineAsyncComponent(() => import('../../features/settings/components/UpdatesHistorySection.vue'));

const props = defineProps<{
  isCanvasActive: boolean;
  tabBarPosition: string;
  activeTab: string;
  localizations: any;
  projectionTitle: string;
  filteredFiles: string[];
  fileSearch: string;
  isUnhandledTab: boolean;
  isCameraActive: boolean;
  videoPlayer?: any;
}>();

const emit = defineEmits<{
  (e: 'closeProjection'): void;
  (e: 'update:fileSearch', val: string): void;
  (e: 'selectFile', file: string): void;
  (e: 'triggerAction', msg: string): void;
  (e: 'initializeCamera'): void;
  (e: 'stopCamera'): void;
}>();

const currentTabComponent = computed(() => {
  switch (props.activeTab) {
    case 'chat': return ChatView;
    case 'commands': return CommandsView;
    case 'modules': return ModulesView;
    case 'memory': return MemoryView;
    case 'settings': return SettingsPanel;
    case 'tasks': return TasksView;
    case 'objectives': return ObjectivesView;
    case 'transcription': return TranscriptionView;
    case 'files': return FilesTabView;
    case 'vision': return VisionTabView;
    case 'updates': return UpdatesHistorySection;
    default: return FallbackTabView;
  }
});
</script>

<style scoped>
.projection-enter-active,
.projection-leave-active {
  transition: opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), 
              transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
.projection-enter-from,
.projection-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}
.projection-enter-to,
.projection-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.tab-crossfade-enter-active,
.tab-crossfade-leave-active {
  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tab-crossfade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.tab-crossfade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.arc-projection-frame {
  padding: 20px 24px 20px 24px;
}

.arc-projection-frame::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40%;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 12%, transparent 40%);
  pointer-events: none;
  z-index: 1;
}

@keyframes bracket-breathe {
  0% {
    opacity: 0.70;
  }
  100% {
    opacity: 1;
  }
}

.arc-bracket-breath {
  animation: bracket-breathe 2400ms ease-in-out infinite alternate;
}

.arc-projection-frame:hover .arc-bracket-tl,
.arc-projection-frame:hover .arc-bracket-tr,
.arc-projection-frame:hover .arc-bracket-bl,
.arc-projection-frame:hover .arc-bracket-br {
  border-color: var(--arc-bracket-hover, rgba(var(--accent-rgb), 0.34));
}

@media (max-width: 768px) {
  .arc-projection-frame {
    width: 96vw !important;
    height: 82vh !important;
    padding: 8px 10px 8px 10px !important;
    border-radius: 18px !important;
  }
}

@media (min-width: 769px) and (max-width: 1366px), (max-height: 768px) {
  .arc-projection-frame {
    width: min(92vw, 1240px) !important;
    height: min(78vh, 860px) !important;
    padding: 12px 16px 12px 16px !important;
  }
}
</style>
