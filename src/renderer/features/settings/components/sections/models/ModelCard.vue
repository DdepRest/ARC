<script setup lang="ts">
import { Star, Zap, Download, CheckCircle, Loader2, AlertTriangle } from 'lucide-vue-next';
import { ModelType } from '../model-hub.registry';
import {
  getQuantCompatibility,
  type TtsVerificationStatus
} from '../../../composables/useModelHubSession';

defineProps<{
  model: any;
  targetMemoryGb: number | null;
  ttsVerificationStatus?: TtsVerificationStatus;
  downloadState: Record<string, { downloaded: boolean }>;
  confirmLowRam: Set<string>;
  isQuantDownloading: (id: string) => boolean;
  getQuantProgress: (id: string) => number;
  downloadQuant: (type: ModelType, id: string) => void;
}>();

const formatSize = (s: string) => String(s).replace(/\s*GB\b/g, ' ГБ').replace(/\s*MB\b/g, ' МБ');

const compatMeta = (minRamGb: number, targetMemoryGb: number | null) => {
  const status = getQuantCompatibility(minRamGb, targetMemoryGb);
  if (status === 'COMPATIBLE') {
    return {
      status,
      label: 'Совместимо',
      textCls: 'text-[var(--status-ok)]',
      rowCls: 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]'
    };
  }
  if (status === 'INCOMPATIBLE') {
    return {
      status,
      label: `Требует ${minRamGb} ГБ`,
      textCls: 'text-[var(--status-warn)]',
      rowCls: 'bg-[var(--arc-plane)] border-[var(--status-warn)]/35'
    };
  }
  return {
    status,
    label: `Память не определена (~${minRamGb} ГБ)`,
    textCls: 'text-[var(--arc-text-muted)]',
    rowCls: 'bg-[var(--arc-plane)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]'
  };
};
</script>

<template>
  <div 
    class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px] overflow-hidden transition duration-200 hover:border-[var(--arc-border-focus,var(--arc-hairline))]"
    :style="{
      background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 10px 28px rgba(0, 0, 0, 0.60)'
    }"
  >
    <!-- Card Header -->
    <div 
      class="p-4 border-b border-[var(--arc-hairline)] flex flex-col gap-3"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-xs font-mono tracking-wider text-[var(--arc-text-muted)] uppercase">
            {{ model.vendor }} · {{ model.type.toUpperCase() }}
          </span>
          <h3 class="text-base font-bold text-[var(--arc-text-primary)] leading-tight truncate">{{ model.name }}</h3>
        </div>
        <div class="flex items-center gap-3 shrink-0 font-mono text-xs text-[var(--arc-text-muted)] tabular-nums">
          <div class="flex items-center gap-1" title="Качество">
            <Star class="w-3.5 h-3.5 text-[var(--status-warn)] fill-[var(--status-warn)]" />
            <span>{{ model.qualityStars }}/5</span>
          </div>
          <div class="flex items-center gap-1" title="Скорость">
            <Zap class="w-3.5 h-3.5 text-[var(--arc-text-primary)]" />
            <span>{{ model.speedStars }}/5</span>
          </div>
        </div>
      </div>
      
      <div class="flex flex-wrap items-center gap-1.5 text-xs font-mono text-[var(--arc-text-muted)]">
        <template v-for="(badge, idx) in model.badges" :key="badge">
          <span v-if="idx > 0" aria-hidden="true" class="text-[var(--arc-text-hint)]">·</span>
          <span>{{ badge }}</span>
        </template>
      </div>

      <p class="text-xs text-[var(--arc-text-muted)] leading-relaxed min-h-[34px]">{{ model.description }}</p>
    </div>

    <!-- Card Body / Quants -->
    <div class="p-4 flex flex-col gap-2.5">
      <div class="text-xs font-mono text-[var(--arc-text-hint)] uppercase tracking-wider">Доступные квантизации</div>
      <div class="flex flex-col gap-2 max-h-[156px] overflow-y-auto pr-1">
        <div 
          v-for="q in model.quants" 
          :key="q.id"
          class="p-2.5 rounded-lg border flex items-center justify-between gap-3 transition"
          :class="compatMeta(q.minRamGb, targetMemoryGb).rowCls"
        >
          <div class="flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-xs text-[var(--arc-text-primary)] truncate">{{ q.name }}</span>
              <span 
                class="text-xs font-mono"
                :class="compatMeta(q.minRamGb, targetMemoryGb).textCls"
              >
                · {{ compatMeta(q.minRamGb, targetMemoryGb).label }}
              </span>
            </div>
            <div class="text-xs font-mono text-[var(--arc-text-muted)] flex items-center gap-2 tabular-nums">
              <span>Память: ~{{ q.minRamGb }} ГБ</span>
              <span>·</span>
              <span>Размер: {{ formatSize(q.expectedSizeStr) }}</span>
            </div>
          </div>
          
          <!-- Single Action / Status Control on the Right -->
          <div class="shrink-0 flex items-center gap-2">
            <span 
              v-if="downloadState[q.id]?.downloaded" 
              class="text-xs font-mono text-[var(--status-ok)] font-semibold bg-[var(--arc-block)] px-2.5 py-1.5 rounded-lg border border-[var(--status-ok)]/30 flex items-center gap-1.5"
            >
              <CheckCircle class="w-3.5 h-3.5" /> {{ model.type === 'tts' ? 'Активен' : 'Готово' }}
            </span>
            <span 
              v-else-if="model.type === 'tts'"
              class="px-2.5 py-1.5 bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--arc-text-muted)] text-xs font-mono rounded-lg"
              :title="ttsVerificationStatus === 'BUNDLED_UNVERIFIED' ? 'Встроено в пакет сборки; сервер Silero не запущен' : 'Статус не проверен'"
            >
              Встроено · Не проверено
            </span>
            <button 
              v-else
              type="button"
              @click="downloadQuant(model.type, q.id)"
              :disabled="isQuantDownloading(q.id)"
              class="px-3 py-1.5 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] text-[var(--arc-text-primary)] text-xs font-mono font-semibold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-w-[96px] tabular-nums"
              :title="compatMeta(q.minRamGb, targetMemoryGb).status === 'INCOMPATIBLE' && !confirmLowRam.has(q.id) ? 'Нажмите для подтверждения загрузки на устройстве с меньшим объёмом памяти' : 'Скачать модель'"
            >
              <template v-if="isQuantDownloading(q.id)">
                <Loader2 class="w-3.5 h-3.5 animate-spin" />
                <span>{{ getQuantProgress(q.id) }}%</span>
              </template>
              <template v-else-if="compatMeta(q.minRamGb, targetMemoryGb).status === 'INCOMPATIBLE' && !confirmLowRam.has(q.id)">
                <AlertTriangle class="w-3.5 h-3.5 text-[var(--status-warn)]" />
                <span>Риск</span>
              </template>
              <template v-else-if="compatMeta(q.minRamGb, targetMemoryGb).status === 'INCOMPATIBLE' && confirmLowRam.has(q.id)">
                <Download class="w-3.5 h-3.5 text-[var(--status-warn)]" />
                <span>Подтв.</span>
              </template>
              <template v-else>
                <Download class="w-3.5 h-3.5" />
                <span>Скачать</span>
              </template>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
