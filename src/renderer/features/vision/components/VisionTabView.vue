<template>
  <div class="w-full h-full overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-4 font-sans select-text bg-[var(--arc-plane)] p-4 md:p-6">
    <!-- Standardized Workspace Header -->
    <header 
      class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--arc-hairline)] shrink-0"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5 min-w-[200px]">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="vision-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] flex items-center justify-center shrink-0"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Camera class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <h1 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            Оптический канал (Зрение)
          </h1>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate">
            Прямой видеопоток камеры и визуальный захват рабочей среды
          </p>
        </div>
      </div>

      <span 
        class="inline-flex items-center gap-1.5 text-xs font-mono border border-[var(--arc-hairline)] bg-[var(--arc-block)] px-3 py-1 rounded-[10px] uppercase"
        :class="isCameraActive ? 'text-[var(--status-ok)]' : 'text-[var(--arc-text-muted)]'"
        :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="isCameraActive ? 'bg-[var(--status-ok)] animate-pulse' : 'bg-[var(--status-off)]'"></span>
        {{ isCameraActive ? 'КАМЕРА АКТИВНА' : 'КАМЕРА ОТКЛЮЧЕНА' }}
      </span>
    </header>

    <!-- Camera Viewport Container -->
    <div 
      class="relative w-full aspect-video border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] overflow-hidden flex flex-col items-center justify-center shrink-0"
      :style="{
        background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 16px 40px rgba(0, 0, 0, 0.78)'
      }"
    >
      <div class="absolute inset-0 bg-radial-vignette opacity-50 z-10 pointer-events-none"></div>
      
      <!-- Real camera feed -->
      <video 
        ref="videoPlayerRef" 
        autoplay 
        playsinline 
        class="absolute inset-0 w-full h-full object-cover grayscale opacity-60 blend-screen"
        v-show="isCameraActive"
      ></video>

      <!-- Holographic decorative vector targets -->
      <div class="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div class="w-16 h-16 rounded-full border border-[var(--arc-hairline)] animate-ping opacity-25"></div>
        <div class="w-32 h-32 rounded-full border border-[var(--arc-hairline)] animate-shimmer scale-x-75 border-dashed"></div>
        <div class="absolute left-4 top-4 text-xs font-mono text-[var(--arc-text-machine)] tracking-widest uppercase bg-[var(--arc-plane)] px-2.5 py-1 rounded-[8px] border border-[var(--arc-hairline)]">
          REC_SYS_FEED
        </div>
        <div class="absolute right-4 bottom-4 text-xs font-mono text-[var(--arc-text-machine)] tracking-wider bg-[var(--arc-plane)] px-2.5 py-1 rounded-[8px] border border-[var(--arc-hairline)]">
          OPT_BRIDGE v4.11
        </div>
      </div>

      <!-- Inactive State -->
      <div v-if="!isCameraActive" class="flex flex-col items-center gap-2 z-10">
        <Camera class="w-6 h-6 text-[var(--accent)] animate-pulse" />
        <span class="text-xs font-mono tracking-widest text-[var(--arc-text-hint)] uppercase">
          {{ localizations?.satelliteVision || 'ОПТИЧЕСКИЙ КАНАЛ' }}
        </span>
        <button 
          @click="$emit('initializeCamera')" 
          type="button"
          class="mt-2 text-xs font-mono border border-[var(--arc-hairline)] rounded-[10px] px-4 py-2 bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] tracking-wider cursor-pointer transition uppercase"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)' }"
        >
          {{ localizations?.enableOptics || 'ВКЛЮЧИТЬ КАМЕРУ' }}
        </button>
      </div>

      <!-- Active State Control: Analyze Frame & Stop/Disable Camera -->
      <div v-else class="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          @click="analyzeCurrentFrame"
          type="button"
          :disabled="isAnalyzing"
          data-testid="vision-analyze-frame"
          class="text-xs font-mono border border-[var(--arc-hairline)] rounded-[10px] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] text-[var(--arc-text-primary)] disabled:opacity-50 px-3 py-1.5 cursor-pointer transition uppercase flex items-center gap-1.5"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="isAnalyzing ? 'bg-[var(--status-warn)] animate-pulse' : 'bg-[var(--accent)]'"
          ></span>
          {{ isAnalyzing ? 'АНАЛИЗ...' : 'АНАЛИЗ КАДРА' }}
        </button>
        <button 
          @click="$emit('stopCamera')" 
          type="button"
          class="text-xs font-mono border border-[var(--arc-hairline)] rounded-[10px] bg-[var(--arc-plane)] hover:border-[var(--status-err)] text-[var(--status-err)] px-3 py-1.5 cursor-pointer transition uppercase flex items-center gap-1.5"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-err)]"></span>
          {{ localizations?.disable || 'ОТКЛЮЧИТЬ' }}
        </button>
      </div>
    </div>

    <!-- Live performance metrics / Recognition Status (Honest telemetry) -->
    <div 
      class="flex flex-col border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] p-4 items-center justify-center min-h-[100px] gap-1.5 text-center"
      :style="{
        background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 14px 36px rgba(0, 0, 0, 0.76)'
      }"
    >
      <div class="flex items-center gap-2 text-xs font-mono text-[var(--arc-text-machine)] uppercase tracking-wider">
        <span
          class="w-1.5 h-1.5 rounded-full"
          :class="
            isAnalyzing
              ? 'bg-[var(--status-warn)] animate-pulse'
              : analysisError
                ? 'bg-[var(--status-err)]'
                : analysisResult
                  ? 'bg-[var(--status-ok)]'
                  : 'bg-[var(--status-off)]'
          "
        ></span>
        <span>
          {{
            isAnalyzing
              ? 'МОДУЛЬ МУЛЬТИМОДАЛЬНОГО АНАЛИЗА: ОБРАБОТКА КАДРА'
              : analysisError
                ? 'МОДУЛЬ МУЛЬТИМОДАЛЬНОГО АНАЛИЗА: ОШИБКА'
                : analysisResult
                  ? `МОДУЛЬ МУЛЬТИМОДАЛЬНОГО АНАЛИЗА: ГОТОВ${analysisModel ? ` (${analysisModel})` : ''}`
                  : isCameraActive
                    ? 'МОДУЛЬ МУЛЬТИМОДАЛЬНОГО АНАЛИЗА: ГОТОВ К ЗАХВАТУ КАДРА'
                    : 'МОДУЛЬ МУЛЬТИМОДАЛЬНОГО АНАЛИЗА: ОЖИДАНИЕ КАМЕРЫ'
          }}
        </span>
      </div>
      <p
        v-if="analysisError"
        data-testid="vision-analysis-error"
        class="text-xs text-[var(--status-err)] font-sans max-w-[640px] leading-relaxed"
      >
        {{ analysisError }}
      </p>
      <p
        v-else-if="analysisResult"
        data-testid="vision-analysis-result"
        class="text-xs text-[var(--arc-text-primary)] font-sans max-w-[640px] leading-relaxed whitespace-pre-wrap"
      >
        {{ analysisResult }}
      </p>
      <p v-else class="text-xs text-[var(--arc-text-hint)] font-sans max-w-[460px] leading-relaxed">
        Включите оптический канал и нажмите «АНАЛИЗ КАДРА» для мультимодального распознавания текущего кадра камеры через настроенный контур Gemini Vision.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { Camera, ArrowLeft } from 'lucide-vue-next';
