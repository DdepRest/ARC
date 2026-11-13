<template>
  <button
    :id="'tab-' + name"
    role="tab"
    :aria-selected="isActive"
    :aria-controls="'panel-' + name"
    :aria-label="label"
    :tabindex="isActive ? 0 : -1"
    class="group flex items-center justify-center gap-1.5 font-mono uppercase transition-colors duration-150 relative select-none shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    :class="[
      isPinned 
        ? 'w-[34px] h-[34px] rounded-[10px]' 
        : 'h-[34px] px-2.5 rounded-[10px] text-xs tracking-wide font-medium',
      isActive 
        ? 'text-[var(--accent)] font-semibold' 
        : 'text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'
    ]"
    @click="$emit('select', name)"
    @keydown="$emit('keydown', $event, name)"
    @contextmenu.prevent="$emit('contextmenu', $event, name)"
    :title="label"
  >
    <!-- Icon Component -->
    <component 
      :is="iconComponent" 
      class="shrink-0 transition-colors duration-150"
      :class="[
        isPinned ? 'w-4 h-4' : 'w-3.5 h-3.5',
        isActive ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)]'
      ]" 
    />
    
    <!-- Tab Label (Only if not pinned) -->
    <span v-if="!isPinned" class="font-mono uppercase whitespace-nowrap tracking-wide text-xs">{{ label }}</span>

    <!-- Active Indicator for Pinned Tabs (Precision Pip) -->
    <span 
      v-if="isPinned && isActive" 
      class="absolute bottom-1 w-1 h-1 bg-[var(--accent)] rounded-full"
    ></span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type TabName, TAB_REGISTRY } from '../../../shared/types/ui';
import {
  Cpu,
  MessageSquare,
  Target,
  CheckSquare,
  Folder,
  Sliders,
  Bot,
  Brain,
  Wrench,
  Layers,
  Network,
  BookOpen,
  Terminal,
  LineChart,
  FlaskConical,
  Settings,
  Eye,
  FileAudio,
  History
} from 'lucide-vue-next';

const props = defineProps<{
  name: TabName;
  isActive: boolean;
  isPinned: boolean;
}>();

defineEmits<{
  (e: 'select', name: TabName): void;
  (e: 'keydown', event: KeyboardEvent, name: TabName): void;
  (e: 'contextmenu', event: MouseEvent, name: TabName): void;
}>();

const label = computed(() => {
  return TAB_REGISTRY[props.name] || String(props.name).toUpperCase();
});

const iconComponent = computed(() => {
  switch (props.name) {
    case 'core': return Cpu;
    case 'chat': return MessageSquare;
    case 'objectives': return Target;
    case 'tasks': return CheckSquare;
    case 'files': return Folder;
    case 'orchestrator': return Sliders;
    case 'agents': return Bot;
    case 'memory': return Brain;
    case 'tools': return Wrench;
    case 'skills': return Layers;
    case 'architecture': return Network;
    case 'scenarios': return BookOpen;
    case 'commands': return Terminal;
    case 'observability': return LineChart;
    case 'sandbox': return FlaskConical;
    case 'settings': return Settings;
    case 'vision': return Eye;
    case 'transcription': return FileAudio;
    case 'updates': return History;
    default: return Cpu;
  }
});
</script>
