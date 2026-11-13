<template>
  <div 
    v-if="selectedObj" 
    class="p-6 md:p-8 flex flex-col gap-8 relative overflow-hidden border border-[var(--arc-hairline)] bg-[var(--arc-block)] rounded-[16px]"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <!-- 1. Strategic Intent & Meta Header -->
    <div class="flex flex-col gap-5 pb-6 border-b border-[var(--arc-divider)]">
      <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div class="flex flex-col gap-2 flex-1 min-w-0">
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-hint)] uppercase">
              VECTOR // {{ safeSlice(selectedObj.id, 0, 8) }}
            </span>
            <StatusBadge :status="selectedObj.status" />
          </div>
          <h3 class="text-lg md:text-xl font-sans font-semibold text-[var(--arc-text-primary)] tracking-normal leading-snug break-words">
            {{ selectedObj.title }}
          </h3>
        </div>

        <!-- Action Controls -->
        <div class="flex items-center gap-3 shrink-0">
          <ArcButton 
            v-if="['ACTIVE', 'COMPLETED', 'BLOCKED'].includes(selectedObj.status)"
            @click="$emit('decomposeObjective')"
            variant="secondary"
            size="sm"
          >
            <template #icon>
              <GitBranch class="w-4 h-4 text-[var(--arc-text-hint)]" />
            </template>
            Декомпозировать
          </ArcButton>
          
          <ArcButton 
            v-if="['ACTIVE', 'COMPLETED', 'BLOCKED'].includes(selectedObj.status)"
            @click="$emit('rollbackCurrentObjective')"
            :disabled="isRollingBack"
            variant="danger"
            size="sm"
          >
            <template #icon>
              <span v-if="isRollingBack" class="w-3.5 h-3.5 border-2 border-[rgba(var(--status-err-rgb,239,68,68),0.3)] border-t-[var(--status-err)] rounded-full animate-spin shrink-0"></span>
              <RotateCcw v-else class="w-3.5 h-3.5 text-[var(--status-err)]" />
            </template>
            Откатить
          </ArcButton>
        </div>
      </div>
      
      <p v-if="selectedObj.description" class="text-sm font-sans text-[var(--arc-text-secondary)] leading-relaxed max-w-3xl">
        {{ selectedObj.description }}
      </p>

      <!-- Machine & Operational Meta Bar -->
      <div class="flex flex-wrap items-center gap-3 pt-2 text-xs font-mono select-none">
        <div 
          class="flex items-center gap-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-[var(--arc-text-secondary)]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <User class="w-3.5 h-3.5 text-[var(--arc-text-hint)]" />
          <span class="text-[var(--arc-text-hint)]">OWNER:</span>
          <span class="font-semibold text-[var(--arc-text-primary)]">{{ selectedObj.owner }}</span>
        </div>
        <div 
          class="flex items-center gap-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-[var(--arc-text-secondary)]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <Zap class="w-3.5 h-3.5 text-[var(--status-warn)]" />
          <span class="text-[var(--arc-text-hint)]">PRIORITY:</span>
          <span class="font-semibold text-[var(--status-warn)]">{{ selectedObj.priority }}</span>
        </div>
        <div 
          class="flex items-center gap-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-[var(--arc-text-secondary)]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <Activity class="w-3.5 h-3.5 text-[var(--arc-text-hint)]" />
          <span class="text-[var(--arc-text-hint)]">CONFIDENCE:</span>
          <span 
            class="font-semibold"
            :class="selectedObj.confidence > 0.6 ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'"
          >
            {{ Math.round(selectedObj.confidence * 100) }}%
          </span>
        </div>
        <div 
          class="flex items-center gap-2 bg-[var(--arc-plane)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-[var(--arc-text-hint)] ml-auto"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <Calendar class="w-3.5 h-3.5 text-[var(--arc-text-hint)]" />
          <span>{{ safeSlice(selectedObj.created_at, 0, 10) }}</span>
        </div>
      </div>
    </div>

    <!-- 1.5 Pending Decomposition Draft Banner (Task 3.1) -->
    <div 
      v-if="pendingDraft" 
      class="p-4 rounded-[14px] border border-[var(--arc-border-focus)] bg-[var(--arc-plane)] flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden"
      :style="{
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 16px rgba(0, 0, 0, 0.3)'
      }"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-2 rounded-[10px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] shrink-0">
          <Sparkles class="w-4 h-4" />
        </div>
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class="text-sm font-semibold text-[var(--arc-text-primary)] flex items-center gap-2">
            <span>Черновик декомпозиции готов</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--arc-block)] text-[var(--arc-text-hint)] border border-[var(--arc-hairline)] uppercase">DRAFT</span>
          </div>
          <div class="text-xs font-mono text-[var(--arc-text-secondary)]">
            {{ (pendingDraft.outcomes || []).length }} outcomes // {{ (pendingDraft.tasks || []).length }} tasks // {{ (pendingDraft.decisions || []).length }} decisions // {{ (pendingDraft.risks || []).length }} risks
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <ArcButton
          @click="$emit('approveDraft', selectedObj.id)"
          :disabled="isApprovingDraft"
          variant="primary"
          size="sm"
        >
          <template #icon>
            <span v-if="isApprovingDraft" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"></span>
            <Check v-else class="w-3.5 h-3.5" />
          </template>
          Утвердить маршрут
        </ArcButton>
      </div>
    </div>

    <!-- Atomic Rollback Progress Console (If Active) -->
    <div 
      v-if="uiStore.rollbackProgress !== null" 
      class="p-5 border border-[rgba(var(--status-err-rgb,239,68,68),0.4)] bg-[var(--arc-plane)] rounded-[14px] flex flex-col gap-3 relative overflow-hidden"
    >
      <div class="flex justify-between items-center relative z-10">
        <div class="flex items-center gap-2.5">
          <span class="w-2 h-2 rounded-full bg-[var(--status-err)] animate-ping"></span>
          <span class="text-xs font-mono font-semibold text-[var(--status-err)] uppercase tracking-wider">ATOMIC ROLLBACK IN PROGRESS</span>
        </div>
        <span class="text-xs font-mono text-[var(--status-err)] font-semibold">
          {{ uiStore.rollbackProgress.current }} / {{ uiStore.rollbackProgress.total }}
        </span>
      </div>
      
      <div class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-full h-1.5 overflow-hidden">
        <div 
          class="bg-[var(--status-err)] h-full rounded-full transition-all duration-300"
          :style="{ width: `${(uiStore.rollbackProgress.current / uiStore.rollbackProgress.total) * 100}%` }"
        ></div>
      </div>
      
      <div class="text-xs font-mono text-[var(--arc-text-hint)] truncate">
        {{ uiStore.rollbackProgress.text }}
      </div>
    </div>

    <!-- 2. Trajectory / Route Map (If DRAFT) -->
    <ObjectiveRouteApproval 
      v-if="selectedObj.status === 'DRAFT'"
      :currentRouteMap="currentRouteMap"
      :excludedNodes="excludedNodes"
      :getNodeCoords="getNodeCoords"
      @approveRoute="$emit('approveRoute')"
      @modifyRoute="$emit('modifyRoute')"
      @declineRoute="$emit('declineRoute')"
      @startDrag="(e, id) => $emit('startDrag', e, id)"
      @onDragMove="(e) => $emit('onDragMove', e)"
      @stopDrag="$emit('stopDrag')"
      @toggleNodeExclusion="(id) => $emit('toggleNodeExclusion', id)"
    />

    <!-- 3. Key Outcomes Section -->
    <div class="flex flex-col gap-4">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <Target class="w-4 h-4 text-[var(--accent)]" />
          <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-hint)] uppercase">KEY OUTCOMES & METRICS</span>
        </div>
        <span class="text-xs font-mono text-[var(--arc-text-hint)]">
          {{ selectedObj.outcomes?.length || 0 }} METRICS
        </span>
      </div>

      <div v-if="selectedObj.outcomes && selectedObj.outcomes.length > 0" class="flex flex-col gap-3">
        <div 
          v-for="outcome in selectedObj.outcomes" 
          :key="outcome.id" 
          class="p-4 border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-[12px] flex flex-col gap-3"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
        >
          <div class="flex justify-between items-center text-xs">
            <span class="font-sans font-medium text-[var(--arc-text-primary)] truncate max-w-md">{{ outcome.metric_name || outcome.title }}</span>
            <span class="font-mono text-[var(--arc-text-hint)]">PROGRESS: {{ Math.round((outcome.progress || 0) * 100) }}%</span>
          </div>
          
          <ProgressBar :progress="(outcome.progress || 0) * 100" size="sm" :theme="outcome.progress >= 1 ? 'emerald' : 'indigo'" />
          
          <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-hint)] pt-1">
            <div class="flex items-center gap-2">
              <span>CURRENT:</span>
              <input 
                :value="outcome.current_value" 
                @change="$emit('updateOutcomeValue', outcome.id, ($event.target as HTMLInputElement).value)"
                type="number" 
                class="w-18 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[8px] px-2 py-0.5 text-xs text-[var(--arc-text-primary)] text-center focus:outline-none focus:border-[var(--accent)] font-mono font-semibold"
              />
            </div>
            <div class="flex items-center gap-4">
              <span>TARGET: <strong class="text-[var(--arc-text-primary)] font-mono">{{ outcome.target_value }}</strong></span>
              <span>BASE: <strong class="text-[var(--arc-text-hint)] font-mono">{{ outcome.baseline_value }}</strong></span>
            </div>
          </div>
        </div>
      </div>
      <EmptyState v-else title="Показатели отсутствуют" description="Для этой цели не сгенерированы измеримые результаты" icon="target" />
    </div>

    <!-- 4. Split Contingency Canvas: Risks & Decisions -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-2 border-t border-[var(--arc-divider)]">
      <!-- Risks Column -->
      <div class="flex flex-col gap-4">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <ShieldAlert class="w-4 h-4 text-[var(--status-warn)]" />
            <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-hint)] uppercase">RISK MATRIX</span>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-hint)]">{{ selectedObj.risks?.length || 0 }} THREATS</span>
        </div>

        <div v-if="selectedObj.risks && selectedObj.risks.length > 0" class="flex flex-col gap-3 select-none">
          <div 
            v-for="risk in selectedObj.risks" 
            :key="risk.id" 
            @click="$emit('toggleRiskActive', risk)"
            class="p-4 border rounded-[12px] flex flex-col gap-2.5 cursor-pointer transition-colors"
            :class="[
              risk.is_active 
                ? 'border-[rgba(var(--status-warn-rgb,234,179,8),0.4)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)]' 
                : 'border-[var(--arc-hairline)] bg-[var(--arc-plane)] opacity-60 hover:opacity-90'
            ]"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
          >
            <div class="flex justify-between items-center text-xs font-mono">
              <span class="text-[var(--arc-text-hint)] text-xs">ID: {{ safeSlice(risk.id, 0, 8) }}</span>
              <span class="font-semibold text-xs font-mono" :class="risk.is_active ? 'text-[var(--status-warn)]' : 'text-[var(--status-ok)]'">
                {{ risk.is_active ? 'ACTIVE THREAT' : 'COMPENSATED' }}
              </span>
            </div>
            
            <p class="text-xs font-sans font-medium leading-relaxed text-[var(--arc-text-primary)]">
              {{ risk.description }}
            </p>
            
            <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-hint)] pt-2 border-t border-[var(--arc-divider)]">
              <span>PROB: {{ Math.round((risk.likelihood || 0) * 100) }}%</span>
              <span>IMPACT: {{ Math.round((risk.impact || 0) * 100) }}%</span>
              <span 
                class="px-2 py-0.5 rounded font-semibold border border-[var(--arc-hairline)] bg-[var(--arc-block)]"
                :class="((risk.likelihood || 0) * (risk.impact || 0)) > 0.4 ? 'text-[var(--status-warn)]' : 'text-[var(--arc-text-hint)]'"
              >
                SEV {{ ((risk.likelihood || 0) * (risk.impact || 0)).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
        <EmptyState v-else title="Угроз нет" description="Матрица рисков пуста, стабильность контура 100%" icon="inbox" />
      </div>

      <!-- Decisions Column -->
      <div class="flex flex-col gap-4">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <CheckSquare class="w-4 h-4 text-[var(--status-ok)]" />
            <span class="text-xs font-mono font-semibold tracking-wider text-[var(--arc-text-hint)] uppercase">DECISION LOG</span>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-hint)]">{{ filterDecisionsForSelected.length }} LOGGED</span>
        </div>

        <div v-if="filterDecisionsForSelected.length > 0" class="flex flex-col gap-3">
          <div 
            v-for="dec in filterDecisionsForSelected" 
            :key="dec.id" 
            class="p-4 border border-[var(--arc-hairline)] bg-[var(--arc-plane)] rounded-[12px] flex flex-col gap-2"
            :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
          >
            <div class="flex justify-between items-start">
              <div class="flex items-center gap-2 text-xs font-mono">
                <span class="w-1.5 h-1.5 rounded-full" :class="dec.status === 'PENDING' ? 'bg-[var(--status-warn)] animate-pulse' : (dec.status === 'APPROVED' || dec.status === 'DONE' ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-err)]')"></span>
                <span class="text-[var(--arc-text-hint)] text-xs">ID: {{ safeSlice(dec.id, 0, 8) }}</span>
                <span v-if="dec.decision_type" class="px-1.5 py-0.5 rounded text-xs uppercase bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)]">
                  {{ dec.decision_type }}
                </span>
              </div>
              <StatusBadge :status="dec.status || 'PENDING'" />
            </div>
            
            <p class="text-xs font-sans font-medium text-[var(--arc-text-primary)]">{{ dec.title }}</p>
            <p class="text-xs font-sans text-[var(--arc-text-secondary)] leading-relaxed">{{ dec.rationale || 'Рационал решения сформирован автономным контуром.' }}</p>
            
            <div class="flex items-center justify-between text-xs font-mono text-[var(--arc-text-hint)] pt-1">
              <span>TIME: {{ formatDecisionTime(dec.created_at) }}</span>
              <span v-if="dec.execution_weight">WEIGHT: {{ dec.execution_weight }}</span>
            </div>
          </div>
        </div>
        <EmptyState v-else title="Решений нет" description="Система еще не сформировала лог решений по выбранному направлению" icon="alert" />
      </div>
    </div>
  </div>
  
  <div 
    v-else 
    class="text-center bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px] p-12 flex flex-col items-center justify-center"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.45)'
    }"
  >
    <EmptyState title="Выберите стратегический вектор" description="Инициализируйте новое намерение или выберите вектор в реестре слева" icon="target" />
  </div>
