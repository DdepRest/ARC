<template>
  <Teleport to="body">
    <div 
      v-if="modelValue"
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100000] font-sans pointer-events-auto"
      @mousedown.self="$emit('update:modelValue', false)"
    >
      <div class="border border-[var(--arc-hairline)] rounded-2xl w-full max-w-xl p-5 overflow-hidden shadow-2xl relative bg-[var(--arc-block)]">
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 mb-4 border-b border-[var(--arc-hairline)]">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-[var(--arc-plane)] border border-[var(--arc-hairline)] flex items-center justify-center text-white/80">
              <Gauge class="w-4 h-4" />
            </div>
            <div>
              <h3 class="font-bold text-sm text-white tracking-wide">
                {{ isRu ? 'Аудит производительности WebGL' : 'WebGL Performance Audit' }}
              </h3>
              <p class="text-[11px] font-mono text-[var(--arc-text-hint)]">
                A.R.C. ENGINE · РЕАЛЬНАЯ КАДРОВАЯ ЧАСТОТА
              </p>
            </div>
          </div>
          <button 
            type="button"
            @click="$emit('update:modelValue', false)"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-[var(--arc-hover)] transition cursor-pointer"
            title="Закрыть"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Hardware & WebGL Info -->
        <div class="space-y-3 font-mono text-xs">
          <div class="p-3 rounded-xl bg-[var(--arc-plane)] border border-[var(--arc-hairline)] space-y-1.5">
            <div class="text-[10px] text-[var(--arc-text-hint)] uppercase tracking-wider font-semibold">
              ГРАФИЧЕСКИЙ УСКОРИТЕЛЬ (GPU)
            </div>
            <div class="flex items-center justify-between text-white/90">
              <span class="text-[var(--arc-text-hint)]">РЕНДЕРЕР:</span>
              <span class="text-right truncate max-w-[320px]">{{ gpuInfo.renderer }}</span>
            </div>
            <div class="flex items-center justify-between text-white/90">
              <span class="text-[var(--arc-text-hint)]">ВЕНДОР:</span>
              <span>{{ gpuInfo.vendor }}</span>
            </div>
            <div class="flex items-center justify-between text-white/90">
              <span class="text-[var(--arc-text-hint)]">ВЕРСИЯ:</span>
              <span>{{ gpuInfo.webglVersion }}</span>
            </div>
            <div class="flex items-center justify-between text-white/90">
              <span class="text-[var(--arc-text-hint)]">УСКОРЕНИЕ:</span>
              <span :class="gpuInfo.isHardwareAccelerated ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">
                {{ gpuInfo.isHardwareAccelerated ? 'Аппаратное (HW)' : 'Программное (SW)' }}
              </span>
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="p-3 rounded-xl bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
            <div class="text-[10px] text-[var(--arc-text-hint)] uppercase tracking-wider font-semibold mb-2">
              ПРОФИЛИ НАГРУЗКИ
            </div>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                @click="$emit('apply-preset', 'eco')"
                class="px-2.5 py-1.5 rounded-lg bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-white/80 hover:text-white text-[11px] font-sans font-medium transition cursor-pointer"
              >
                Эко (30 FPS)
              </button>
              <button
                type="button"
                @click="$emit('apply-preset', 'balanced')"
                class="px-2.5 py-1.5 rounded-lg bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-white/80 hover:text-white text-[11px] font-sans font-medium transition cursor-pointer"
              >
                Баланс (60 FPS)
              </button>
              <button
                type="button"
                @click="$emit('apply-preset', 'ultra')"
                class="px-2.5 py-1.5 rounded-lg bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-white/80 hover:text-white text-[11px] font-sans font-medium transition cursor-pointer"
              >
                Ультра (Макс)
              </button>
            </div>
          </div>

          <!-- КОНВЕЙЕР РЕНДЕРИНГА Three.js -->
          <div class="flex flex-col gap-2 p-3 rounded-xl bg-[var(--arc-plane)] border border-[var(--arc-hairline)]">
            <div class="text-[10px] text-[var(--arc-text-hint)] uppercase tracking-wider font-semibold">
              {{ isRu ? 'Конвейер рендеринга Three.js' : 'Three.js Render Pipeline' }}
            </div>

            <!-- Draw Calls + DPR + GPU Load в 3 колонки -->
            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col p-2 rounded-lg bg-[var(--arc-block)] border border-[var(--arc-hairline)]">
                <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">Draw Calls</span>
                <span class="text-[13px] font-semibold text-white font-mono">{{ uiStore.profilerStats.drawCalls }}</span>
              </div>
              <div class="flex flex-col p-2 rounded-lg bg-[var(--arc-block)] border border-[var(--arc-hairline)]">
                <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">DPR</span>
                <span class="text-[13px] font-semibold text-white font-mono">{{ uiStore.profilerStats.dpr }}x</span>
              </div>
              <div class="flex flex-col p-2 rounded-lg bg-[var(--arc-block)] border border-[var(--arc-hairline)]">
                <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">GPU Load</span>
                <span class="text-[13px] font-semibold text-white font-mono">{{ uiStore.profilerStats.gpuLoad }}%</span>
              </div>
            </div>

            <!-- Селектор качества графики -->
            <div class="flex items-center justify-between gap-3 pt-2 border-t border-[var(--arc-hairline)]">
              <span class="text-[10px] uppercase text-[var(--arc-text-hint)] font-semibold">
                {{ isRu ? 'Качество графики' : 'Graphics Quality' }}
              </span>
              <div class="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg border border-white/5">
                <button
                  v-for="q in [{k: 'Low' as const, l: isRu ? 'НИЗКОЕ' : 'LOW'}, {k: 'Medium' as const, l: isRu ? 'СРЕДНЕЕ' : 'MEDIUM'}, {k: 'High' as const, l: isRu ? 'ВЫСОКОЕ' : 'HIGH'}]"
                  :key="q.k"
                  type="button"
                  @click="settingsStore.graphicsQuality = q.k"
                  :class="settingsStore.graphicsQuality === q.k ? 'bg-[var(--accent)]/20 text-[var(--accent)] font-semibold' : 'text-[var(--arc-text-muted)] hover:text-white'"
                  class="px-2 py-0.5 text-[10px] rounded transition cursor-pointer"
                >
                  {{ q.l }}
                </button>
              </div>
            </div>

            <!-- Кнопка очистки кэша рендера -->
            <div class="flex justify-end pt-2 border-t border-[var(--arc-hairline)]">
              <button
                type="button"
                @click="purgeRenderCache"
                :disabled="cachePurged"
                class="px-3 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition cursor-pointer"
                :class="cachePurged ? 'bg-[var(--status-ok)]/15 text-[var(--status-ok)] border border-[var(--status-ok)]/30 cursor-default' : 'bg-[var(--arc-hover)] text-white/60 hover:text-white border border-white/10'"
              >
                {{ cachePurged ? (isRu ? 'ОЧИЩЕНО' : 'CLEARED') : (isRu ? 'СБРОСИТЬ КЭШ РЕНДЕРА' : 'PURGE RENDER CACHE') }}
              </button>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="flex items-center justify-between pt-2">
            <button
              type="button"
              @click="$emit('export-csv')"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-white/70 hover:text-white text-xs transition cursor-pointer"
            >
              <Download class="w-3.5 h-3.5" />
              <span>Экспорт CSV</span>
            </button>
            <button
              type="button"
              @click="$emit('reset-stats')"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-white/70 hover:text-white text-xs transition cursor-pointer"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>Сбросить метрики</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Gauge, X, Download, RotateCcw } from 'lucide-vue-next';
import { useUIStore } from '../../stores/ui.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const cachePurged = ref(false);

function purgeRenderCache() {
  try {
    window.dispatchEvent(new Event('arc_purge_render_cache'));
    cachePurged.value = true;
    setTimeout(() => { cachePurged.value = false; }, 2000);
  } catch {}
}

defineProps<{
  modelValue: boolean;
  isRu: boolean;
  gpuInfo: {
    renderer: string;
    vendor: string;
    webglVersion: string;
    isHardwareAccelerated: boolean;
  };
}>();

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'apply-preset', preset: 'eco' | 'balanced' | 'ultra'): void;
  (e: 'export-csv'): void;
  (e: 'reset-stats'): void;
}>();
</script>
