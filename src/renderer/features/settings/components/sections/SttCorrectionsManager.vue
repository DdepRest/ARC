<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.store';
import { useVoice } from '../../../../composables/useVoice';
import { Plus, Trash2, ShieldAlert, Check, Sparkles } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const { postProcessTranscription } = useVoice();

const wrongWord = ref('');
const correctWord = ref('');
const errorMsg = ref('');
const showConfirmClear = ref(false);

const testInput = ref('');
const testResult = computed(() => {
  if (!testInput.value) return '';
  return postProcessTranscription(testInput.value);
});

const handleAddNew = () => {
  errorMsg.value = '';
  const ww = wrongWord.value.trim().toLowerCase();
  const cw = correctWord.value.trim();

  if (!ww) {
    errorMsg.value = 'Слово ошибки не может быть пустым';
    return;
  }
  if (!cw) {
    errorMsg.value = 'Исправленное слово не может быть пустым';
    return;
  }

  if (settingsStore.sttCorrections && settingsStore.sttCorrections[ww]) {
    errorMsg.value = `Пара для ошибки "${ww}" уже существует!`;
    return;
  }

  settingsStore.addSttCorrection(ww, cw);
  wrongWord.value = '';
  correctWord.value = '';
};

const handleRemove = (key: string) => {
  settingsStore.removeSttCorrection(key);
};

const confirmClearAll = () => {
  settingsStore.clearSttCorrections();
  showConfirmClear.value = false;
};
</script>

