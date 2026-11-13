<template>
  <header class="title-bar group">
    <div ref="containerRef" class="title-bar-content relative">
      <!-- Left: Logo & Branding -->
      <div ref="leftSectionRef" class="left-section shrink-0 flex items-center pointer-events-auto">
        <div 
          class="logo"
          :class="uiStore.activeTab !== 'core' ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''"
          @click="uiStore.activeTab !== 'core' && uiStore.setActiveTab('core')"
          :title="uiStore.activeTab !== 'core' ? 'Вернуться к 3D-Ядру (Esc)' : 'A.R.C.'"
        >
          <!-- A.R.C. minimalist logo icon -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="logo-icon text-[var(--accent)]">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span class="title tracking-[0.2em]">A.R.C.</span>
          <span 
            v-if="isDevMode && hasDoubleMount" 
            class="ml-2 px-2 py-0.5 rounded-[6px] bg-[var(--arc-block)] border border-[var(--status-err)] text-[var(--status-err)] font-mono text-xs font-bold animate-pulse tracking-wider uppercase"
            :title="`Обнаружено двойное монтирование компонента: ${doubleMountComponent}`"
          >
            DOUBLE MOUNT: {{ doubleMountComponent }}
          </span>
          <button 
            v-if="isDevMode" 
            type="button"
            @click="toggleWebglLoss"
            class="ml-2 px-2 py-0.5 rounded-[6px] border text-xs font-mono font-bold tracking-wider uppercase transition-colors cursor-pointer select-none hidden sm:inline-flex"
            :class="!is3dRenderingActive ? 'bg-[var(--arc-block)] border-[var(--status-warn)] text-[var(--status-warn)] animate-pulse' : 'bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
            title="DEV: Симуляция потери/восстановления WebGL контекста (ТЗ P1.3-R Phase D.4)"
          >
            GL: {{ is3dRenderingActive ? 'OK (3D)' : 'LOST (2D)' }}
          </button>
        </div>
        <div class="h-3.5 w-px bg-[var(--arc-hairline)] mx-2.5"></div>
      </div>

      <!-- Center: Telemetry & Model Context (Dead-centered HUD with dynamic yielding on approach) -->
      <div 
        ref="centerSectionRef"
        class="center-section pointer-events-auto hidden md:flex items-center gap-2 select-none overflow-hidden transition-all duration-500 px-2"
        :class="isSettingsOpen ? 'opacity-0 pointer-events-none scale-95' : (isSystemActive ? 'opacity-100' : 'opacity-75 hover:opacity-100')"
        :style="centerStyle"
      >
        <!-- Hardware Metrics (CPU & RAM) -->
        <div 
          v-if="showTitleBarHardwareMetrics"
          class="h-6 flex items-center gap-2 px-2.5 rounded-full border transition-all duration-300 select-none shrink-0 font-mono text-xs bg-[var(--arc-block)]" 
          :class="isSystemActive ? 'border-[var(--arc-border-focus,var(--arc-hairline))] text-[var(--arc-text-primary)]' : 'border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]'"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
          :title="`CPU: ${Math.round(systemStore.metrics.cpuLoad)} % | RAM: ${ramUsedGb}/${ramTotalGb} GB (${Math.round(systemStore.metrics.memoryUsage)} %)`"
        >
          <div class="flex items-center gap-1">
            <Cpu class="w-3 h-3 transition-colors duration-300 shrink-0" :class="isSystemActive ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)]'" />
            <span class="font-medium tracking-wider tabular-nums">CPU {{ Math.round(systemStore.metrics.cpuLoad) }} %</span>
          </div>
          <span class="text-[var(--arc-text-muted)]">·</span>
          <div class="flex items-center gap-1">
            <Zap class="w-3 h-3 transition-colors duration-300 shrink-0" :class="isSystemActive ? 'text-[var(--accent)]' : 'text-[var(--arc-text-muted)]'" />
            <span class="font-medium tracking-wider tabular-nums">RAM {{ Math.round(systemStore.metrics.memoryUsage) }} %</span>
          </div>
        </div>

        <!-- Active Model Memory Tag -->
        <div 
          v-if="uiStore.modelTelemetry" 
          class="h-6 flex items-center gap-1.5 px-2.5 rounded-full text-xs text-[var(--status-ok)] font-mono bg-[var(--arc-block)] border border-[var(--arc-hairline)] tracking-wider select-none shrink-0" 
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
          title="Память локальной нейросети"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
          <span class="tabular-nums">{{ (uiStore.modelTelemetry.modelMemoryMb / 1024).toFixed(1) }} GB</span>
        </div>

        <!-- Model Context Indicator -->
        <ModelContextIndicator v-if="uiStore.modelTelemetry" />

        <!-- Voice / STT Indicator -->
        <div 
          class="h-6 flex items-center gap-1.5 px-2.5 rounded-full border transition-all duration-300 select-none shrink-0 font-mono text-xs bg-[var(--arc-block)]"
          :class="[sttBadgeContainerClasses, voiceState === 'ERROR' ? 'cursor-pointer hover:bg-[var(--arc-hover)]' : '']"
          :style="voiceState === 'ERROR' ? '-webkit-app-region: no-drag; background-image: var(--arc-sheen);' : 'background-image: var(--arc-sheen);'"
          :title="voiceState === 'ERROR' ? ('STT ОШИБКА: ' + sttErrorReason + '. Нажмите для перехода в настройки.') : 'Голосовой модуль распознавания (STT)'"
          @click="voiceState === 'ERROR' && openSttSettings()"
        >
          <div class="relative w-1.5 h-1.5 flex items-center justify-center shrink-0">
            <div class="w-1.5 h-1.5 rounded-full" :class="sttStatusClasses"></div>
          </div>
          <span class="font-medium tracking-wider">{{ sttStatusText }}</span>
          <span 
            v-if="voiceState === 'ERROR' && sttErrorReason" 
            class="text-[var(--status-err)] font-mono text-xs max-w-[140px] truncate pl-1.5 border-l border-[var(--arc-divider)]"
            :title="sttErrorReason"
          >
            {{ sttErrorReason }}
          </span>
        </div>

        <!-- Download Telemetry Indicator -->
        <div 
          v-if="downloadStore.hasActiveNotification" 
          @click="downloadStore.isCollapsed ? downloadStore.expand() : downloadStore.collapse()"
          style="-webkit-app-region: no-drag;"
          class="h-6 flex items-center gap-1.5 px-2.5 rounded-full bg-[var(--arc-block)] border border-[var(--arc-border-focus,var(--arc-hairline))] hover:bg-[var(--arc-hover)] cursor-pointer font-mono text-xs tracking-wider transition-all select-none shrink-0"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
          title="Управление загрузкой модели"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0"></span>
          <span class="text-[var(--arc-text-muted)] uppercase">DL:</span>
          <span class="text-[var(--arc-text-primary)] font-bold tabular-nums">{{ downloadStore.progressPercent }}%</span>
          <span v-if="downloadStore.downloadSpeedBps > 0" class="text-[var(--accent)] font-semibold hidden xl:inline tabular-nums">
            {{ downloadStore.downloadSpeedFormatted }}
          </span>
        </div>

        <!-- Фоновый эко-режим / Индикатор сбережения ресурсов -->
        <div 
          v-if="ecoStore.isThrottled"
          class="h-6 flex items-center gap-1.5 px-2.5 rounded-full border bg-[var(--arc-block)] border-[var(--arc-hairline)] text-[var(--status-ok)] select-none shrink-0 font-mono text-xs tracking-wider"
          :style="{ backgroundImage: 'var(--arc-sheen)' }"
          title="A.R.C. в фоновом эко-режиме: графика приостановлена для экономии ресурсов CPU/GPU, голосовой ассистент готов к командам"
        >
          <Zap class="w-3 h-3 text-[var(--status-ok)] shrink-0" />
          <span class="font-medium">ЭКО-РЕЖИМ</span>
        </div>
      </div>

      <!-- Right: Action Tools & Window Controls (Strictly Unified Style) -->
      <div ref="rightSectionRef" class="right-section shrink-0 pointer-events-auto flex items-center gap-2">
        <!-- Layout Mode Segmented Capsule (Чистый центр / Режим виджетов) -->
        <div 
          v-if="!isSettingsOpen"
          class="hidden md:flex h-6 items-center p-0.5 rounded-full bg-[var(--arc-block)] border border-[var(--arc-hairline)]" 
          style="-webkit-app-region: no-drag;"
        >
          <button 
            @click="settingsStore.toggleCleanCenter"
            class="h-5 px-2.5 rounded-full text-xs font-mono tracking-wider transition-all flex items-center gap-1.5 cursor-pointer font-medium"
            :class="isCleanCenterActive ? 'bg-[var(--arc-selected)] text-[var(--arc-text-primary)] border border-[var(--arc-border-focus,var(--arc-hairline))]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
            title="Режим «Чистый центр»: скрыть или показать все боковые панели"
          >
            <div 
              class="w-1.5 h-1.5 rounded-full transition-colors" 
              :class="isCleanCenterActive ? 'bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]' : 'bg-[var(--status-off)]'"
            ></div>
            <span>ЦЕНТР</span>
          </button>
          
          <div class="w-px h-3 bg-[var(--arc-divider)] mx-0.5"></div>
          
          <button 
            @click="toggleLayoutMode"
            class="h-5 px-2.5 rounded-full text-xs font-mono tracking-wider transition-all flex items-center gap-1 cursor-pointer font-medium text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]"
            :title="settingsStore.widgetLayoutMode === 'dock' ? 'Переключить в свободный режим виджетов' : 'Переключить в режим док-панелей'"
          >
            <Move v-if="settingsStore.widgetLayoutMode === 'dock'" class="w-2.5 h-2.5 opacity-70" />
            <LayoutGrid v-else class="w-2.5 h-2.5 opacity-70" />
            <span>{{ settingsStore.widgetLayoutMode === 'dock' ? 'СВОБОДНЫЙ' : 'ДОК' }}</span>
          </button>
        </div>

        <!-- Terminal Button (SYS_LOG) -->
        <button 
          @click="terminalStore.toggleTerminal" 
          class="h-6 w-6 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 border" 
          :class="terminalStore.isTerminalVisible ? 'bg-[var(--arc-selected)] text-[var(--accent)] border-[var(--arc-border-focus,var(--arc-hairline))]' : 'bg-[var(--arc-block)] border-[var(--arc-hairline)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)]'"
          title="Открыть системный терминал логов (SYS_LOG)"
          style="-webkit-app-region: no-drag;"
        >
          <Terminal class="w-3 h-3" />
        </button>

        <!-- Divider before window controls -->
        <div class="h-3.5 w-px bg-[var(--arc-hairline)] mx-0.5"></div>

        <!-- Window controls -->
        <div class="window-controls">
          <button class="win-btn minimize" @click="minimize" title="Свернуть">
            <svg viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1" /></svg>
          </button>
          <button class="win-btn maximize" @click="maximize" title="Развернуть">
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
          </button>
          <button class="win-btn close" @click="close" title="Закрыть">
            <svg viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.2">
              <line x1="0" y1="0" x2="10" y2="10" />
              <line x1="0" y1="10" x2="10" y2="0" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Cpu, Zap, Terminal, Move, LayoutGrid } from 'lucide-vue-next';
