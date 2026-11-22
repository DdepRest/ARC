<script setup lang="ts">
import { Star, Zap, Download, CheckCircle, Loader2, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-vue-next';
import { ModelType } from '../model-hub.registry';
import {
  getQuantCompatibility,
  type TtsVerificationStatus,
  type QuantIntegrityInfo
} from '../../../composables/useModelHubSession';
import type { ResourceStateSnapshot } from '../../../../../../shared/utils/voice-model-state-machine';

const props = defineProps<{
  model: any;
  targetMemoryGb: number | null;
  ttsVerificationStatus?: TtsVerificationStatus;
  downloadState: Record<string, { downloaded: boolean }>;
  integrityMap?: Record<string, QuantIntegrityInfo>;
  quantStateMap?: Record<string, ResourceStateSnapshot>;
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
      rowCls: 'bg-[var(--arc-well)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]'
    };
  }
  if (status === 'INCOMPATIBLE') {
    return {
      status,
      label: `Требует ${minRamGb} ГБ`,
      textCls: 'text-[var(--status-warn)]',
      rowCls: 'bg-[var(--arc-well)] border-[var(--status-warn)]/35'
    };
  }
  return {
    status,
    label: `Память не определена (~${minRamGb} ГБ)`,
    textCls: 'text-[var(--arc-text-muted)]',
    rowCls: 'bg-[var(--arc-well)] border-[var(--arc-hairline)] hover:bg-[var(--arc-hover)]'
  };
};

const getIntegrityMeta = (quantId: string) => {
  const info = props.integrityMap?.[quantId];
  const status = info?.integrity?.status;
  if (!status || status === 'missing' || status === 'unknown') return null;
  if (status === 'verified') {
    return {
      status,
      label: 'SHA-256 проверено',
      cls: 'text-[var(--status-ok)]',
      detail: info?.provenance?.revision ? `rev ${info.provenance.revision.slice(0, 7)}` : undefined
    };
  }
  if (status === 'unverified_manual') {
    return {
      status,
      label: 'UNVERIFIED / MANUAL',
      cls: 'text-[var(--status-warn)]',
      detail: info?.integrity?.reason || 'Добавлена вручную без доверенного SHA-256'
    };
  }
  if (status === 'tampered') {
    return {
      status,
      label: 'ЦЕЛОСТНОСТЬ НАРУШЕНА',
      cls: 'text-[var(--status-err)]',
      detail: info?.integrity?.reason || 'Контрольная сумма не совпадает с манифестом'
    };
  }
  return null;
};

const getQuantSnapshot = (quantId: string): ResourceStateSnapshot | null => {
  return props.quantStateMap?.[quantId] ?? null;
};

const isDownloadedReady = (quantId: string): boolean => {
  const snap = getQuantSnapshot(quantId);
  if (snap) {
    return (
      snap.readinessLayer !== 'none' &&
      snap.setupState !== 'checking' &&
      snap.setupState !== 'failed' &&
      snap.setupState !== 'cancelled' &&
      snap.setupState !== 'downloading' &&
      snap.setupState !== 'verifying'
    );
  }
  return Boolean(props.downloadState[quantId]?.downloaded) && getIntegrityMeta(quantId)?.status !== 'tampered';
};

const getReadyBadgeLabel = (quantId: string): string => {
  const snap = getQuantSnapshot(quantId);
  if (snap) return snap.badgeLabel;
  if (props.model.type === 'tts') return 'Активен';
  return getIntegrityMeta(quantId)?.status === 'unverified_manual' ? 'Скачана · Не проверена' : 'Проверена (на диске)';
};

const getReadyBadgeTone = (quantId: string): 'ok' | 'warn' => {
  const snap = getQuantSnapshot(quantId);
  if (snap) return snap.badgeTone === 'ok' ? 'ok' : 'warn';
  return getIntegrityMeta(quantId)?.status === 'unverified_manual' ? 'warn' : 'ok';
};
</script>

