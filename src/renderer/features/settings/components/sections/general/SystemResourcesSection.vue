<template>
  <section id="section-system" class="scroll-mt-14">
    <SettingsSectionHeader 
      :icon="Cpu" 
      title="Система" 
      :is-collapsed="collapsed.isCollapsed('section-system')"
      @toggle="collapsed.toggleCollapsed('section-system')"
    />
    <div v-show="!collapsed.isCollapsed('section-system')" class="flex flex-col gap-4 pt-1">
      <!-- Performance & Runtime Deck (2 Columns) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <!-- Col 1: Eco Mode + Background Runtime -->
        <div class="flex flex-col justify-between gap-4 p-4 rounded-[14px] bg-[var(--arc-block)] border border-white/[0.06]">
          <!-- Eco Mode -->
          <div class="flex flex-col gap-2" data-search="эко-режим eco mode энергосбережение fps простой">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-white/90">Эко-режим (Тихий простой)</span>
              <span class="text-[10px] font-mono text-white/50 uppercase">{{ store.ecoMode }}</span>
            </div>
            <div class="flex gap-1.5 bg-black/30 p-1 rounded-lg border border-white/5 w-fit">
              <button 
                @click="store.ecoMode = 'auto'"
                :class="['px-3 py-1 text-[10px] font-mono font-bold rounded transition cursor-pointer', store.ecoMode === 'auto' ? 'bg-[var(--accent-color,#ef4444)] text-white shadow-sm' : 'text-white/40 hover:text-white/70']"
              >
                АВТО
              </button>
              <button 
                @click="store.ecoMode = 'always'"
                :class="['px-3 py-1 text-[10px] font-mono font-bold rounded transition cursor-pointer', store.ecoMode === 'always' ? 'bg-[var(--accent-color,#ef4444)] text-white shadow-sm' : 'text-white/40 hover:text-white/70']"
              >
                ВСЕГДА
              </button>
              <button 
                @click="store.ecoMode = 'off'"
                :class="['px-3 py-1 text-[10px] font-mono font-bold rounded transition cursor-pointer', store.ecoMode === 'off' ? 'bg-[var(--accent-color,#ef4444)] text-white shadow-sm' : 'text-white/40 hover:text-white/70']"
              >
                ВЫКЛ
              </button>
            </div>
            <span class="text-[10px] text-white/40 leading-snug">
              Снижает частоту рендеринга и нагрузку на GPU при неактивности.
            </span>
          </div>

          <!-- Run In Background -->
          <div class="flex items-center justify-between gap-3 pt-3 border-t border-white/5" data-search="работа в фоне run in background фоновый режим">
            <div class="flex flex-col pr-2">
              <span class="text-xs font-medium text-white/90">Работа в фоне</span>
              <span class="text-[10px] text-white/40 mt-0.5 leading-snug">
                Сворачивание в системный трей вместо закрытия.
              </span>
            </div>
            <ArcToggle v-model="store.runInBackground" class="shrink-0" />
          </div>
        </div>

        <!-- Col 2: Graphics Quality + Auto FPS Adjust -->
        <div class="flex flex-col justify-between gap-4 p-4 rounded-[14px] bg-[var(--arc-block)] border border-white/[0.06]">
          <!-- Graphics Quality Slider -->
          <div class="flex flex-col gap-2" data-setting-id="quick.graphics" data-search="качество графики graphics quality производительность performance">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-white/90">Качество графики WebGL</span>
              <span class="text-[10px] font-mono font-bold text-[var(--accent-text,#f87171)]">
                {{ graphicsQualityValue === 1 ? 'LOW' : graphicsQualityValue === 2 ? 'MEDIUM' : 'HIGH' }}
              </span>
            </div>
            <ArcSlider 
              v-model="graphicsQualityValue"
              :min="1" 
              :max="3" 
              :step="1"
              :show-value="false"
            />
            <div class="flex justify-between text-[9px] font-mono text-white/30 px-1">
              <span :class="graphicsQualityValue === 1 ? 'text-[var(--accent-text,#f87171)] font-bold' : ''">НИЗКОЕ</span>
              <span :class="graphicsQualityValue === 2 ? 'text-[var(--accent-text,#f87171)] font-bold' : ''">СРЕДНЕЕ</span>
              <span :class="graphicsQualityValue === 3 ? 'text-[var(--accent-text,#f87171)] font-bold' : ''">ВЫСОКОЕ</span>
            </div>
            <span class="text-[10px] text-white/40 leading-snug">
              Разрешение и шейдерные эффекты 3D-сцены.
            </span>
          </div>

          <!-- Auto Adjust Graphics -->
          <div class="flex items-center justify-between gap-3 pt-3 border-t border-white/5" data-search="автоматическое переключение графики auto adjust graphics fps">
            <div class="flex flex-col pr-2">
              <span class="text-xs font-medium text-white/90">Автоадаптация FPS</span>
              <span class="text-[10px] text-white/40 mt-0.5 leading-snug">
                Динамическое снижение качества при просадке кадров.
              </span>
            </div>
            <ArcToggle v-model="store.autoAdjustGraphics" class="shrink-0" />
          </div>
        </div>
      </div>

      <!-- Storage & Maintenance Action Grid (3 Columns) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Storage data/ folder -->
        <div class="flex flex-col justify-between gap-3 p-3.5 rounded-[14px] bg-[var(--arc-block)] border border-white/[0.06] hover:border-cyan-500/20 transition group" data-search="папка данных хранилище data файлы директория портативный portable">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <FolderOpen class="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span class="text-xs font-medium text-white/90 group-hover:text-cyan-400 transition-colors">Папка data/</span>
            </div>
            <span class="text-[10px] text-white/40 leading-snug">
              Изолированные БД, кэши, сессии и модели.
            </span>
          </div>
          <button 
            @click="openDataDir"
            class="w-full py-1.5 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 active:bg-cyan-500/30 border border-cyan-500/20 rounded-lg text-xs font-medium text-cyan-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Открыть папку</span>
          </button>
        </div>

        <!-- CSP Security Logs -->
        <div class="flex flex-col justify-between gap-3 p-3.5 rounded-[14px] bg-[var(--arc-block)] border border-white/[0.06] hover:border-amber-500/20 transition group" data-search="csp violations безопасность логи отчёт">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <Shield class="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span class="text-xs font-medium text-white/90 group-hover:text-amber-400 transition-colors">Отчёт CSP</span>
            </div>
            <span class="text-[10px] text-white/40 leading-snug">
              Журнал блокировок контента и безопасности.
            </span>
          </div>
          <button 
            @click="openCspLogs"
            class="w-full py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 border border-amber-500/20 rounded-lg text-xs font-medium text-amber-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Открыть лог</span>
          </button>
        </div>

        <!-- System Reset -->
        <div class="flex flex-col justify-between gap-3 p-3.5 rounded-[14px] bg-[var(--arc-block)] border border-white/[0.06] hover:border-rose-500/20 transition group" data-search="сброс системы очистить память удалить настройки reset">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <RotateCcw class="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span class="text-xs font-medium text-white/90 group-hover:text-rose-400 transition-colors">Сброс системы</span>
            </div>
            <span class="text-[10px] text-white/40 leading-snug">
              Очистка всех баз и настроек с перезапуском.
            </span>
          </div>
          <button 
            @click="showResetModal = true"
            class="w-full py-1.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 border border-rose-500/20 rounded-lg text-xs font-medium text-rose-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Сброс данных...</span>
          </button>
        </div>
      </div>
    </div>

    <!-- System Reset Confirmation Modal -->
    <ArcModal 
      :show="showResetModal" 
      title="Сброс системы и очистка данных" 
      subtitle="Внимание: действие удалит данные и перезапустит A.R.C."
      max-width="max-w-md"
      @close="!isResetting && (showResetModal = false)"
    >
      <div class="space-y-4 text-xs text-zinc-300 font-sans">
        <div class="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div class="space-y-1">
            <span class="font-semibold text-rose-300 block">Необратимое удаление</span>
            <p class="text-zinc-400 leading-relaxed">
              Все файлы диалогов, база данных, факты долговременной памяти, задачи, настройки провайдеров и временные профили из %APPDATA%/a.r.c будут удалены.
            </p>
          </div>
        </div>

        <div class="space-y-2 py-1">
          <div class="text-[11px] text-zinc-400">Будет очищено (Вариант A):</div>
          <ul class="space-y-1 text-zinc-300 font-mono text-[11px] list-disc list-inside">
            <li>База SQLite (database/, arc.db*: диалоги, задачи, память, цели)</li>
            <li>Конфигурации и макросы (config/, macros/, arc-performance-settings.json)</li>
            <li>Временные кэши и сессии Chromium</li>
            <li>Устаревшие профили %APPDATA%/a.r.c (если не пересекаются с каталогом данных)</li>
          </ul>
          <div class="text-[11px] text-zinc-400 pt-1">Сохраняется без изменений:</div>
          <ul class="space-y-1 text-zinc-400 font-mono text-[11px] list-disc list-inside">
            <li>Secret Vault (secrets.json — API-ключи DPAPI)</li>
            <li>Логи (logs/, csp-violations.log), бэкапы (backups/), словари и политика TTS</li>
          </ul>
        </div>

        <label class="flex items-center gap-2.5 p-2.5 bg-black/20 hover:bg-black/30 border border-white/5 rounded-xl cursor-pointer select-none transition-colors">
          <ArcCheckbox v-model="clearModelsAlso" :disabled="isResetting" />
          <span class="text-zinc-300 text-[11px]">
            Удалить также скачанные локальные нейросети (GGUF-модели)
          </span>
        </label>
      </div>

      <template #footer>
        <button 
          type="button"
          :disabled="isResetting"
          @click="showResetModal = false"
          class="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors"
        >
          Отмена
        </button>
        <button 
          type="button"
          :disabled="isResetting"
          @click="handleSystemReset"
          class="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-medium transition shadow-[0_0_12px_rgba(225,29,72,0.4)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RotateCcw class="w-3.5 h-3.5" :class="isResetting ? 'animate-spin' : ''" />
          <span>{{ isResetting ? 'Сброс...' : 'Стереть всё и перезапустить' }}</span>
        </button>
      </template>
    </ArcModal>
  </section>