import { useUIStore } from '../../../stores/ui.store';

const uiStore = useUIStore();

const props = defineProps<{
  isCameraActive?: boolean;
  videoPlayer?: any;
  localizations?: any;
}>();

defineEmits<{
  (e: 'initializeCamera'): void;
  (e: 'stopCamera'): void;
}>();

const videoPlayerRef = ref<HTMLVideoElement | null>(null);
const isAnalyzing = ref(false);
const analysisResult = ref<string | null>(null);
const analysisError = ref<string | null>(null);
const analysisModel = ref<string | null>(null);

async function analyzeCurrentFrame() {
  if (isAnalyzing.value) return;
  analysisError.value = null;

  const videoEl = videoPlayerRef.value;
  if (!videoEl || !props.isCameraActive) {
    analysisError.value = 'Камера не активна.';
    return;
  }

  const analyzeFn = window.api?.analyzeVision;
  if (typeof analyzeFn !== 'function') {
    analysisError.value = 'Канал мультимодального анализа (window.api.analyzeVision) недоступен.';
    return;
  }

  try {
    isAnalyzing.value = true;
    const width = videoEl.videoWidth > 0 ? videoEl.videoWidth : 640;
    const height = videoEl.videoHeight > 0 ? videoEl.videoHeight : 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      analysisError.value = 'Не удалось инициализировать 2D-контекст захвата кадра.';
      return;
    }
    ctx.drawImage(videoEl, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    const response = await analyzeFn({
      imageBase64: dataUrl,
      mimeType: 'image/jpeg'
    });

    if (typeof response === 'string') {
      analysisResult.value = response;
      analysisModel.value = null;
    } else if (response && response.success) {
      analysisResult.value = response.text || 'Кадр проанализирован.';
      analysisModel.value = response.model || null;
    } else {
      analysisError.value = response?.error || 'Не удалось выполнить анализ кадра.';
    }
  } catch (err: any) {
    analysisError.value = err?.message || 'Ошибка при захвате или отправке кадра.';
  } finally {
    isAnalyzing.value = false;
  }
}

watch(
  () => props.videoPlayer,
  (val) => {
    if (!videoPlayerRef.value) return;
    const stream: MediaStream | null =
      val instanceof MediaStream
        ? val
        : val && typeof val === 'object' && 'srcObject' in val
          ? (val.srcObject as MediaStream | null)
          : val && typeof val === 'object' && typeof val.getTracks === 'function'
            ? (val as MediaStream)
            : (val?.stream as MediaStream | null) ?? null;

    if (videoPlayerRef.value.srcObject !== stream) {
      videoPlayerRef.value.srcObject = stream;
      if (stream) {
        videoPlayerRef.value.play().catch((err) => {
          console.warn('[VisionTabView] video.play() prevented:', err);
        });
      }
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.srcObject = null;
  }
});
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) rgba(0, 0, 0, 0.2);
  scroll-behavior: smooth;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
}
</style>
