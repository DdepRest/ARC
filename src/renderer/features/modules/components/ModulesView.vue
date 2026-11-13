<template>
  <div class="h-full flex flex-col relative z-10 w-full select-none overflow-hidden bg-[var(--arc-plane)] text-[var(--arc-text-primary)]">
    <!-- Header -->
    <header 
      class="flex flex-wrap items-center justify-between px-4 sm:px-8 py-4 border-b border-[var(--arc-hairline)] shrink-0 gap-4 bg-[var(--arc-plane)]"
      :style="{ backgroundImage: 'var(--arc-sheen)' }"
    >
      <div class="flex items-center gap-3.5 min-w-[200px]">
        <button
          @click="uiStore.setActiveTab('core')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--arc-hairline)] bg-[var(--arc-block)] text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-colors cursor-pointer text-xs font-mono font-semibold uppercase tracking-wider shrink-0 group"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.55)' }"
          title="Вернуться к 3D-Ядру (Esc)"
          data-testid="modules-exit-to-core"
        >
          <ArrowLeft class="w-3.5 h-3.5 text-[var(--accent)] group-hover:-translate-x-0.5 transition-transform" />
          <span>К Ядру</span>
        </button>
        <div 
          class="w-9 h-9 rounded-[12px] flex items-center justify-center p-2 shrink-0 bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-[var(--accent)] relative overflow-hidden"
          :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 16px rgba(0, 0, 0, 0.65)' }"
        >
          <Cpu class="w-4 h-4 relative z-10" />
        </div>
        <div class="min-w-0">
          <h1 class="font-sans font-semibold text-[15px] text-[var(--arc-text-primary)] tracking-normal truncate">
            Архитектура модулей
          </h1>
          <p class="font-mono text-xs text-[var(--arc-text-muted)] tracking-normal mt-0.5 truncate">
            Системные подсистемы и компоненты A.R.C.
          </p>
        </div>
      </div>

      <!-- Search & Segment Filter Tabs -->
      <div class="flex flex-wrap items-center gap-4">
        <!-- Search Input -->
        <div class="relative w-48 sm:w-60">
          <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--arc-text-muted)]" />
          <input
            v-model="searchFilter"
            type="text"
            placeholder="Поиск модуля..."
            class="w-full bg-[var(--arc-input)] border border-[var(--arc-hairline)] focus:border-[var(--accent)] rounded-[10px] pl-9 pr-3 py-1.5 text-xs text-[var(--arc-text-primary)] placeholder:text-[var(--arc-text-muted)] font-mono outline-none transition-colors"
            :style="{ boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.70)' }"
          />
        </div>

        <!-- Segment Filter Tabs (12px/600/UPPER/mono/tracking .10em, 2px bottom line, no fill) -->
        <div class="flex items-center gap-5 border-b border-transparent shrink-0 px-1">
          <button
            type="button"
            @click="activeFilter = 'all'"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none"
            :class="activeFilter === 'all' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            Все
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ modulesList.length }})</span>
            <div v-if="activeFilter === 'all'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>

          <button
            type="button"
            @click="activeFilter = 'active'"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none flex items-center gap-1.5"
            :class="activeFilter === 'active' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
            Работающие
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ activeModules.length }})</span>
            <div v-if="activeFilter === 'active'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>

          <button
            type="button"
            @click="activeFilter = 'calibrating'"
            class="relative pb-1.5 text-xs font-mono font-semibold uppercase tracking-[0.10em] transition-colors cursor-pointer focus:outline-none flex items-center gap-1.5"
            :class="activeFilter === 'calibrating' ? 'text-[var(--arc-text-primary)]' : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)]'"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
            Запланировано в v1.1
            <span class="text-xs font-mono text-[var(--arc-text-muted)] ml-1 tabular-nums">({{ calibratingModules.length }})</span>
            <div v-if="activeFilter === 'calibrating'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-full"></div>
          </button>
        </div>
      </div>
    </header>

    <!-- Content Area: Modules Grid -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8 space-y-8">
      
      <!-- Section 1: Active & Working Modules -->
      <section v-if="filteredActiveModules.length > 0">
        <div class="flex items-center justify-between mb-3.5">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
            <h2 class="text-xs font-mono uppercase tracking-wider text-[var(--status-ok)] font-semibold">
              Работающие модули ({{ filteredActiveModules.length }})
            </h2>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] hidden sm:inline">Готовы к операционной работе</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <!-- Tactile Obsidian Module Card -->
          <div 
            v-for="mod in filteredActiveModules" 
            :key="mod.id"
            class="flex flex-col justify-between border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] transition-colors p-4 group relative overflow-hidden select-none"
            :style="{
              background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.72)'
            }"
          >
            <div class="flex flex-col gap-2.5 relative z-10">
              <div class="flex items-center justify-between">
                <div 
                  class="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[var(--arc-plane)] border border-[var(--arc-hairline)]"
                  :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
                >
                  <component :is="mod.icon" class="w-4 h-4 text-[var(--accent)]" />
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)]"></span>
                  <span class="text-xs font-mono uppercase text-[var(--status-ok)] tracking-wider">{{ mod.statusLabel || 'ONLINE' }}</span>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-sans font-medium text-[var(--arc-text-primary)] truncate">
                  {{ mod.name }}
                </h3>
                <p class="text-xs font-sans text-[var(--arc-text-hint)] mt-1 leading-relaxed line-clamp-2">
                  {{ mod.desc }}
                </p>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-[var(--arc-hairline)] flex items-center justify-between relative z-10">
              <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate max-w-[140px]">
                {{ mod.subsystem }}
              </span>
              <button 
                @click="openModuleTab(mod.targetTab)"
                class="flex items-center gap-1.5 text-xs font-sans font-medium text-[var(--arc-text-primary)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] px-3 py-1 rounded-[8px] transition cursor-pointer"
                :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)' }"
              >
                <span>Открыть модуль</span>
                <ArrowRight class="w-3 h-3 text-[var(--accent)]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Calibrating & Planned Modules -->
      <section v-if="filteredCalibratingModules.length > 0">
        <div class="flex items-center justify-between mb-3.5">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
            <h2 class="text-xs font-mono uppercase tracking-wider text-[var(--status-warn)] font-semibold">
              Запланировано в v1.1 ({{ filteredCalibratingModules.length }})
            </h2>
          </div>
          <span class="text-xs font-mono text-[var(--arc-text-muted)] hidden sm:inline">Требуют интеграции или ресурсов</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div 
            v-for="mod in filteredCalibratingModules" 
            :key="mod.id"
            class="flex flex-col justify-between border border-[var(--arc-hairline)] rounded-[16px] bg-[var(--arc-block)] hover:bg-[var(--arc-hover)] transition-colors p-4 group relative overflow-hidden select-none"
            :style="{
              background: 'linear-gradient(180deg, #121212 0%, #0D0D0D 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 32px rgba(0, 0, 0, 0.72)'
            }"
          >
            <div class="flex flex-col gap-2.5 relative z-10">
              <div class="flex items-center justify-between">
                <div 
                  class="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[var(--arc-plane)] border border-[var(--arc-hairline)]"
                  :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
                >
                  <component :is="mod.icon" class="w-4 h-4 text-[var(--arc-text-muted)]" />
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-[var(--status-warn)]"></span>
                  <span class="text-xs font-mono uppercase text-[var(--status-warn)] tracking-wider">Запланировано в v1.1</span>
                </div>
              </div>

              <div>
                <h3 class="text-sm font-sans font-medium text-[var(--arc-text-primary)] truncate">
                  {{ mod.name }}
                </h3>
                <p class="text-xs font-sans text-[var(--arc-text-hint)] mt-1 leading-relaxed line-clamp-2">
                  {{ mod.desc }}
                </p>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-[var(--arc-hairline)] flex items-center justify-between relative z-10">
              <span class="text-xs font-mono text-[var(--arc-text-muted)] truncate max-w-[140px]">
                {{ mod.subsystem }}
              </span>
              <span
                v-if="mod.status === 'calibrating' && !mod.targetTab"
                class="flex items-center gap-1.5 text-xs font-mono text-[var(--arc-text-muted)] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] px-3 py-1 rounded-[8px] cursor-not-allowed select-none"
                aria-disabled="true"
              >
                Запланировано в v1.1
              </span>
              <button
                v-else
                @click="openModuleTab(mod.targetTab)"
                class="flex items-center gap-1.5 text-xs font-sans font-medium text-[var(--arc-text-primary)] bg-[var(--arc-plane)] hover:bg-[var(--arc-hover)] border border-[var(--arc-hairline)] px-3 py-1 rounded-[8px] transition cursor-pointer"
                :style="{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }"
              >
                <span>Открыть модуль</span>
                <ArrowRight class="w-3 h-3 text-[var(--accent)]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Empty state if search returns nothing -->
      <div v-if="filteredActiveModules.length === 0 && filteredCalibratingModules.length === 0" class="py-16 text-center">
        <Cpu class="w-10 h-10 text-[var(--arc-text-muted)] mx-auto mb-3 opacity-40" />
        <p class="text-xs font-mono text-[var(--arc-text-muted)]">Модули по запросу "{{ searchFilter }}" не найдены</p>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUIStore } from '../../../stores/ui.store';
