<template>
  <aside 
    v-if="selectedNode" 
    @keydown.stop 
    @keyup.stop 
    class="w-72 border-l border-[var(--arc-hairline)] flex flex-col bg-[var(--arc-plane)] animate-in slide-in-from-right duration-200"
  >
    <div 
      class="p-4 border-b border-[var(--arc-hairline)] flex items-center justify-between bg-[var(--arc-block)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full shadow-lg" :style="{ backgroundColor: getAccentColorForNode(selectedNode), boxShadow: `0 0 8px ${getAccentColorForNode(selectedNode)}` }"></span>
        <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-[var(--arc-text-secondary)]">
          Свойства: {{ selectedNode.constructor.title || selectedNode.type }}
        </h3>
      </div>
      <button @click="$emit('closeProperties')" class="text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] p-1 rounded-[6px] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
    
    <div class="p-5 flex-1 space-y-5 overflow-y-auto custom-scrollbar">
      <div class="space-y-4">
        <div v-for="(prop, key) in selectedNode.properties" :key="key">
          <label class="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--arc-text-muted)] mb-1.5">
            {{ getPropLabel(String(key)) }}
          </label>

          <textarea 
            v-if="key === 'phrases'" 
            v-model="selectedNode.properties[key]"
            @input="$emit('updateProperty')"
            rows="4"
            placeholder="открой ютуб&#10;включи музыку..."
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs font-sans text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none transition resize-y custom-scrollbar"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
          ></textarea>

          <input 
            v-else-if="typeof prop === 'string'" 
            type="text" 
            v-model="selectedNode.properties[key]" 
            @input="$emit('updateProperty')"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs font-sans text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none transition" 
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
          />

          <input 
            v-else-if="typeof prop === 'number'" 
            type="number" 
            v-model.number="selectedNode.properties[key]" 
            @input="$emit('updateProperty')"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs font-sans text-[var(--arc-text-primary)] focus:border-[var(--accent)] outline-none transition" 
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
          />

          <div v-else-if="typeof prop === 'boolean'" class="flex items-center gap-2 mt-1">
            <input 
              type="checkbox" 
              v-model="selectedNode.properties[key]" 
              @change="$emit('updateProperty')"
              class="rounded bg-[var(--arc-input)] border-[var(--arc-hairline)] accent-[var(--accent)] h-4 w-4 cursor-pointer" 
            />
            <span class="text-xs text-[var(--arc-text-secondary)] font-sans">Включено</span>
          </div>

          <select 
            v-else-if="Array.isArray(prop)" 
            v-model="selectedNode.properties[key]"
            @change="$emit('updateProperty')"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-2 text-xs font-sans text-[var(--arc-text-primary)] outline-none focus:border-[var(--accent)] transition"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
          >
            <option v-for="opt in prop" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
      </div>
      
      <div class="pt-4 border-t border-[var(--arc-hairline)] flex flex-col gap-2">
        <span class="text-xs font-sans text-[var(--arc-text-hint)] italic text-center">
          💡 Блок можно также удалить, выбрав его на холсте и нажав Delete или Backspace
        </span>
      </div>
    </div>

    <div class="p-4 border-t border-[var(--arc-hairline)] bg-[var(--arc-block)]">
      <button 
        @click="$emit('deleteNode')" 
        class="w-full py-2 bg-[var(--arc-plane)] hover:bg-[var(--status-err)] border border-[rgba(var(--status-err-rgb,239,68,68),0.3)] hover:border-[var(--status-err)] text-[var(--status-err)] hover:text-white transition duration-200 text-xs font-mono font-semibold rounded-[10px] flex items-center justify-center gap-2 cursor-pointer"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
      >
        <Trash2 class="w-3.5 h-3.5" />
        <span>Удалить блок</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { X, Trash2 } from 'lucide-vue-next';

defineProps<{
  selectedNode: any;
  getPropLabel: (key: string) => string;
  getAccentColorForNode: (node: any) => string;
}>();

defineEmits<{
  (e: 'closeProperties'): void;
  (e: 'updateProperty'): void;
  (e: 'deleteNode'): void;
}>();
</script>