<template>
  <div 
    class="flex flex-col overflow-hidden rounded-[16px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-primary)]"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 10px 28px rgba(0, 0, 0, 0.60)'
    }"
  >
    <div 
      class="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--arc-hairline)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-2.5 flex-wrap">
        <span class="text-[13px] font-semibold text-[var(--arc-text-primary)] tracking-tight leading-[1.35]">
          Пользовательский словарь СТТ
        </span>
        <span class="text-xs text-[var(--arc-text-hint)] font-normal leading-[1.5]">
          · Постобработка и автозамена оговорок
        </span>
      </div>
    </div>

    <div class="p-4 sm:p-5 flex flex-col gap-4">
      <!-- Quick Form -->
      <div 
        class="flex flex-col gap-2.5 p-3.5 bg-[var(--arc-plane)] rounded-[12px] border border-[var(--arc-hairline)]"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
      >
      <span class="text-xs font-mono tracking-wider text-[var(--accent)] uppercase font-semibold">Добавить замену</span>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div class="flex flex-col gap-1">
          <input 
            v-model="wrongWord"
            type="text"
            placeholder="Слово с ошибкой (например: ютубе)"
            class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none focus:border-[var(--accent)]"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
            @keyup.enter="handleAddNew"
          />
        </div>
        <div class="flex items-center gap-1.5">
          <input 
            v-model="correctWord"
            type="text"
            placeholder="Исправление (например: ютуб)"
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none focus:border-[var(--accent)]"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
            @keyup.enter="handleAddNew"
          />
          <button 
            @click="handleAddNew"
            class="p-2 bg-[var(--arc-selected)] hover:bg-[var(--arc-hover)] text-[var(--accent)] rounded-[10px] border border-[rgba(var(--accent-rgb),0.4)] transition flex-shrink-0 cursor-pointer"
            title="Добавить в словарь"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>
      </div>
      <span v-if="errorMsg" class="text-xs font-mono text-[var(--status-err)] mt-0.5 select-none">{{ errorMsg }}</span>
    </div>

    <!-- Items List Table -->
    <div class="flex flex-col gap-2">
      <div class="flex justify-between items-center text-xs font-mono text-[var(--arc-text-muted)] px-1">
        <span>ТЕКУЩИЕ ПАРЫ (ВСЕГО: {{ Object.keys(settingsStore.sttCorrections || {}).length }})</span>
        <button 
          v-if="Object.keys(settingsStore.sttCorrections || {}).length > 0"
          @click="showConfirmClear = true"
          class="text-[var(--status-err)] hover:underline transition-colors uppercase font-mono cursor-pointer"
        >
          Очистить все
        </button>
      </div>

      <!-- Dictionary Items Grid -->
      <div 
        class="max-h-[160px] overflow-y-auto custom-scrollbar border border-[var(--arc-hairline)] rounded-[12px] bg-[var(--arc-plane)] divide-y divide-[var(--arc-hairline)]"
        :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.5)' }"
      >
        <div 
          v-if="!settingsStore.sttCorrections || Object.keys(settingsStore.sttCorrections).length === 0"
          class="p-4 text-center text-[var(--arc-text-muted)] text-xs font-mono select-none italic"
        >
          Нет замен. Добавьте свои варианты для улучшения распознавания.
        </div>
        <div 
          v-else
          v-for="[wrong, correct] in Object.entries(settingsStore.sttCorrections)" 
          :key="wrong"
          class="flex items-center justify-between p-2.5 px-3 hover:bg-[var(--arc-hover)] transition-colors"
        >
          <div class="flex items-center gap-2 text-xs font-mono truncate max-w-[85%]">
            <span class="text-[var(--status-err)] truncate">{{ wrong }}</span>
            <span class="text-[var(--arc-text-hint)] select-none">→</span>
            <span class="text-[var(--status-ok)] truncate">{{ correct }}</span>
          </div>
          <button 
            @click="handleRemove(wrong)"
            class="text-[var(--arc-text-muted)] hover:text-[var(--status-err)] p-1.5 hover:bg-[var(--arc-hover)] rounded-md transition shrink-0 cursor-pointer"
            title="Удалить"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Confirm Dialog Overlay (Inline) -->
    <div v-if="showConfirmClear" class="p-3.5 border border-[rgba(var(--status-err-rgb,239,68,68),0.3)] bg-[var(--arc-plane)] rounded-[12px] flex flex-col gap-2.5 animate-fadeIn">
      <div class="flex items-center gap-2">
        <ShieldAlert class="w-4 h-4 text-[var(--status-err)] flex-shrink-0" />
        <span class="text-xs font-mono text-[var(--status-err)] uppercase tracking-wider font-bold">Подтверждение очистки словаря</span>
      </div>
      <p class="text-xs text-[var(--arc-text-secondary)] leading-normal">Вы действительно хотите безвозвратно удалить все записи в словаре исправлений?</p>
      <div class="flex gap-2 justify-end">
        <button 
          @click="showConfirmClear = false" 
          class="px-3 py-1 text-xs font-mono text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] rounded-[8px] transition uppercase cursor-pointer"
        >
          Отмена
        </button>
        <button 
          @click="confirmClearAll" 
          class="px-3 py-1 text-xs font-mono text-[var(--status-err)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[rgba(var(--status-err-rgb,239,68,68),0.35)] rounded-[8px] transition uppercase flex items-center gap-1 cursor-pointer"
        >
          <Check class="w-3 h-3" />
          Полная очистка
        </button>
      </div>
    </div>

    <!-- Interactive Correction Validator -->
    <div 
      class="mt-2 p-3.5 bg-[var(--arc-plane)] border border-[rgba(var(--accent-rgb),0.3)] rounded-[12px] flex flex-col gap-2.5"
      :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)' }"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs font-mono tracking-wider text-[var(--accent)] uppercase font-bold flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Проверить сопоставление словаря</span>
        </span>
        <span class="text-xs font-mono text-[var(--arc-text-muted)] uppercase">Живой тест оговорок</span>
      </div>
      <div class="flex gap-2">
        <input 
          v-model="testInput"
          type="text"
          placeholder="Введите фразу с оговоркой (например: открый ютубе)"
          class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[10px] px-3 py-1.5 text-xs text-[var(--arc-text-primary)] placeholder-[var(--arc-text-hint)] focus:outline-none focus:border-[var(--accent)]"
          :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.6)' }"
        />
      </div>
      <div v-show="testInput" class="flex flex-col gap-1.5 p-2.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[10px] text-xs font-mono animate-fadeIn">
        <div class="flex items-center justify-between">
          <span class="text-xs text-[var(--arc-text-muted)] uppercase">Исходный текст:</span>
          <span class="text-[var(--arc-text-secondary)] truncate max-w-[70%]">{{ testInput }}</span>
        </div>
        <div class="h-px bg-[var(--arc-hairline)] my-1"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-[var(--accent)] uppercase">Оцифрованный ИИ:</span>
          <span class="text-[var(--status-ok)] font-bold truncate max-w-[70%] select-all">{{ testResult }}</span>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