import type { TabName } from '../../../../shared/types/ui';
import { Cpu, Box, Wrench, GraduationCap, Layout, Workflow, Activity, Terminal, Database, MessageSquare, ListTodo, Layers, ArrowRight, ArrowLeft, Radio, Search } from 'lucide-vue-next';

const uiStore = useUIStore();
const activeFilter = ref<'all' | 'active' | 'calibrating'>('all');
const searchFilter = ref('');

interface ModuleItem {
  id: string;
  name: string;
  desc: string;
  icon: any;
  status: 'active' | 'calibrating';
  statusLabel?: string;
  subsystem: string;
  targetTab?: TabName;
}

const modulesList: ModuleItem[] = [
  { id: 'ai-chat', name: 'Когнитивный диалог', desc: 'Основной канал взаимодействия с ИИ-ядром, стриминг ответов, переключение моделей.', icon: MessageSquare, status: 'active', subsystem: 'Cognitive Engine', targetTab: 'chat' },
  { id: 'memory-engine', name: 'Когнитивная память', desc: 'Векторная и реляционная база фактов, предпочтений пользователя и истории сессий.', icon: Database, status: 'active', subsystem: 'Memory Subsystem', targetTab: 'memory' },
  { id: 'tasks-engine', name: 'Операционные задачи', desc: 'Управление активными задачами, спринтами, таймерами отдыха и расписанием.', icon: ListTodo, status: 'active', subsystem: 'Execution Scheduler', targetTab: 'tasks' },
  { id: 'strategic-objectives', name: 'Стратегические цели', desc: 'Долгосрочное целеполагание, декомпозиция глобальных задач системы и трекинг OKR.', icon: Layers, status: 'active', subsystem: 'Planning Unit', targetTab: 'objectives' },
  { id: 'speech-stt', name: 'Речевой контур (STT & TTS)', desc: 'Silero v5.6 и Sherpa ONNX для синтеза и распознавания речи с шумоподавлением.', icon: Radio, status: 'active', subsystem: 'Voice DSP Core', targetTab: 'transcription' },
  { id: 'skills', name: 'Процедурные навыки', desc: 'Реестр навыков A.R.C. с обучением новым триггерам, фразам и процедурным алгоритмам.', icon: GraduationCap, status: 'active', subsystem: 'Skills Registry', targetTab: 'commands' },
  { id: 'scenarios', name: 'Сценарии и макросы', desc: 'Графический редактор логики на графах и библиотека системных сценариев автоматизации.', icon: Workflow, status: 'active', subsystem: 'Graph Workflow', targetTab: 'commands' },
  { id: 'observability', name: 'Наблюдаемость и телеметрия', desc: 'Комплексный мониторинг системной нагрузки, памяти VRAM/RAM и логов безопасности.', icon: Activity, status: 'active', subsystem: 'Telemetry Core', targetTab: 'vision' },
  { id: 'perf-isolation', name: 'Изоляция производительности', desc: 'Управление политикой визуальной нагрузки (Active, Background, Game Mode) без задержек.', icon: Activity, status: 'active', subsystem: 'Performance Core', targetTab: 'settings' },
  { id: 'orchestrator', name: 'Оркестратор процессов', desc: 'Маршрутизация вызовов между пулами локальных (Ollama) и облачных нейросетей.', icon: Cpu, status: 'active', statusLabel: 'Маршрутизация в Settings', subsystem: 'Orchestration Unit', targetTab: 'settings' },
  { id: 'agents', name: 'Автономные агенты', desc: 'Пул субагентов (Planner, Writer, Critic, Auditor) для параллельных процессов.', icon: Box, status: 'calibrating', subsystem: 'Agent Swarm' },
  { id: 'tools-mcp', name: 'MCP & системные утилиты', desc: 'Протокол интеграции внешних инструментов Model Context Protocol для работы с ОС.', icon: Wrench, status: 'calibrating', subsystem: 'Tool Bridge' },
  { id: 'architecture', name: 'Архитектурный дизайн', desc: 'Интерактивная визуализация связей компонентов ядра и мониторинг шины событий.', icon: Layout, status: 'calibrating', subsystem: 'Core Topology' },
  { id: 'sandbox', name: 'Песочница экспериментов', desc: 'Изолированное окружение для безопасного запуска скриптов и отладки промптов.', icon: Terminal, status: 'calibrating', subsystem: 'Sandbox Engine' }
];

const activeModules = computed(() => modulesList.filter(m => m.status === 'active'));
const calibratingModules = computed(() => modulesList.filter(m => m.status === 'calibrating'));

const filteredActiveModules = computed(() => {
  if (activeFilter.value === 'calibrating') return [];
  const q = searchFilter.value.trim().toLowerCase();
  return activeModules.value.filter(m => 
    !q || m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.subsystem.toLowerCase().includes(q)
  );
});

const filteredCalibratingModules = computed(() => {
  if (activeFilter.value === 'active') return [];
  const q = searchFilter.value.trim().toLowerCase();
  return calibratingModules.value.filter(m => 
    !q || m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.subsystem.toLowerCase().includes(q)
  );
});

const openModuleTab = (tab?: TabName) => { if (tab) uiStore.setActiveTab(tab); };
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