import { useTerminalStore } from '../../stores/terminal.store';
import { useUIStore } from '../../stores/ui.store';
import { useSystemStore } from '../../stores/system.store';
import { useSettingsStore } from '../../features/settings/stores/settings.store';
import { useEcoStore } from '../../stores/eco.store';
import { useModelDownloadStore } from '../../features/modelDownload/stores/modelDownload.store';
import { themeAccentHex } from '../reactor/modules/reactor-theme';
import ModelContextIndicator from '../panels/ModelContextIndicator.vue';
import { useVoice } from '../../composables/useVoice';
import { useTitleBarCenter } from '../../composables/useTitleBarCenter';
import { useSettingsNav } from '../../features/settings/composables/useSettingsNav';
import { hasDoubleMount, doubleMountComponent } from '../../utils/arcGhostDetector';

const isDevMode = import.meta.env?.DEV;

const isWebglLossSimulated = ref(false);
const is3dRenderingActive = computed(() => {
  if (typeof globalThis !== 'undefined') {
    if ((globalThis as any).__ARC_WEBGL_LOST__ === true) return false;
    if ((globalThis as any).__isWebglContextLost?.value === true) return false;
  }
  return !isWebglLossSimulated.value;
});
const toggleWebglLoss = () => {
  if (typeof window === 'undefined') return;
  if (!isWebglLossSimulated.value) {
    if ((window as any).__simulateWebglLoss) {
      (window as any).__simulateWebglLoss();
      isWebglLossSimulated.value = true;
    }
  } else {
    if ((window as any).__simulateWebglRestore) {
      (window as any).__simulateWebglRestore();
      isWebglLossSimulated.value = false;
    }
  }
};

