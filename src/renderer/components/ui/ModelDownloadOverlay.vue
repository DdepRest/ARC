<script setup lang="ts">
import { useModelDownloadStore } from '../../features/modelDownload/stores/modelDownload.store';

const downloadStore = useModelDownloadStore();

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>

<template>
  <!-- 1. Fallback Consent Modal -->
  <div 
    v-if="downloadStore.isConsentOpen"
    class="fixed inset-0 arc-glass-veil flex items-center justify-center z-[100001] font-sans p-4"
  >
    <div 
      class="border border-[var(--arc-hairline)] rounded-[20px] w-full max-w-md p-6 overflow-hidden relative bg-[var(--arc-popover)] pointer-events-auto"
      :style="{
        background: 'linear-gradient(180deg, #161616 0%, #0E0E0E 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 64px rgba(0, 0, 0, 0.85)'
      }"
    >
      <div class="flex items-start gap-4 mb-4">
        <div 
          class="w-10 h-10 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] flex items-center justify-center shrink-0 text-[var(--accent)]"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-base text-[var(--arc-text-primary)] tracking-wide">
            Загрузка автономной модели
          </h3>
          <p class="text-xs text-[var(--arc-text-secondary)] mt-1 leading-relaxed">
            {{ downloadStore.consentReason }}
          </p>
        </div>
      </div>

      <div 
        class="bg-[var(--arc-input)] border border-[var(--arc-hairline)] rounded-[12px] p-3.5 mb-5 text-xs text-[var(--arc-text-secondary)] space-y-2 font-mono"
        :style="{ boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.7)' }"
      >
        <div class="flex justify-between items-center">
          <span class="text-[var(--arc-text-muted)]">Модель:</span>
          <span class="text-[var(--arc-text-primary)] font-semibold truncate max-w-[220px]">{{ downloadStore.consentModelName }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[var(--arc-text-muted)]">Размер:</span>
          <span class="text-[var(--arc-text-primary)] tabular-nums">~{{ formatBytes(downloadStore.consentSizeBytes) }}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-[var(--arc-text-muted)]">Авто-отмена через:</span>
          <span class="text-[var(--accent)] font-semibold tabular-nums">{{ downloadStore.consentTimeoutSeconds }} сек</span>
        </div>
      </div>

      <div class="flex justify-end gap-3 font-sans">
        <button 
          id="btn-reject-fallback-consent"
          @click="downloadStore.rejectConsent()"
          class="px-4 py-2 rounded-[10px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)] text-xs font-medium transition cursor-pointer active:scale-95"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
        >
          Отклонить
        </button>
        <button 
          id="btn-approve-fallback-consent"
          @click="downloadStore.approveConsent()"
          class="px-5 py-2 rounded-[10px] bg-[var(--accent)] text-white font-semibold text-xs transition cursor-pointer shadow-[0_0_16px_rgba(var(--accent-rgb),0.3)] active:scale-95"
        >
          Скачать и продолжить
        </button>
      </div>
    </div>
  </div>
</template>
