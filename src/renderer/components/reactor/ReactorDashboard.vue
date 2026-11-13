<template>
  <div 
    class="reactor-dashboard flex flex-col w-full h-full overflow-hidden select-none font-sans text-white transition-colors"
    style="
      background-color: var(--panel-glass, rgba(7, 7, 9, 0.65));
      border: 1px solid var(--block-border, rgba(255, 255, 255, 0.08));
      border-radius: var(--block-radius, 16px);
      backdrop-filter: var(--panel-blur, blur(24px));
      -webkit-backdrop-filter: var(--panel-blur, blur(24px));
    "
  >
    <!-- Top Header: Identity & Mode Controls -->
    <header class="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-white/[0.015] gap-3 shrink-0 flex-wrap">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center shrink-0">
          <Activity class="w-4 h-4 text-rose-400" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold tracking-normal text-white">Autonomous Reactor Core</h2>
            <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50">
              v1.1.0
            </span>
          </div>
          <p class="text-[11px] text-white/40 font-normal">Панель управления и статусная визуализация реактора</p>
        </div>
      </div>

      <!-- State Badge & Quick Metrics -->
      <div class="flex items-center gap-2">
        <div 
          class="flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium font-sans"
          :class="stateMeta.badgeClass"
        >
          <span class="w-2 h-2 rounded-full shrink-0" :class="stateMeta.dotClass"></span>
          <span>{{ stateMeta.label }}</span>
        </div>

        <button 
          @click="triggerDiagnosticPulse"
          class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white/80 hover:text-white transition cursor-pointer active:scale-95"
          :title="'Инициировать диагностический импульс ядра'"
        >
          <Zap class="w-3.5 h-3.5 text-amber-400 shrink-0" :class="isPinging ? 'animate-spin' : ''" />
          <span>{{ timelineLatency || lastPingLatency }}мс</span>
        </button>
      </div>
    </header>

    <!-- Sub-Nav & Mode Switcher Bar -->
    <div class="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-black/20 gap-3 shrink-0 flex-wrap">
      <!-- Tabs -->
      <nav class="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
        <button 
          v-for="tab in tabList" 
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer"
          :class="activeTab === tab.id ? 'bg-white/15 text-white shadow-sm' : 'text-white/50 hover:text-white'"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Visualizer Mode Pills (Only on overview tab) -->
      <div v-if="activeTab === 'overview'" class="flex items-center gap-1 text-[11px] font-mono text-white/50">
        <span class="mr-1 hidden sm:inline text-white/40">Визуализатор:</span>
        <button 
          v-for="mode in visualizerModes" 
          :key="mode.id"
          @click="visualizerMode = mode.id"
          class="px-2 py-0.5 rounded border transition cursor-pointer"
          :class="visualizerMode === mode.id 
            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' 
            : 'border-white/5 hover:border-white/15 text-white/40 hover:text-white'"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto no-scrollbar p-5 flex flex-col gap-5">
      <!-- TAB 1: OVERVIEW & DYNAMIC VISUALIZER -->
      <template v-if="activeTab === 'overview'">
        <!-- Dynamic Visualizer Stage -->
        <div 
          class="relative w-full rounded-2xl overflow-hidden flex flex-col items-center justify-center p-6 border border-white/5 transition-all shadow-xl"
          style="background: radial-gradient(circle at center, rgba(239,68,68,0.06) 0%, rgba(0,0,0,0.4) 70%); min-height: 240px;"
        >
          <!-- MODE: HARMONIC RINGS -->
          <div v-if="visualizerMode === 'harmonics'" class="relative w-48 h-48 flex items-center justify-center">
            <!-- Outer Gyro Ring (rotates with CPU load) -->
            <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
              <circle 
                cx="50" cy="50" r="46" 
                fill="none" 
                stroke="rgba(255,255,255,0.08)" 
                stroke-width="1.5" 
              />
              <circle 
                cx="50" cy="50" r="46" 
                fill="none" 
                :stroke="stateMeta.color" 
                stroke-width="1.5" 
                stroke-dasharray="16 32"
                :style="{ transformOrigin: '50% 50%', transform: `rotate(${animTime * 40 * loadSpeed}deg)` }"
              />
            </svg>

            <!-- Middle Ring (rotates opposite) -->
            <svg class="absolute inset-4 w-40 h-40 pointer-events-none" viewBox="0 0 100 100">
              <circle 
                cx="50" cy="50" r="42" 
                fill="none" 
                stroke="rgba(255,255,255,0.12)" 
                stroke-width="1" 
                stroke-dasharray="6 8"
                :style="{ transformOrigin: '50% 50%', transform: `rotate(-${animTime * 25}deg)` }"
              />
            </svg>

            <!-- Inner Pulsing Core Aura -->
            <div 
              class="w-24 h-24 rounded-full flex flex-col items-center justify-center text-center transition-transform duration-300"
              :style="{
                background: `radial-gradient(circle, ${stateMeta.color}33 0%, transparent 70%)`,
                transform: `scale(${1 + (ramPulse - 1) * 0.25})`,
                boxShadow: `0 0 32px ${stateMeta.color}33`
              }"
            >
              <span class="text-2xl font-black font-mono text-white tracking-tight">{{ compositeLoad }}%</span>
              <span class="text-[9px] font-mono uppercase tracking-wider text-white/60">НАГРУЗКА</span>
            </div>
          </div>

          <!-- MODE: DYNAMIC WAVEFORM -->
          <div v-else-if="visualizerMode === 'waveform'" class="w-full flex flex-col items-center gap-4 py-4">
            <svg class="w-full max-w-md h-20 overflow-visible" viewBox="0 0 280 60">
              <defs>
                <linearGradient id="waveGlow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" :stop-color="stateMeta.color" stop-opacity="0.2" />
                  <stop offset="50%" :stop-color="stateMeta.color" stop-opacity="0.9" />
                  <stop offset="100%" :stop-color="stateMeta.color" stop-opacity="0.2" />
                </linearGradient>
              </defs>
              <line x1="0" y1="30" x2="280" y2="30" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4 4" />
              <path 
                :d="waveformPath" 
                fill="none" 
                stroke="url(#waveGlow)" 
                stroke-width="2.5" 
                stroke-linecap="round"
                class="transition-all duration-75"
              />
            </svg>
            <div class="flex items-center gap-6 font-mono text-xs text-white/60">
              <span>ГАРМОНИКА: {{ (loadSpeed * 2.4).toFixed(1) }} Hz</span>
              <span>ФЛЮКС: {{ compositeLoad }}%</span>
              <span>ОГИБАЮЩАЯ: {{ ramPulse.toFixed(2) }}x</span>
            </div>
          </div>

          <!-- MODE: SUBSYSTEM MATRIX FLOW -->
          <div v-else class="w-full max-w-lg grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-2">
            <div 
              v-for="node in matrixNodes" 
              :key="node.id"
              class="p-2.5 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col items-center text-center gap-1"
            >
              <component :is="node.icon" class="w-4 h-4" :class="node.active ? 'text-rose-400' : 'text-white/30'" />
              <span class="text-[10px] font-mono uppercase text-white/50">{{ node.title }}</span>
              <span class="text-xs font-semibold" :class="node.active ? 'text-white' : 'text-white/40'">{{ node.status }}</span>
            </div>
          </div>

          <!-- Live Status Bar under visualizer -->
          <div class="mt-4 flex items-center gap-6 text-xs text-white/60 flex-wrap justify-center font-mono">
            <span>CPU: <strong class="text-white">{{ cpuPercent }}%</strong></span>
            <span>RAM: <strong class="text-white">{{ ramPercent }}%</strong></span>
            <span>FPS: <strong class="text-white">{{ fpsValue }}</strong> ({{ frameTimeValue.toFixed(1) }}ms)</span>
            <span>ТЕМП: <strong class="text-white">{{ tempValue }}°C</strong></span>
          </div>
        </div>

        <!-- Metric Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <!-- Compute Vitals -->
          <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-2.5">
            <div class="flex items-center justify-between text-xs text-white/50">
              <span class="font-medium text-white/80">Вычислительное ядро</span>
              <Cpu class="w-3.5 h-3.5" />
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-xl font-mono font-bold text-white">{{ cpuPercent }}%</span>
              <span class="text-[11px] font-mono text-white/40">{{ info?.cores || 8 }} ядер</span>
            </div>
            <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-rose-500 rounded-full transition-all duration-300" :style="{ width: `${cpuPercent}%` }"></div>
            </div>
          </div>

          <!-- Neural Engine Vitals -->
          <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-2.5">
            <div class="flex items-center justify-between text-xs text-white/50">
              <span class="font-medium text-white/80">Нейросетевая модель</span>
              <Layers class="w-3.5 h-3.5" />
            </div>
            <div class="flex items-baseline justify-between truncate">
              <span class="text-sm font-mono font-bold text-white truncate" :title="activeModel">{{ activeModel }}</span>
            </div>
            <span class="text-[10px] font-mono text-emerald-400">Шлюз: {{ activeRoute?.target === 'cloud' ? 'CLOUD API' : 'LOCAL ONNX' }}</span>
          </div>

          <!-- Memory Vitals -->
          <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-2.5">
            <div class="flex items-center justify-between text-xs text-white/50">
              <span class="font-medium text-white/80">Память и состояние</span>
              <HardDrive class="w-3.5 h-3.5" />
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-xl font-mono font-bold text-white">{{ ramPercent }}%</span>
              <span class="text-[11px] font-mono text-white/40">{{ isEcoActive ? 'Эко-режим' : 'Штатный' }}</span>
            </div>
            <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-cyan-400 rounded-full transition-all duration-300" :style="{ width: `${ramPercent}%` }"></div>
            </div>
          </div>
        </div>
      </template>

      <!-- TAB 2: SUBSYSTEMS ARCHITECTURE -->
      <template v-else-if="activeTab === 'subsystems'">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div 
            v-for="sub in subsystemDetails" 
            :key="sub.name"
            class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-2"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <component :is="sub.icon" class="w-4 h-4 text-rose-400 shrink-0" />
                <span class="text-sm font-medium text-white">{{ sub.name }}</span>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                АКТИВЕН
              </span>
            </div>
            <p class="text-xs text-white/50 font-normal leading-relaxed">{{ sub.description }}</p>
            <div class="text-[11px] font-mono text-white/40 pt-1 border-t border-white/5 flex items-center justify-between">
              <span>{{ sub.metaKey }}</span>
              <span class="text-white/80">{{ sub.metaVal }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- TAB 3: TELEMETRY & METRICS -->
      <template v-else>
        <div class="flex flex-col gap-3.5">
          <div class="p-4 rounded-xl border border-white/5 bg-black/40 flex flex-col gap-3">
            <span class="text-xs font-semibold text-white/70 uppercase font-mono">Графика и Частота обновления сцены</span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div class="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <span class="text-[10px] font-mono text-white/40 uppercase block">FPS</span>
                <span class="text-xl font-bold font-mono text-rose-400">{{ fpsValue }}</span>
              </div>
              <div class="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <span class="text-[10px] font-mono text-white/40 uppercase block">Кадр</span>
                <span class="text-xl font-bold font-mono text-white">{{ frameTimeValue.toFixed(1) }}мс</span>
              </div>
              <div class="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <span class="text-[10px] font-mono text-white/40 uppercase block">Политика</span>
                <span class="text-xl font-bold font-mono text-white">{{ policy.mode }}</span>
              </div>
              <div class="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <span class="text-[10px] font-mono text-white/40 uppercase block">Отклик шины</span>
                <span class="text-xl font-bold font-mono text-emerald-400">{{ timelineLatency || 18 }}мс</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { 
  Activity, 
  Zap, 
  Cpu, 
  Layers, 
  HardDrive, 
  ShieldCheck, 
  Radio, 
  Mic, 
  Volume2, 
  Sparkles 
} from 'lucide-vue-next';
import { useReactorDashboard, type VisualizerMode, type DashboardTab } from './composables/useReactorDashboard';

const {
  visualizerMode,
  activeTab,
  isPinging,
  lastPingLatency,
  animTime,
  cpuPercent,
  ramPercent,
  fpsValue,
  frameTimeValue,
  tempValue,
  compositeLoad,
  loadSpeed,
  ramPulse,
  stateMeta,
  waveformPath,
  activeModel,
  activeRoute,
  timelineLatency,
  isListening,
  isEcoActive,
  policy,
  info,
  triggerDiagnosticPulse
} = useReactorDashboard();

const tabList: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'subsystems', label: 'Подсистемы' },
  { id: 'telemetry', label: 'Телеметрия' }
];

