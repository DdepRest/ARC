<template>
  <div 
    class="flex-1 flex flex-col gap-6 select-none min-h-[550px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px] p-6"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.65)'
    }"
  >
    <div class="flex items-center justify-between border-b border-[var(--arc-divider)] pb-4">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-mono font-semibold text-[var(--arc-text-hint)] uppercase tracking-widest">ГЛОБАЛЬНАЯ ТОПОЛОГИЯ</span>
        <h3 class="font-sans text-base font-medium text-[var(--arc-text-primary)] mt-0.5">Общая карта траекторий целей</h3>
      </div>
      <span class="text-xs font-mono border border-[var(--arc-hairline)] bg-[var(--arc-plane)] text-[var(--arc-text-secondary)] px-3 py-1 rounded-[8px] font-semibold uppercase tracking-wider">Dynamic Scale</span>
    </div>
    
    <div 
      class="flex-1 relative border border-[var(--arc-hairline)] rounded-[12px] bg-[var(--arc-input)] overflow-hidden flex flex-col items-center justify-center p-8 min-h-[450px] md:min-h-[550px]"
      :style="{ boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7)' }"
    >
      <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <g v-if="graphLinksScaled && graphLinksScaled.length > 0">
          <line 
            v-for="(link, idx) in graphLinksScaled" 
            :key="'link-'+idx"
            :x1="link.x1" :y1="link.y1"
            :x2="link.x2" :y2="link.y2"
            stroke="rgba(255, 255, 255, 0.2)"
            stroke-width="1.5"
            stroke-dasharray="6,6"
          />
        </g>
      </svg>

      <div 
        v-for="(node, idx) in graphNodesScaled" 
        :key="'node-'+idx"
        :style="{ left: `${node.x}%`, top: `${node.y}%`, backgroundImage: 'var(--arc-sheen)' }"
        @click="$emit('selectObjective', node.id)"
        class="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition hover:scale-105 flex flex-col items-center group bg-[var(--arc-plane)] p-4 rounded-[12px] border border-[var(--arc-hairline)] w-[170px] text-center shadow-lg"
        :class="[
          selectedObjId === node.id 
            ? 'border-[var(--accent)] shadow-[0_0_16px_rgba(var(--accent-rgb),0.3)] bg-[var(--arc-selected)]' 
            : (node.status === 'COMPLETED' ? 'border-[var(--status-ok)] bg-[var(--arc-plane)]' : 'border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))]')
        ]"
      >
        <div class="w-7 h-7 rounded-full border border-[var(--arc-hairline)] bg-[var(--arc-block)] flex items-center justify-center font-mono text-xs text-[var(--arc-text-primary)] font-semibold mb-2">{{ idx + 1 }}</div>
        <span class="font-sans text-xs text-[var(--arc-text-primary)] font-medium truncate max-w-full block leading-snug">{{ node.title }}</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <span 
            class="w-1.5 h-1.5 rounded-full" 
            :class="node.status === 'COMPLETED' ? 'bg-[var(--status-ok)]' : (node.status === 'IN_PROGRESS' ? 'bg-[var(--status-warn)]' : 'bg-[var(--status-off)]')"
          ></span>
          <span class="font-mono text-xs text-[var(--arc-text-hint)] uppercase tracking-wider leading-none">{{ node.status }}</span>
        </div>
      </div>

      <div class="absolute bottom-3 left-3 text-xs font-mono text-[var(--arc-text-hint)]">
        Интерактивный граф связей целей
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
