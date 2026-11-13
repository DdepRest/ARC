<template>
  <div v-if="isOpen" class="fixed inset-0 z-[50000] bg-[var(--arc-frame)] flex flex-col animate-in fade-in duration-300">
    <!-- Top Bar -->
    <MacroEditorHeader 
      :editingMacroId="editingMacroId"
      v-model:macroName="macroName"
      v-model:macroDesc="macroDesc"
      :isRunning="isRunning"
      @close="handleClose"
      @save="handleSave"
      @run="handleRun"
    />

    <div class="flex-1 flex overflow-hidden">
      <!-- Node Palette -->
      <MacroPalette 
        :nodeGroups="nodeGroups"
        @dragStart="handleDragStart"
        @addNode="addNodeToCanvas"
      />

      <!-- Main Canvas -->
      <main ref="mainRef" class="flex-1 relative bg-[var(--arc-frame)]">
        <canvas id="macro-canvas" tabindex="0" class="w-full h-full block touch-none focus:outline-none" @mousedown="focusCanvas"></canvas>

        <!-- Empty State HUD / Templates Overlay -->
        <div v-if="nodeCount === 0" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center z-10 select-none">
          <div 
            class="max-w-xl bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[18px] p-8 pointer-events-auto flex flex-col items-center transition duration-300"
            :style="{
              background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 60px rgba(0, 0, 0, 0.7)'
            }"
          >
            <div 
              class="w-12 h-12 rounded-[14px] bg-[var(--arc-plane)] border border-[rgba(var(--accent-rgb),0.35)] flex items-center justify-center mb-4 text-[var(--accent)]"
              :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
            >
              <Sparkles class="w-6 h-6 animate-pulse" />
            </div>
            <h3 class="font-mono font-bold text-sm text-[var(--arc-text-primary)] uppercase tracking-[0.16em] mb-2">Лаборатория макросов</h3>
            <p class="font-sans text-xs text-[var(--arc-text-secondary)] max-w-sm mb-6 leading-relaxed">
              Этот сценарий пока пуст. Выберите готовый шаблон быстрого старта ниже или начните перетаскивать блоки из левой палитры:
            </p>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
              <button 
                v-for="tpl in templates" 
                :key="tpl.name"
                @click="loadTemplate(tpl.data)"
                class="p-4 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] hover:border-[rgba(var(--accent-rgb),0.45)] rounded-[14px] text-left transition duration-200 group active:scale-[0.98] cursor-pointer pointer-events-auto"
                :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
              >
                <div class="flex items-center gap-2 mb-2">
                  <div class="p-1.5 rounded-[8px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] group-hover:text-[var(--arc-text-primary)] transition-colors">
                    <component :is="getIcon(tpl.icon)" class="w-3.5 h-3.5" />
                  </div>
                  <span class="text-xs font-sans font-bold text-[var(--arc-text-primary)] transition-colors">{{ tpl.name }}</span>
                </div>
                <p class="text-xs font-sans text-[var(--arc-text-muted)] leading-normal group-hover:text-[var(--arc-text-secondary)] transition-colors">{{ tpl.desc }}</p>
              </button>
            </div>
          </div>
        </div>
      </main>

      <!-- Properties Panel -->
      <MacroPropertiesPanel 
        :selectedNode="selectedNode"
        :getPropLabel="getPropLabel"
        :getAccentColorForNode="getAccentColorForNode"
        @closeProperties="selectedNode = null"
        @updateProperty="updateNodeProperty"
        @deleteNode="deleteSelectedNode"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Sparkles, MessageSquare, Clock, Cpu, Play, Globe, Terminal, Folder, Music, Command } from 'lucide-vue-next';
import { useMacroEditor } from '../composables/useMacroEditor';
import MacroEditorHeader from './MacroEditorHeader.vue';
import MacroPalette from './MacroPalette.vue';
import MacroPropertiesPanel from './MacroPropertiesPanel.vue';

const {
  isOpen,
  editingMacroId,
  macroName,
  macroDesc,
  nodeCount,
  templates,
  loadTemplate,
  selectedNode,
  mainRef,
  isRunning,
  nodeGroups,
  focusCanvas,
  getPropLabel,
  handleRun,
  handleDragStart,
  addNodeToCanvas,
  updateNodeProperty,
  deleteSelectedNode,
  handleSave,
  handleClose,
  getAccentColorForNode
} = useMacroEditor();

const getIcon = (name: string) => {
  const map: Record<string, any> = { Globe, Folder, Music, Play, Terminal, MessageSquare, Sparkles, Clock, Cpu };
  return map[name] || Command;
};
</script>

<style>
.litegraph.lgraphcanvas {
    background-color: transparent !important;
}

.litecontextmenu {
    background-color: var(--arc-block) !important;
    border: 1px solid var(--arc-hairline) !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
    border-radius: 10px !important;
    padding: 4px 0 !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    min-width: 160px !important;
    z-index: 99999 !important;
}

.litecontextmenu .litemenu-entry {
    color: var(--arc-text-secondary) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    padding: 6px 12px !important;
    margin: 2px 4px !important;
    border-radius: 6px !important;
    background-color: transparent !important;
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.litecontextmenu .litemenu-entry.hover,
.litecontextmenu .litemenu-entry:hover {
    color: var(--arc-text-primary) !important;
    background-color: var(--arc-selected) !important;
}

.litecontextmenu .litemenu-entry.submenu {
    position: relative;
}

.litecontextmenu .litemenu-title {
    color: var(--arc-text-muted) !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    letter-spacing: 0.05em !important;
    text-transform: uppercase !important;
    padding: 6px 12px 4px 12px !important;
    border-bottom: 1px solid var(--arc-hairline) !important;
    margin-bottom: 4px !important;
}
</style>