</template>


<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useCollapsedSections } from '../../../composables/useCollapsedSections';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import ArcSlider from '../../../../../components/ui/ArcSlider.vue';
import ArcModal from '../../../../../components/ui/ArcModal.vue';
import ArcCheckbox from '../../../../../components/ui/ArcCheckbox.vue';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import { Cpu, FolderOpen, RotateCcw, AlertTriangle, Shield } from 'lucide-vue-next';

const store = useSettingsStore();
const collapsed = useCollapsedSections();
const showResetModal = ref(false);
const clearModelsAlso = ref(false);
const isResetting = ref(false);

const openCspLogs = async () => { 
  if ((window as any).api?.openFile && (window as any).api?.getUserDataPath) { 
    const path = await (window as any).api.getUserDataPath(); 
    (window as any).api.openFile(path + '/csp-violations.log'); 
  } 
};

const openDataDir = async () => {
  if ((window as any).api?.openDataFolder) {
    await (window as any).api.openDataFolder();
  }
};

const handleSystemReset = async () => {
  if (isResetting.value) return;
  isResetting.value = true;
  try {
    if ((window as any).api?.resetSystem) {
      await (window as any).api.resetSystem({ clearModels: clearModelsAlso.value });
    }
  } catch (err) {
    console.error('Failed to reset system:', err);
    isResetting.value = false;
  }
};

const graphicsQualityValue = computed({
  get: () => store.graphicsQuality === 'Low' ? 1 : (store.graphicsQuality === 'Medium' ? 2 : 3),
  set: (val: number) => {
    store.graphicsQuality = val === 1 ? 'Low' : (val === 2 ? 'Medium' : 'High');
  }
});
</script>
