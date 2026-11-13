<template>
  <aside class="w-64 border-r border-[var(--arc-hairline)] flex flex-col bg-[var(--arc-plane)]">
    <div 
      class="p-4 border-b border-[var(--arc-hairline)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <h3 class="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--arc-text-muted)]">Палитра блоков</h3>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
      <div v-for="group in nodeGroups" :key="group.name">
        <h4 class="text-xs font-mono font-bold uppercase tracking-wider text-[var(--arc-text-hint)] mb-3">{{ group.name }}</h4>
        <div class="space-y-2">
          <div 
            v-for="node in group.nodes" 
            :key="node.type"
            :id="'palette-node-' + node.type.replace('/', '-')"
            draggable="true" 
            @dragstart="$emit('dragStart', $event, node)"
            @click="$emit('addNode', node)"
            class="p-3 pl-4 rounded-[12px] active:scale-[0.98] duration-150 ease-out transition cursor-pointer group relative overflow-hidden border bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border-[var(--arc-hairline)] hover:border-[rgba(var(--accent-rgb),0.45)]"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.35)' }"
          >
            <!-- Left glowing brand indicator line -->
            <div class="absolute left-0 top-0 bottom-0 w-[3px] opacity-75 group-hover:opacity-100 transition group-hover:w-[4px] bg-[var(--accent)]"></div>
            
            <div class="flex items-center gap-2.5 mb-1.5 relative z-10">
              <div class="p-1.5 rounded-[8px] flex items-center justify-center transition-colors bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--accent)] group-hover:text-white group-hover:bg-[var(--accent)]">
                <component :is="getIcon(node.icon)" class="w-3.5 h-3.5" />
              </div>
              <span class="text-xs font-sans font-bold text-[var(--arc-text-primary)] translate-y-px">{{ node.title }}</span>
            </div>
            <p class="text-xs font-sans text-[var(--arc-text-muted)] leading-relaxed pl-[34px] group-hover:text-[var(--arc-text-secondary)] transition-colors relative z-10">{{ node.desc }}</p>
            
            <!-- Add-icon Overlay -->
            <div class="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--arc-block)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end pr-3">
              <div class="p-1.5 rounded-full bg-[var(--accent)] text-white shadow-[0_0_10px_rgba(var(--accent-rgb),0.4)]">
                <Plus class="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { 
  Play, Globe, Terminal, Music, Folder, MessageSquare, Clock, Cpu, Plus, Sparkles 
} from 'lucide-vue-next';

defineProps<{
  nodeGroups: any[];
}>();

defineEmits<{
  (e: 'dragStart', event: DragEvent, node: any): void;
  (e: 'addNode', node: any): void;
}>();

const getIcon = (name: string) => {
  const map: any = { Play, Globe, Terminal, Music, Folder, MessageSquare, Clock, Cpu, Sparkles };
  return map[name] || Cpu;
};
</script>