<template>
  <div 
    class="flex flex-col bg-[var(--arc-block)] border border-[var(--arc-hairline)] rounded-[16px] overflow-hidden transition duration-200 hover:border-[var(--arc-border-focus,var(--arc-hairline))]"
    :style="{
      background: 'var(--arc-block-gradient, linear-gradient(180deg, #161616 0%, #0F0F0F 100%))',
      boxShadow: 'var(--arc-block-elevation)'
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
      <div class="flex flex-col gap-2 max-h-[196px] overflow-y-auto pr-1">
        <div 
          v-for="q in model.quants" 
          :key="q.id"
          class="p-2.5 rounded-lg border flex flex-col gap-1.5 transition"
          :class="compatMeta(q.minRamGb, targetMemoryGb).rowCls"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col gap-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-xs text-[var(--arc-text-primary)] truncate">{{ q.name }}</span>
                <span class="text-xs font-mono" :class="compatMeta(q.minRamGb, targetMemoryGb).textCls">
                  · {{ compatMeta(q.minRamGb, targetMemoryGb).label }}
                </span>
              </div>
              <div class="text-xs font-mono text-[var(--arc-text-muted)] flex items-center gap-2 tabular-nums flex-wrap">
                <span>Память: ~{{ q.minRamGb }} ГБ</span>
                <span>·</span>
                <span>Размер: {{ formatSize(q.expectedSizeStr) }}</span>
              </div>
            </div>
            
            <!-- Single Action / Status Control on the Right -->
            <div class="shrink-0 flex items-center gap-2">
              <span
                v-if="getQuantSnapshot(q.id)?.setupState === 'checking'"
                class="px-2.5 py-1.5 bg-[var(--arc-block)] border border-[var(--status-warn)]/35 text-[var(--status-warn)] text-xs font-mono rounded-lg flex items-center gap-1.5"
                :title="getQuantSnapshot(q.id)?.detail"
              >
                <Loader2 class="w-3.5 h-3.5 animate-spin" />
                <span>Проверка...</span>
              </span>
              <span 
                v-else-if="isDownloadedReady(q.id)" 
                class="text-xs font-mono font-semibold bg-[var(--arc-block)] px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5"
                :class="getReadyBadgeTone(q.id) === 'warn' ? 'text-[var(--status-warn)] border-[var(--status-warn)]/40' : 'text-[var(--status-ok)] border-[var(--status-ok)]/30'"
                :title="getQuantSnapshot(q.id)?.detail"
              >
                <AlertTriangle v-if="getReadyBadgeTone(q.id) === 'warn'" class="w-3.5 h-3.5" />
                <CheckCircle v-else class="w-3.5 h-3.5" />
                {{ getReadyBadgeLabel(q.id) }}
              </span>
              <span 
                v-else-if="model.type === 'tts'"
                class="px-2.5 py-1.5 bg-[var(--arc-block)] border text-xs font-mono rounded-lg"
                :class="ttsVerificationStatus === 'TAMPERED' ? 'text-[var(--status-err)] border-[var(--status-err)]/40' : getQuantSnapshot(q.id)?.setupState === 'consent_required' ? 'text-[var(--status-warn)] border-[var(--status-warn)]/35' : 'text-[var(--arc-text-muted)] border-[var(--arc-hairline)]'"
                :title="ttsVerificationStatus === 'TAMPERED' ? 'Обнаружено нарушение SHA-256 скриптов или весов Silero TTS' : getQuantSnapshot(q.id)?.detail || (ttsVerificationStatus === 'BUNDLED_UNVERIFIED' ? 'Встроено в пакет сборки; сервер Silero не запущен' : 'Статус не проверен')"
              >
                {{ ttsVerificationStatus === 'TAMPERED' ? 'Нарушена целостность' : (getQuantSnapshot(q.id)?.badgeLabel || 'Встроено · Не проверено') }}
              </span>
              <button 
                v-else
                type="button"
                @click="downloadQuant(model.type, q.id)"
                :disabled="isQuantDownloading(q.id)"
                class="px-3 py-1.5 bg-[var(--arc-hover)] hover:bg-[var(--arc-selected)] border border-[var(--arc-hairline)] hover:border-[var(--arc-border-focus,var(--arc-hairline))] text-[var(--arc-text-primary)] text-xs font-mono font-semibold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-w-[96px] tabular-nums"
                :title="getIntegrityMeta(q.id)?.status === 'tampered' || getQuantSnapshot(q.id)?.setupState === 'failed' ? (getQuantSnapshot(q.id)?.detail || getIntegrityMeta(q.id)?.detail || 'Перекачать повреждённую модель') : getQuantSnapshot(q.id)?.setupState === 'cancelled' ? 'Загрузка отменена — нажмите чтобы повторить' : compatMeta(q.minRamGb, targetMemoryGb).status === 'INCOMPATIBLE' && !confirmLowRam.has(q.id) ? 'Нажмите для подтверждения загрузки на устройстве с меньшим объёмом памяти' : 'Скачать модель'"
              >
                <template v-if="isQuantDownloading(q.id)">
                  <Loader2 class="w-3.5 h-3.5 animate-spin" />
                  <span>{{ getQuantProgress(q.id) }}%</span>
                </template>
                <template v-else-if="getIntegrityMeta(q.id)?.status === 'tampered'">
                  <ShieldAlert class="w-3.5 h-3.5 text-[var(--status-err)]" />
                  <span>Перекачать</span>
                </template>
                <template v-else-if="getQuantSnapshot(q.id)?.setupState === 'failed'">
                  <AlertTriangle class="w-3.5 h-3.5 text-[var(--status-err)]" />
                  <span>Повторить</span>
                </template>
                <template v-else-if="getQuantSnapshot(q.id)?.setupState === 'cancelled'">
                  <Download class="w-3.5 h-3.5 text-[var(--status-warn)]" />
                  <span>Отменено</span>
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

          <!-- Supply-chain provenance / integrity line -->
          <div
            v-if="getIntegrityMeta(q.id)"
            class="flex items-center justify-between gap-2 pt-1 border-t border-[var(--arc-hairline)] text-[11px] font-mono"
            :class="getIntegrityMeta(q.id)?.cls"
          >
            <span class="flex items-center gap-1 truncate">
              <ShieldCheck v-if="getIntegrityMeta(q.id)?.status === 'verified'" class="w-3 h-3 shrink-0" />
              <ShieldAlert v-else class="w-3 h-3 shrink-0" />
              <span class="truncate">{{ getIntegrityMeta(q.id)?.label }}</span>
            </span>
            <span v-if="getIntegrityMeta(q.id)?.detail || integrityMap?.[q.id]?.provenance?.source" class="text-[var(--arc-text-hint)] truncate max-w-[60%]">
              {{ getIntegrityMeta(q.id)?.status === 'verified' ? `${integrityMap?.[q.id]?.provenance?.source || ''} ${getIntegrityMeta(q.id)?.detail || ''}`.trim() : getIntegrityMeta(q.id)?.detail }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