</template>

<script setup lang="ts">
import { 
  Target, 
  CheckSquare, 
  ShieldAlert, 
  GitBranch, 
  RotateCcw, 
  User, 
  Zap, 
  Activity, 
  Calendar,
  Sparkles,
  Check
} from 'lucide-vue-next';
import EmptyState from '../../../components/ui/EmptyState.vue';
import ProgressBar from '../../../components/ui/ProgressBar.vue';
import StatusBadge from '../../../components/ui/StatusBadge.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';
import ObjectiveRouteApproval from './ObjectiveRouteApproval.vue';

const props = defineProps<{
  selectedObj: any;
  safeSlice: (val: any, start: number, end?: number) => string;
  isRollingBack: boolean;
  uiStore: any;
  currentRouteMap: any;
  excludedNodes: string[];
  filterDecisionsForSelected: any[];
  getNodeCoords: (id: string) => { x: number; y: number } | null;
  pendingDraft?: any;
  isApprovingDraft?: boolean;
}>();

const formatDecisionTime = (ts: any) => {
  if (!ts) return '';
  try {
    if (typeof ts === 'number') {
      const d = new Date(ts);
      return !isNaN(d.getTime()) && typeof d.toLocaleTimeString === 'function' ? d.toLocaleTimeString() : '';
    }
    return props.safeSlice(ts, 11, 19);
  } catch {
    return '';
  }
};

defineEmits<{
  (e: 'rollbackCurrentObjective'): void;
  (e: 'approveRoute'): void;
  (e: 'modifyRoute'): void;
  (e: 'declineRoute'): void;
  (e: 'startDrag', event: MouseEvent, id: string): void;
  (e: 'onDragMove', event: MouseEvent): void;
  (e: 'stopDrag'): void;
  (e: 'toggleNodeExclusion', id: string): void;
  (e: 'updateOutcomeValue', id: string, val: any): void;
  (e: 'toggleRiskActive', risk: any): void;
  (e: 'decomposeObjective'): void;
  (e: 'approveDraft', id: string): void;
}>();
</script>
