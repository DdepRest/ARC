<template>
  <div class="h-full flex flex-col relative z-10 w-full bg-[var(--arc-plane)] text-[var(--arc-text-primary)] select-none">
    <!-- Header -->
    <header 
      class="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 border-b border-[var(--arc-hairline)] shrink-0 gap-4 bg-[var(--arc-plane)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5 min-w-[200px]">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="commands-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] flex items-center justify-center p-2 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)]"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Command class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <h1 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            Система команд
          </h1>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate">Голосовые навыки, макросы и быстрый запуск приложений</p>
        </div>
      </div>
      
      <!-- Sub-tabs: 12px/600/UPPER/mono/tracking .10em, active 2px bottom bar -->
      <div role="tablist" class="flex items-center gap-6">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          role="tab"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
          class="relative pb-2 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus-visible:outline-none"
          :class="[
            activeTab === tab.id 
              ? 'text-[var(--arc-text-primary)]' 
              : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'
          ]"
        >
          {{ tab.label }}
          <div 
            v-if="activeTab === tab.id" 
            class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"
          ></div>
        </button>
      </div>
    </header>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden relative">
      <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-4 sm:p-8">
        <!-- НАВЫКИ И МАКРОСЫ -->
        <SkillsTab 
          v-if="activeTab === 'skills'"
          :settingsStore="settingsStore"
          :skillsStore="skillsStore"
          :macrosStore="macrosStore"
          v-model:searchQuery="searchQuery"
          v-model:activeCmdId="activeCmdId"
          v-model:openMenuCmdId="openMenuCmdId"
          v-model:newTrigger="newTrigger"
          :filteredMacros="filteredMacros"
          :filteredSkills="filteredSkills"
          :macroPendingDeleteId="macroPendingDeleteId"
          @triggerImport="triggerImport"
          @handleImportMacro="handleImportMacro"
          @exportAllMacros="exportAllMacros"
          @exportMacro="exportMacro"
          @cloneMacro="cloneMacro"
          @requestDeleteMacro="requestDeleteMacro"
          @handleAddTrigger="handleAddTrigger"
        />

        <!-- ЛАУНЧЕР -->
        <LauncherTab 
          v-if="activeTab === 'launcher'"
          :settingsStore="settingsStore"
          :launcherStore="launcherStore"
          :folders="folders"
          :indexing="indexing"
        />
      </div>
    </div>

    <!-- Floating Undo Notification -->
    <UndoDeleteToast 
      :lastDeletedMacro="lastDeletedMacro"
      @undoDelete="undoDelete"
      @finalizeDelete="finalizeDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { Command, ArrowLeft } from 'lucide-vue-next';
import { useCommandsView } from '../composables/useCommandsView';
import { useUIStore } from '../../../stores/ui.store';
import SkillsTab from './commandsView/SkillsTab.vue';
import LauncherTab from './commandsView/LauncherTab.vue';
import UndoDeleteToast from './commandsView/UndoDeleteToast.vue';

const uiStore = useUIStore();

const {
  settingsStore,
  skillsStore,
  launcherStore,
  macrosStore,
  folders,
  indexing,
  tabs,
  activeTab,
  activeCmdId,
  openMenuCmdId,
  newTrigger,
  searchQuery,
  macroPendingDeleteId,
  lastDeletedMacro,
  filteredMacros,
  filteredSkills,
  requestDeleteMacro,
  undoDelete,
  finalizeDelete,
  cloneMacro,
  exportMacro,
  exportAllMacros,
  triggerImport,
  handleImportMacro,
  handleAddTrigger
} = useCommandsView();
</script>
