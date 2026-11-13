<script setup lang="ts">
import { computed } from 'vue';
import { useModelDownloadStore } from '../../features/modelDownload/stores/modelDownload.store';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Minus, 
  Maximize2, 
  X
} from 'lucide-vue-next';

const downloadStore = useModelDownloadStore();

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const isVisible = computed(() => {
  return downloadStore.hasActiveNotification;
});
</script>

<template>
  <Transition name="hud-dock">
    <div 
      v-if="isVisible" 
      id="arc-download-notification-dock"
      class="fixed bottom-28 right-6 z-[9990] pointer-events-auto select-none font-mono"
    >
      <!-- Collapsed Mini HUD Capsule -->
      <div 
        v-if="downloadStore.isCollapsed"
        id="btn-expand-download-dock"
        @click="downloadStore.expand()"
        class="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[var(--arc-popover)] border border-[var(--arc-hairline)] shadow-[0_12px_32px_rgba(0,0,0,0.85)] cursor-pointer hover:border-[var(--arc-border-focus,var(--arc-hairline))] hover:bg-[var(--arc-hover)] transition-all group active:scale-95 text-xs tracking-wider"
        :style="{ backgroundImage: 'var(--arc-sheen)' }"
        title="Нажмите, чтобы развернуть телеметрию"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0 shadow-[0_0_8px_var(--accent)]"></span>
        <span class="text-[var(--arc-text-muted)] uppercase tracking-widest text-xs">NET:</span>
        <span class="text-[var(--arc-text-primary)] font-medium max-w-[120px] truncate uppercase text-xs">
          {{ downloadStore.currentFilename || downloadStore.loadingModelName || 'TELEMETRY' }}
        </span>
        <span v-if="downloadStore.isHfCooldown" class="text-[var(--status-warn)] font-bold animate-pulse tabular-nums">
          429: {{ downloadStore.hfCooldownSeconds }}s
        </span>
        <span v-else-if="downloadStore.isDownloading" class="text-[var(--arc-text-primary)] font-bold tabular-nums">
          {{ downloadStore.progressPercent }}%
        </span>
        <span v-if="downloadStore.isDownloading && downloadStore.downloadSpeedBps > 0" class="text-[var(--accent)] font-bold tabular-nums">
          {{ downloadStore.downloadSpeedFormatted }}
        </span>
        <span v-else-if="downloadStore.taskType === 'loading'" class="text-[var(--status-ok)]">
          RAM/VRAM
        </span>
        <Maximize2 class="w-3.5 h-3.5 text-[var(--arc-text-muted)] group-hover:text-[var(--arc-text-primary)] transition-colors ml-1" />
      </div>

      <!-- Expanded Tactile Obsidian Telemetry Module -->
      <div 
        v-else
        class="w-[340px] sm:w-[370px] rounded-[20px] bg-[var(--arc-popover)] border border-[var(--arc-hairline)] overflow-hidden relative"
        :style="{
          background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 20px 50px rgba(0, 0, 0, 0.85)'
        }"
      >
        <!-- Top Tech Glow Hairline -->
        <div class="h-[1px] w-full bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-80"></div>

        <!-- HUD Header -->
        <div 
          class="flex items-center justify-between px-4 py-3 border-b border-[var(--arc-divider)] bg-[var(--arc-plane)]"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping shrink-0 shadow-[0_0_6px_var(--accent)]"></span>
            <span class="text-xs tracking-[0.14em] text-[var(--arc-text-muted)] uppercase truncate font-mono">
              {{ downloadStore.completedMessage ? 'SUBSYS // COMPLETED' : (downloadStore.taskType === 'loading' ? 'MEMORY // WEIGHT_INIT' : 'NET // MODEL_INGEST') }}
            </span>
          </div>

          <!-- Controls -->
          <div class="flex items-center gap-1 shrink-0">
            <button 
              id="btn-collapse-download-dock"
              type="button" 
              @click="downloadStore.collapse()"
              class="w-6 h-6 flex items-center justify-center text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] rounded-full transition-colors cursor-pointer"
              title="Свернуть"
            >
              <Minus class="w-3.5 h-3.5" />
            </button>
            <button 
              id="btn-close-download-dock"
              type="button" 
              @click="downloadStore.closeOverlay()"
              class="w-6 h-6 flex items-center justify-center text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] rounded-full transition-colors cursor-pointer"
              title="Закрыть"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="p-4 space-y-3 font-sans">
          <!-- Target Model Name Display -->
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--arc-text-primary)] uppercase tracking-wider truncate max-w-[240px] font-mono">
              {{ downloadStore.currentFilename || downloadStore.loadingModelName || 'MODEL_SUBSYSTEM' }}
            </span>
            <span v-if="downloadStore.isDownloading" class="text-xs font-bold text-[var(--arc-text-primary)] tracking-widest font-mono tabular-nums">
              {{ downloadStore.progressPercent }}%
            </span>
          </div>

          <!-- 1. Completed Message -->
          <div v-if="downloadStore.completedMessage" class="py-1 flex items-center gap-2 text-xs text-[var(--status-ok)]">
            <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
            <span>{{ downloadStore.completedMessage }}</span>
          </div>

          <!-- 2. Hugging Face 429 Cooldown -->
          <div v-else-if="downloadStore.isHfCooldown" class="p-3 bg-[var(--arc-block)] border border-[var(--status-warn)] rounded-[12px] text-xs text-[var(--status-warn)] space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <AlertTriangle class="w-3.5 h-3.5 text-[var(--status-warn)] animate-pulse shrink-0" />
                <span class="font-mono font-bold tracking-wider uppercase text-xs tabular-nums">429 // РЕТРАЙ ЧЕРЕЗ {{ downloadStore.hfCooldownSeconds }}с</span>
              </div>
              <button 
                @click="downloadStore.resetHfCooldown()"
                class="px-2.5 py-1 text-xs uppercase tracking-wider bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--status-warn)] border border-[var(--status-warn)] rounded-full transition-colors cursor-pointer"
                title="Сбросить таймер ожидания"
              >
                Сбросить
              </button>
            </div>
            <div class="text-xs text-[var(--arc-text-secondary)]">Превышен лимит запросов HuggingFace. Ожидание бэк-оффа перед следующим запросом.</div>
          </div>

          <!-- 3. Error Message -->
          <div v-else-if="downloadStore.errorText" class="p-3 bg-[var(--arc-block)] border border-[var(--status-err)] rounded-[12px] text-xs text-[var(--status-err)] break-words space-y-2">
            <div class="flex items-center gap-1.5">
              <AlertTriangle class="w-3.5 h-3.5 text-[var(--status-err)] shrink-0" />
              <span>{{ downloadStore.errorText }}</span>
            </div>
            <div class="flex justify-end">
              <button 
                @click="downloadStore.finishDownload()"
                class="px-3 py-1 text-xs uppercase tracking-wider bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--status-err)] text-[var(--arc-text-primary)] rounded-full transition-colors cursor-pointer"
              >
                Сбросить
              </button>
            </div>
          </div>

          <!-- 4. RAM/VRAM Loading Mode -->
          <div v-else-if="downloadStore.taskType === 'loading'" class="space-y-2">
            <div class="h-2 w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-full overflow-hidden">
              <div class="h-full w-full bg-[var(--status-ok)] animate-pulse rounded-full"></div>
            </div>
            <div class="flex items-center justify-between text-xs text-[var(--arc-text-secondary)] font-mono">
              <span>{{ downloadStore.loadingStageText || 'Инициализация весов в память...' }}</span>
              <span class="text-[var(--status-ok)] font-semibold">RAM / GPU</span>
            </div>
          </div>

          <!-- 5. Downloading Mode -->
          <div v-else-if="downloadStore.isDownloading" class="space-y-3">
            <!-- Voice Pause Indicator -->
            <div v-if="downloadStore.isPausedForVoice" class="p-2.5 bg-[var(--arc-block)] border border-[var(--status-warn)] rounded-[12px] text-xs text-[var(--status-warn)] flex items-center gap-2 font-mono">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)] animate-ping shrink-0"></span>
              <span>ПРИОРИТЕТ ГОЛОСОВОГО ВВОДА // ПАУЗА</span>
            </div>

            <!-- Precision Linear Gauge -->
            <div class="h-2 w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-full overflow-hidden relative">
              <div 
                class="h-full bg-[var(--accent)] rounded-full transition-all duration-200 shadow-[0_0_10px_var(--accent)]"
                :style="{ width: downloadStore.progressPercent + '%' }"
              ></div>
            </div>

            <!-- A.R.C. 3-Cell Recessed Matrix -->
            <div 
              class="grid grid-cols-3 gap-1.5 bg-[var(--arc-input)] border border-[var(--arc-hairline)] p-2 rounded-[12px] text-center font-mono"
              :style="{ boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7)' }"
            >
              <!-- Payload -->
              <div class="flex flex-col items-center justify-center px-1 py-1 rounded-[8px] bg-[var(--arc-block)]">
                <span class="text-xs tracking-[0.08em] text-[var(--arc-text-muted)] uppercase">PAYLOAD</span>
                <span class="text-xs text-[var(--arc-text-primary)] font-medium truncate max-w-full tabular-nums">
                  {{ formatBytes(downloadStore.bytesDone) }}
                </span>
                <span class="text-xs text-[var(--arc-text-muted)] tabular-nums">
                  / {{ formatBytes(downloadStore.totalBytes) }}
                </span>
              </div>

              <!-- Rate -->
              <div class="flex flex-col items-center justify-center px-1 py-1 rounded-[8px] bg-[var(--arc-block)]">
                <span class="text-xs tracking-[0.08em] text-[var(--arc-text-muted)] uppercase">RATE</span>
                <span class="text-xs text-[var(--accent)] font-semibold tabular-nums">
                  {{ downloadStore.isPausedForVoice ? '0 B/s' : downloadStore.downloadSpeedFormatted }}
                </span>
                <span class="text-xs text-[var(--arc-text-muted)]">REALTIME</span>
              </div>

              <!-- ETA -->
              <div class="flex flex-col items-center justify-center px-1 py-1 rounded-[8px] bg-[var(--arc-block)]">
                <span class="text-xs tracking-[0.08em] text-[var(--arc-text-muted)] uppercase">ETA</span>
                <span class="text-xs text-[var(--arc-text-primary)] font-semibold tabular-nums">
                  {{ downloadStore.isPausedForVoice ? 'PAUSED' : downloadStore.estimatedTimeFormatted }}
                </span>
                <span class="text-xs text-[var(--arc-text-muted)]">REMAINING</span>
              </div>
            </div>

            <!-- Action Controls -->
            <div class="flex items-center justify-between pt-1 font-mono">
              <button 
                id="btn-cancel-model-download"
                type="button" 
                @click="downloadStore.cancelDownload()"
                class="px-3.5 py-1.5 text-xs tracking-wider text-[var(--status-err)] border border-[var(--status-err)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] rounded-full transition cursor-pointer uppercase active:scale-95"
              >
                Отмена
              </button>
              <button 
                id="btn-minimize-download-dock"
                type="button" 
                @click="downloadStore.collapse()"
                class="px-3.5 py-1.5 text-xs tracking-wider text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] border border-[var(--arc-hairline)] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] rounded-full transition cursor-pointer uppercase active:scale-95"
              >
                Свернуть
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.hud-dock-enter-active,
.hud-dock-leave-active {
  transition: all 0.2s ease-out;
}

.hud-dock-enter-from,
.hud-dock-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
