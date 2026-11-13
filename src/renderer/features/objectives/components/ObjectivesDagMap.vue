<template>
  <div class="p-6 md:p-8 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-xl">
    <div class="flex items-center justify-between mb-4 select-none">
      <span class="text-sm font-sans font-medium text-[var(--arc-text-primary)]">Карта связей целей (DAG)</span>
      <div class="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"></div>
    </div>
    <div class="relative min-h-[240px] md:min-h-[320px] border border-[var(--arc-hairline)] rounded-xl bg-[var(--arc-block)] overflow-hidden flex flex-col items-center justify-center p-8">
      <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <g v-if="graphLinksScaled && graphLinksScaled.length > 0">
          <line 
            v-for="(link, idx) in graphLinksScaled" 
            :key="'link-'+idx"
            :x1="link.x1" :y1="link.y1"
            :x2="link.x2" :y2="link.y2"
            stroke="rgba(255, 255, 255, 0.2)"
            stroke-width="1.5"
            stroke-dasharray="4,4"
          />
        </g>
      </svg>

      <div 
        v-for="(node, idx) in graphNodesScaled" 
        :key="'node-'+idx"
        :style="{ left: `${node.x}%`, top: `${node.y}%` }"
        @click="$emit('selectObjective', node.id)"
        class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform hover:scale-105 flex flex-col items-center group"
      >
        <div 
          class="w-9 h-9 rounded-full border flex items-center justify-center transition"
          :class="[
            selectedObjId === node.id 
              ? 'border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.15)] shadow-[0_0_12px_rgba(var(--accent-rgb),0.35)]'
              : (node.status === 'COMPLETED' ? 'border-[var(--status-ok)] bg-[var(--arc-plane)]' : 'border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:border-white/40')
          ]"
        >
          <span class="text-xs font-mono text-[var(--arc-text-primary)] font-semibold">{{ idx + 1 }}</span>
        </div>
        <div class="absolute top-10 bg-[var(--arc-popover)] px-3 py-1.5 rounded-lg border border-[var(--arc-hairline)] text-xs font-sans text-[var(--arc-text-primary)] select-none hidden group-hover:block whitespace-nowrap z-20 shadow-xl">
          {{ node.title }} ({{ node.status }})
        </div>
      </div>

      <div class="absolute bottom-4 right-4 text-xs font-sans text-[var(--arc-text-hint)] select-none">
        Связи между активными целями системы
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  graphNodesScaled: any[];
  graphLinksScaled: any[];
  selectedObjId: string | null;
}>();

defineEmits<{
  (e: 'selectObjective', id: string): void;
}>();
</script>
