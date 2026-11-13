<template>
  <div class="border border-[var(--arc-hairline)] bg-[var(--arc-plane)] p-5 md:p-6 rounded-xl flex flex-col gap-5">
    <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-4 pb-4 border-b border-[var(--arc-divider)]">
      <div>
        <span class="text-xs font-mono font-semibold tracking-widest text-[var(--arc-text-hint)] uppercase">ОПЕРАЦИОННЫЙ МАРШРУТ</span>
        <h4 class="text-sm font-sans font-medium text-[var(--arc-text-primary)] mt-0.5">Маршрут достижения цели и точки решений</h4>
      </div>

      <div class="flex items-center gap-2">
        <ArcButton @click="$emit('declineRoute')" variant="secondary" size="sm">
          Отклонить
        </ArcButton>
        <ArcButton @click="$emit('modifyRoute')" variant="secondary" size="sm">
          Корректировать
        </ArcButton>
        <ArcButton @click="$emit('approveRoute')" variant="primary" size="sm">
          Утвердить
        </ArcButton>
      </div>
    </div>

    <!-- Route Canvas -->
    <div 
      v-if="currentRouteMap && currentRouteMap.nodes.length > 0" 
      class="relative h-[320px] md:h-[380px] border border-[var(--arc-hairline)] rounded-xl bg-[var(--arc-block)] overflow-hidden select-none"
      @mousemove="$emit('onDragMove', $event)"
      @mouseup="$emit('stopDrag')"
      @mouseleave="$emit('stopDrag')"
    >
      <svg class="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255, 255, 255, 0.4)"/>
          </marker>
          <marker id="arrow-milestone" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"/>
          </marker>
        </defs>
        
        <g v-for="(edge, idx) in currentRouteMap.edges" :key="'edge-'+idx">
          <line 
            v-if="getNodeCoords(edge.source) && getNodeCoords(edge.target)"
            :x1="getNodeCoords(edge.source).x + '%'" 
            :y1="getNodeCoords(edge.source).y + '%'"
            :x2="getNodeCoords(edge.target).x + '%'" 
            :y2="getNodeCoords(edge.target).y + '%'"
            stroke="rgba(255, 255, 255, 0.25)"
            stroke-width="1.5"
            :stroke-dasharray="edge.label === 'Next Milestone' ? 'none' : '4,4'"
            :marker-end="edge.label === 'Next Milestone' ? 'url(#arrow-milestone)' : 'url(#arrow)'"
          />
        </g>
      </svg>

      <div 
        v-for="node in currentRouteMap.nodes" 
        :key="'drag-'+node.id"
        :style="{ left: `${node.x}%`, top: `${node.y}%` }"
        @mousedown.stop="$emit('startDrag', $event, node.id)"
        class="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing dnd-node z-20 transition group p-3 rounded-lg border flex flex-col gap-1.5 items-center justify-center shadow-lg w-[170px] select-none text-xs font-sans text-center"
        :class="[
          excludedNodes.includes(node.id) 
            ? 'border-[var(--arc-hairline)] opacity-30 bg-[var(--arc-rail)]' 
            : (node.type === 'OUTCOME' 
                ? 'border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:border-white/40' 
                : (node.type === 'DECISION' 
                    ? (node.requiresApproval ? 'border-[var(--status-warn)] bg-[var(--arc-plane)]' : 'border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:border-white/20') 
                    : 'border-[var(--arc-hairline)] bg-[var(--arc-plane)] hover:border-white/30'))
        ]"
      >
        <div class="flex items-center gap-1.5 justify-center max-w-full">
          <Lock v-if="node.type === 'DECISION' && node.requiresApproval" class="w-3.5 h-3.5 text-[var(--status-warn)] shrink-0" />
          <Target v-else-if="node.type === 'OUTCOME'" class="w-3.5 h-3.5 text-[var(--arc-text-primary)] shrink-0" />
          <Cpu v-else-if="node.type === 'DECISION'" class="w-3.5 h-3.5 text-[var(--arc-text-hint)] shrink-0" />
          <FileText v-else class="w-3.5 h-3.5 text-[var(--status-ok)] shrink-0" />

          <span class="font-medium truncate max-w-[120px] text-[var(--arc-text-primary)] text-xs">{{ node.title }}</span>
        </div>

        <span class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">{{ node.type }}</span>
      </div>
    </div>

    <!-- Exclusion Toggles -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[180px] overflow-y-auto custom-scrollbar select-none pt-1">
      <div 
        v-for="node in currentRouteMap?.nodes" 
        :key="'check-'+node.id"
        @click="$emit('toggleNodeExclusion', node.id)"
        class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition hover:bg-[var(--arc-hover)]"
        :class="[
          excludedNodes.includes(node.id) 
            ? 'border-[var(--arc-hairline)] opacity-30 bg-[var(--arc-rail)]' 
            : (node.type === 'DECISION' && node.requiresApproval ? 'border-[var(--arc-hairline)] bg-[var(--arc-plane)]' : 'border-[var(--arc-hairline)] bg-[var(--arc-plane)]')
        ]"
      >
        <div class="w-4 h-4 border rounded flex items-center justify-center shrink-0 border-[var(--arc-hairline)]" :class="[!excludedNodes.includes(node.id) ? 'bg-[var(--arc-selected)]' : 'bg-transparent']">
          <Check v-if="!excludedNodes.includes(node.id)" class="w-3 h-3 text-[var(--arc-text-primary)]" />
        </div>
        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
          <span class="text-xs font-sans font-medium truncate" :class="[!excludedNodes.includes(node.id) ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-hint)]']">
            {{ node.title }}
          </span>
          <span class="text-xs font-mono text-[var(--arc-text-hint)]">
            {{ node.type }} <span v-if="node.requiresApproval" class="text-[var(--status-warn)] font-semibold ml-1">• Clearance Req</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Target, Lock, Cpu, FileText, Check } from 'lucide-vue-next';
import ArcButton from '../../../components/ui/ArcButton.vue';

defineProps<{
  currentRouteMap: any;
  excludedNodes: string[];
  getNodeCoords: (id: string) => { x: number; y: number } | null;
}>();

defineEmits<{
  (e: 'approveRoute'): void;
  (e: 'modifyRoute'): void;
  (e: 'declineRoute'): void;
  (e: 'startDrag', event: MouseEvent, id: string): void;
  (e: 'onDragMove', event: MouseEvent): void;
  (e: 'stopDrag'): void;
  (e: 'toggleNodeExclusion', id: string): void;
}>();
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.01);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
