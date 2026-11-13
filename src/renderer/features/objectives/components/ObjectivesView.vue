<template>
  <div class="flex flex-col h-full w-full max-w-full p-4 md:p-8 z-10 overflow-y-auto custom-scrollbar gap-8 md:gap-10 bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">
    
    <!-- Header Navigation -->
    <ObjectivesHeaderNav 
      v-model:activeSection="activeSection"
      v-model:showCreateForm="showCreateForm"
      :hasDraftObjective="hasDraftObjective"
    />

    <!-- Active Section: GOALS VIEW -->
    <div v-if="activeSection === 'goals'" class="flex flex-col gap-8">
      <!-- Live Metrics Summary Row -->
      <ObjectivesMetricsRow 
        :totalObjectives="objectives.length"
        :completedCount="completedCount"
        :systemHealthIndex="systemHealthIndex"
        :avgProgress="avgProgress"
      />

      <!-- Create Intention Form -->
      <CreateObjectiveForm 
        :show="showCreateForm"
        @cancel="showCreateForm = false"
        @created="onObjectiveCreated"
      />

      <!-- Content Workspace Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <!-- LEFT COLUMN: Strategic Vector Rail / Objectives List (4 cols) -->
        <div class="lg:col-span-4 flex flex-col gap-6">
          <ObjectivesList 
            :objectives="objectives"
            :selectedObjId="selectedObjId"
            :safeSlice="safeSlice"
            @selectObjective="selectObjective"
            @createObjective="showCreateForm = true"
          />
        </div>

        <!-- RIGHT COLUMN: Execution Canvas / Detailed Objective Workspace (8 cols) -->
        <div class="lg:col-span-8 flex flex-col gap-6">
          <ObjectiveDetailsWorkspace 
            :selectedObj="selectedObj"
            :safeSlice="safeSlice"
            :isRollingBack="isRollingBack"
            :uiStore="uiStore"
            :currentRouteMap="currentRouteMap"
            :excludedNodes="excludedNodes"
            :filterDecisionsForSelected="filterDecisionsForSelected"
            :getNodeCoords="getNodeCoords"
            :pendingDraft="selectedObjId ? pendingDraftsByObjectiveId[selectedObjId] : undefined"
            :isApprovingDraft="isApprovingDraft"
            @approveDraft="approveDraft"
            @rollbackCurrentObjective="openRollbackDialog"
            @approveRoute="approveRoute"
            @modifyRoute="modifyRoute"
            @declineRoute="declineRoute"
            @startDrag="startDrag"
            @onDragMove="onDragMove"
            @stopDrag="stopDrag"
            @toggleNodeExclusion="toggleNodeExclusion"
            @updateOutcomeValue="updateOutcomeValue"
            @toggleRiskActive="toggleRiskActive"
            @decomposeObjective="decomposeObjective"
          />
        </div>
      </div>
    </div>

    <!-- Active Section: TOPOLOGY MAP VIEW -->
    <TopologySection 
      v-else-if="activeSection === 'topology'"
      :graphNodesScaled="graphNodesScaled"
      :graphLinksScaled="graphLinksScaled"
      :selectedObjId="selectedObjId"
      @selectObjective="onTopologySelectObjective"
    />

    <!-- Active Section: DIAGNOSTICS & SYSTEM ANALYSIS -->
    <DiagnosticsSection 
      v-else-if="activeSection === 'diagnostics'"
      :entropyState="entropyState"
      :entropyColorClass="entropyColorClass"
      :stabilityBadgeClass="stabilityBadgeClass"
      :coherenceHistory="coherenceHistory"
      :predictionNodes="predictionNodes"
      :safeSlice="safeSlice"
      @toggleAutoApprove="toggleAutoApprove"
    />

    <!-- Rollback Protocol Dialog (Action Sheet) -->
    <ObjectiveRollbackDialog
      :show="showRollbackDialog"
      :objectiveId="selectedObj?.id || ''"
      :objectiveTitle="selectedObj?.title || ''"
      :isRollingBack="isRollingBack"
      :progress="uiStore.rollbackProgress"
      :resultSummary="rollbackResult"
      @close="closeRollbackDialog"
      @confirm="confirmRollback"
    />

  </div>
</template>

<script setup lang="ts">
import ArcModal from '../../../components/ui/ArcModal.vue';
import ArcButton from '../../../components/ui/ArcButton.vue';
import { useObjectives } from '../composables/useObjectives';
import ObjectivesHeaderNav from './ObjectivesHeaderNav.vue';
import ObjectivesMetricsRow from './ObjectivesMetricsRow.vue';
import ObjectivesList from './ObjectivesList.vue';
import ObjectiveDetailsWorkspace from './ObjectiveDetailsWorkspace.vue';
import TopologySection from './TopologySection.vue';
import DiagnosticsSection from './DiagnosticsSection.vue';
import CreateObjectiveForm from './CreateObjectiveForm.vue';
import ObjectiveRollbackDialog from './ObjectiveRollbackDialog.vue';

const {
  uiStore,
  safeSlice,
  activeSection,
  objectives,
  predictionNodes,
  coherenceHistory,
  currentRouteMap,
  excludedNodes,
  selectedObjId,
  isRollingBack,
  showRollbackDialog,
  rollbackResult,
  hasDraftObjective,
  startDrag,
  onDragMove,
  stopDrag,
  getNodeCoords,
  entropyState,
  entropyColorClass,
  stabilityBadgeClass,
  toggleAutoApprove,
  showCreateForm,
  onObjectiveCreated,
  selectedObj,
  completedCount,
  avgProgress,
  systemHealthIndex,
  filterDecisionsForSelected,
  graphNodesScaled,
  graphLinksScaled,
  toggleNodeExclusion,
  approveRoute,
  modifyRoute,
  declineRoute,
  openRollbackDialog,
  closeRollbackDialog,
  confirmRollback,
  selectObjective,
  decomposeObjective,
  approveDraft,
  pendingDraftsByObjectiveId,
  isApprovingDraft,
  updateOutcomeValue,
  toggleRiskActive
} = useObjectives();

const onTopologySelectObjective = (id: string) => {
  selectObjective(id);
  activeSection.value = 'goals';
};
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