const terminalStore = useTerminalStore();
const uiStore = useUIStore();
const systemStore = useSystemStore();
const settingsStore = useSettingsStore();
const ecoStore = useEcoStore();
const downloadStore = useModelDownloadStore();
const { voiceState, isListening, isModelLoaded, isTranscribing } = useVoice();
const sttErrorReason = computed(() => uiStore.sttErrorText || 'Модель не загружена');
const openSttSettings = () => {
  uiStore.setActiveTab('settings');
  useSettingsNav().navigateToSection('voice', 'section-stt');
};
onMounted(async () => {
  if (window.api && (window.api as any).getSttStatus) {
    try {
      const s = await (window.api as any).getSttStatus();
      if (!s?.ready && s?.lastError && !uiStore.sttErrorText) {
        uiStore.sttErrorText = s.lastError;
      }
    } catch {}
  }
});

const containerRef = ref<HTMLElement | null>(null);
const leftSectionRef = ref<HTMLElement | null>(null);
const centerSectionRef = ref<HTMLElement | null>(null);
const rightSectionRef = ref<HTMLElement | null>(null);

const { centerStyle } = useTitleBarCenter({
  containerRef,
  leftSectionRef,
  centerSectionRef,
  rightSectionRef,
  watchSources: [
    () => settingsStore.leftDockCollapsed,
    () => settingsStore.rightDockCollapsed,
    () => settingsStore.widgetLayoutMode,
    () => voiceState.value,
    () => isModelLoaded.value,
    () => ecoStore.isThrottled,
    () => downloadStore.hasActiveNotification,
    () => uiStore.modelTelemetry
  ]
});