const visualizerModes: { id: VisualizerMode; label: string }[] = [
  { id: 'harmonics', label: 'Кольца' },
  { id: 'waveform', label: 'Волна' },
  { id: 'matrix', label: 'Матрица' }
];

const matrixNodes = computed(() => [
  { id: 'mic', title: 'Микрофон', status: isListening.value ? 'Слушает' : 'Стендбай', active: isListening.value, icon: Mic },
  { id: 'stt', title: 'STT Движок', status: 'Whisper / GigaAM', active: true, icon: Radio },
  { id: 'router', title: 'Маршрутизатор', status: activeRoute.value?.target === 'cloud' ? 'Cloud API' : 'Local ONNX', active: true, icon: Sparkles },
  { id: 'tts', title: 'Синтез речи', status: 'Silero v5.6', active: stateMeta.value.label === 'Синтез речи', icon: Volume2 }
]);

const subsystemDetails = [
  {
    name: 'Нейросетевой маршрутизатор',
    icon: Sparkles,
    description: 'Определяет семантический контекст входящих запросов и направляет инференс на локальную ONNX модель или облачный шлюз.',
    metaKey: 'Инференс',
    metaVal: 'Аппаратный GPU / NPU'
  },
  {
    name: 'Речевой тракт (STT / TTS)',
    icon: Radio,
    description: 'Локальное распознавание шепота и команд через Whisper/GigaAM и мгновенная генерация живой русской речи через Silero TTS v5.6.',
    metaKey: 'Задержка',
    metaVal: '< 180 мс'
  },
  {
    name: 'Локальное хранилище и память',
    icon: HardDrive,
    description: 'Изолированная база данных SQLite для долговременных воспоминаний, контекста диалогов и задач.',
    metaKey: 'Движок',
    metaVal: 'better-sqlite3'
  },
  {
    name: 'Контур безопасности (Security)',
    icon: ShieldCheck,
    description: 'Защита от выхода за пределы рабочей директории (Path Traversal Protection) и безопасное выполнение команд.',
    metaKey: 'Статус',
    metaVal: 'Armed & Active'
  }
];
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
