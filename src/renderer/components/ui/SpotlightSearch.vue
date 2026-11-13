<template>
  <transition name="fade">
    <div 
      v-if="isOpen"
      @click="close"
      class="fixed inset-0 z-[50000] arc-glass-veil flex items-start justify-center pt-24 px-4 select-none"
    >
      <!-- Search Container (Tactile Obsidian Popover) -->
      <div 
        @click.stop
        class="w-full max-w-xl bg-[var(--arc-popover)] border border-[var(--arc-hairline)] rounded-[20px] overflow-hidden flex flex-col max-h-[450px]"
        :style="{
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 64px rgba(0, 0, 0, 0.85)'
        }"
      >
        <!-- Search Input -->
        <div 
          class="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--arc-divider)] bg-[var(--arc-plane)]"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
        >
          <Search class="w-5 h-5 text-[var(--accent)] shrink-0" />
          <input
            ref="searchInput"
            v-model="query"
            type="text"
            placeholder="Поиск разделов и модулей... (↑↓ стрелки, Enter выбор)"
            class="flex-1 bg-transparent border-none text-[var(--arc-text-primary)] text-sm outline-none placeholder-[var(--arc-text-muted)] font-mono tracking-wide"
            @keydown.down.prevent="moveSelection(1)"
            @keydown.up.prevent="moveSelection(-1)"
            @keydown.enter.prevent="selectActive"
            @keydown.esc="close"
          />
          <div class="flex items-center gap-1 shrink-0 font-mono text-xs text-[var(--arc-text-muted)] border border-[var(--arc-hairline)] bg-[var(--arc-input)] px-2 py-0.5 rounded-[6px] uppercase">
            ESC
          </div>
        </div>

        <!-- Results List -->
        <div class="flex-1 overflow-y-auto p-2 no-scrollbar">
          <div 
            v-if="filteredTabs.length === 0"
            class="py-8 text-center text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-widest"
          >
            Ничего не найдено
          </div>
          
          <button
            v-for="(item, idx) in filteredTabs"
            :key="item.name"
            @click="selectTab(item.name)"
            @mouseenter="selectedIndex = idx"
            class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-[10px] transition duration-150 text-left cursor-pointer"
            :class="[
              selectedIndex === idx 
                ? 'bg-[var(--arc-selected)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)]' 
                : 'border border-transparent text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'
            ]"
          >
            <div class="flex items-center gap-3 min-w-0">
              <component 
                :is="item.icon" 
                class="w-4.5 h-4.5 shrink-0"
                :class="[selectedIndex === idx ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)]']"
              />
              <span class="font-mono text-xs uppercase tracking-wider truncate">{{ item.label }}</span>
            </div>
            
            <div class="flex items-center gap-1.5 shrink-0 font-mono text-xs text-[var(--arc-text-muted)] uppercase">
              <span v-if="selectedIndex === idx" class="text-[var(--accent)] font-bold">ВЫБРАТЬ ↵</span>
              <span v-else>РАЗДЕЛ</span>
            </div>
          </button>
        </div>

        <!-- Footer Info -->
        <div class="px-4 py-2.5 border-t border-[var(--arc-divider)] bg-[var(--arc-plane)] flex items-center justify-between text-xs font-mono text-[var(--arc-text-muted)] uppercase tracking-widest">
          <span>Навигационный прожектор A.R.C.</span>
          <div class="flex items-center gap-3">
            <span>↑↓ Перемещение</span>
            <span>↵ Выбор</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useUIStore } from '../../stores/ui.store';
import type { TabName } from '../../../shared/types/ui';
import { TAB_REGISTRY } from '../../../shared/types/ui';
import {
  Search,
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
  FileAudio
} from 'lucide-vue-next';

const uiStore = useUIStore();
const isOpen = ref(false);
const query = ref('');
const selectedIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);

const tabsList = [
  { name: 'core', label: TAB_REGISTRY['core'] || 'CORE', icon: Cpu },
  { name: 'chat', label: TAB_REGISTRY['chat'] || 'CHAT', icon: MessageSquare },
  { name: 'objectives', label: TAB_REGISTRY['objectives'] || 'OBJECTIVES', icon: Target },
  { name: 'tasks', label: TAB_REGISTRY['tasks'] || 'TASKS', icon: CheckSquare },
  { name: 'files', label: TAB_REGISTRY['files'] || 'FILES', icon: Folder },
  { name: 'orchestrator', label: TAB_REGISTRY['orchestrator'] || 'ORCHESTRATOR', icon: Sliders },
  { name: 'agents', label: TAB_REGISTRY['agents'] || 'AGENTS', icon: Bot },
  { name: 'memory', label: TAB_REGISTRY['memory'] || 'MEMORY', icon: Brain },
  { name: 'tools', label: TAB_REGISTRY['tools'] || 'TOOLS', icon: Wrench },
  { name: 'skills', label: TAB_REGISTRY['skills'] || 'SKILLS', icon: Layers },
  { name: 'architecture', label: TAB_REGISTRY['architecture'] || 'ARCHITECTURE', icon: Network },
  { name: 'scenarios', label: TAB_REGISTRY['scenarios'] || 'SCENARIOS', icon: BookOpen },
  { name: 'commands', label: TAB_REGISTRY['commands'] || 'КОМАНДЫ', icon: Terminal },
  { name: 'observability', label: TAB_REGISTRY['observability'] || 'OBSERVABILITY', icon: LineChart },
  { name: 'sandbox', label: TAB_REGISTRY['sandbox'] || 'SANDBOX', icon: FlaskConical },
  { name: 'settings', label: TAB_REGISTRY['settings'] || 'SETTINGS', icon: Settings },
  { name: 'vision', label: TAB_REGISTRY['vision'] || 'VISION', icon: Eye },
  { name: 'transcription', label: TAB_REGISTRY['transcription'] || 'АУДИО', icon: FileAudio }
] as const;

const filteredTabs = computed(() => {
  if (!query.value) return tabsList;
  const q = query.value.toLowerCase();
  return tabsList.filter(tab => 
    tab.label.toLowerCase().includes(q) || 
    tab.name.toLowerCase().includes(q)
  );
});

watch(query, () => {
  selectedIndex.value = 0;
});

const open = () => {
  isOpen.value = true;
  query.value = '';
  selectedIndex.value = 0;
  nextTick(() => {
    if (searchInput.value) {
      searchInput.value.focus();
    }
  });
};

const close = () => {
  isOpen.value = false;
};

const moveSelection = (direction: number) => {
  const len = filteredTabs.value.length;
  if (len === 0) return;
  selectedIndex.value = (selectedIndex.value + direction + len) % len;
};

const selectActive = () => {
  const item = filteredTabs.value[selectedIndex.value];
  if (item) {
    selectTab(item.name);
  }
};

const selectTab = (tab: TabName) => {
  uiStore.setActiveTab(tab);
  close();
};

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  }
};

const handleOpenEvent = () => {
  open();
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('open-spotlight', handleOpenEvent);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('open-spotlight', handleOpenEvent);
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