const isSettingsOpen = computed(() => uiStore.activeTab === 'settings');

const showTitleBarHardwareMetrics = computed(() => {
  const isCoreActive = uiStore.activeTab === 'core';
  const isDockOpen = !settingsStore.rightDockCollapsed;
  const isTelemetryWidgetActive = settingsStore.showTelemetryWidget;
  const isCoreWidgetVisible = isCoreActive && isTelemetryWidgetActive && isDockOpen;
  return !isCoreWidgetVisible;
});

const isSystemActive = computed(() => {
  return voiceState.value !== 'IDLE' || systemStore.metrics.cpuLoad > 40;
});

const isCleanCenterActive = computed(() => {
  return settingsStore.leftDockCollapsed && settingsStore.rightDockCollapsed;
});

const toggleLayoutMode = () => {
  settingsStore.widgetLayoutMode = settingsStore.widgetLayoutMode === 'dock' ? 'free' : 'dock';
};

const sttBadgeContainerClasses = computed(() => {
  if (isTranscribing.value || isListening.value || voiceState.value !== 'IDLE') {
    return 'border-[var(--arc-border-focus,var(--arc-hairline))] text-[var(--arc-text-primary)]';
  }
  if (voiceState.value === 'ERROR') {
    return 'border-[var(--status-err)] text-[var(--status-err)]';
  }
  return isSystemActive.value 
    ? 'border-[var(--arc-border-focus,var(--arc-hairline))] text-[var(--arc-text-primary)]' 
    : 'border-[var(--arc-hairline)] text-[var(--arc-text-secondary)] hover:text-[var(--arc-text-primary)]';
});

