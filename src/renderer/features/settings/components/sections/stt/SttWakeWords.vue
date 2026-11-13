<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { X } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const newWordInput = ref('');

const handleAddWord = () => {
  const word = newWordInput.value.trim();
  if (word) {
    settingsStore.addWakeWord(word);
    newWordInput.value = '';
  }
};

const handleRemoveWord = (index: number) => {
  settingsStore.removeWakeWord(index);
};
</script>

<template>
  <div 
    v-show="settingsStore.sttKeywordsEnabled" 
    class="p-4 sm:p-5 flex flex-col gap-3.5 bg-[var(--arc-plane)]/40" 
    data-search="ключевое слово wake word менеджер фразы активации"
  >
    <div class="flex items-center gap-3">
      <input 
        v-model="newWordInput"
        type="text"
        placeholder="Добавить кодовое слово..."
        class="flex-1 bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-lg px-3 py-2 text-xs text-[var(--arc-text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
        @keyup.enter="handleAddWord"
      />
      <button 
        type="button"
        @click="handleAddWord"
        class="px-4 py-2 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] text-xs font-mono font-semibold text-[var(--arc-text-primary)] rounded-lg transition cursor-pointer uppercase"
      >
        Добавить
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <div 
        v-for="(word, idx) in settingsStore.wakeWords" 
        :key="idx"
        class="flex items-center gap-2 bg-[var(--arc-block)] border border-[var(--arc-hairline)] px-3 py-1 rounded-lg text-xs font-mono text-[var(--arc-text-primary)]"
      >
        <span>{{ word }}</span>
        <button 
          type="button" 
          @click="handleRemoveWord(idx)" 
          class="hover:text-[var(--status-err)] text-[var(--arc-text-muted)] transition cursor-pointer" 
          title="Удалить фразу"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