const sttStatusClasses = computed(() => {
  if (isTranscribing.value) return 'bg-[var(--status-warn)] animate-pulse';
  if (isListening.value) return 'bg-[var(--accent)] animate-ping shadow-[0_0_6px_var(--accent)]';
  if (voiceState.value === 'ERROR') return 'bg-[var(--status-err)]';
  if (voiceState.value !== 'IDLE') return 'bg-[var(--status-ok)] animate-pulse';
  return 'bg-[var(--status-off)]'; // IDLE
});

const sttStatusText = computed(() => {
  if (isTranscribing.value) return 'STT ОБРАБОТКА';
  if (isListening.value) return 'STT ВВОД';
  if (voiceState.value === 'ERROR') return 'STT ОШИБКА';
  if (voiceState.value !== 'IDLE') return 'STT АКТИВЕН';
  return isModelLoaded.value ? 'STT ГОТОВ' : 'STT ОЖИДАНИЕ';
});

const themeColor = computed(() => {
  const hexNum = themeAccentHex(settingsStore.reactorColorTheme);
  return '#' + hexNum.toString(16).padStart(6, '0');
});

const ramUsedGb = computed(() => {
  if (systemStore.metrics?.memoryUsedMb) {
    return (systemStore.metrics.memoryUsedMb / 1024).toFixed(1);
  }
  return ((systemStore.metrics?.memoryUsage || 0) * 0.08).toFixed(1);
});

const ramTotalGb = computed(() => {
  if (systemStore.metrics?.memoryTotalMb) {
    return (systemStore.metrics.memoryTotalMb / 1024).toFixed(1);
  }
  return '8.0';
});

const minimize = () => { (window.api as any)?.windowMinimize?.(); };
const maximize = () => { (window.api as any)?.windowMaximize?.(); };
const close = () => { (window.api as any)?.windowClose?.(); };
</script>
<style scoped>
.title-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 38px; z-index: 100000;
  display: flex; align-items: center; user-select: none; background-color: var(--arc-frame, #070707);
  border-bottom: 1px solid var(--arc-hairline, rgba(255, 255, 255, 0.08)); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  transition: border-color 0.2s; -webkit-app-region: drag;
}
.title-bar:hover { border-bottom-color: rgba(255, 255, 255, 0.14); }
.title-bar-content {
  position: relative; display: flex; align-items: center; justify-content: space-between;
  width: 100%; height: 100%; padding: 0 4px 0 14px;
}
.left-section { display: flex; align-items: center; }
.center-section {
  position: absolute; top: 50%; display: none; align-items: center; justify-content: center; white-space: nowrap;
}
@media (min-width: 768px) {
  .center-section { display: flex; }
}
.right-section { display: flex; align-items: center; margin-left: auto; }
.logo { display: flex; align-items: center; gap: 8px; opacity: 0.85; transition: opacity 0.2s; }
.title-bar:hover .logo { opacity: 1; }
.logo-icon { width: 14px; height: 14px; }
.title {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px; letter-spacing: 0.2em; color: #fff; font-weight: 700; text-transform: uppercase;
}
.window-controls { display: flex; height: 100%; -webkit-app-region: no-drag; }
.win-btn {
  width: 44px; height: 38px; display: flex; justify-content: center; align-items: center;
  background: transparent; border: none; color: rgba(255, 255, 255, 0.5); cursor: pointer; transition: all 0.2s;
}
.win-btn svg { width: 10px; height: 10px; }
.win-btn:hover { background-color: var(--arc-hover, #141414); color: rgba(255, 255, 255, 0.9); }
.win-btn.close:hover { background-color: var(--status-err); color: white; }
</style>
