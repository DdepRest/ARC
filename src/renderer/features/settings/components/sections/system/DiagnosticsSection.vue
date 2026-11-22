<template>
  <section id="section-diagnostics" class="scroll-mt-14 flex flex-col gap-6 text-[var(--arc-text-primary)]">
    <SettingsSectionHeader
      variant="workspace"
      categoryLabel="Система · Подсистема 03"
      title="Диагностика и логи"
      description="Тестирование 3 профилей графики (Eco → Balanced → Cinematic), пошаговая изоляция узких мест конвейера рендера (CPU/GPU) и журнал событий."
      :statusLabel="headerStatus.label"
      :statusTone="headerStatus.tone"
      blockCountText="3 функциональные группы"
      :icon="Activity"
    >
      <template #summary>
        <SettingsSummaryStrip :items="summaryItems" />
      </template>
    </SettingsSectionHeader>

    <div class="flex flex-col gap-7">
      <SettingsGroup
        indexLabel="01"
        title="Бенчмарк графики и изоляция узлов рендера"
        description="Автоподбор оптимального пресета и диагностика вклада 2D-canvas, освещения и частиц"
        :badgeText="isSweepRunning ? 'Выполняется замер' : `Рекомендовано: ${report.presets[report.recommendedPreset]?.labelRu || store.graphicsPreset}`"
      >
        <SettingsBlock
          title="Диагностика рендера: Профили графики и Узлы сцены"
          subtitle="Автоподбор оптимального профиля (Eco → Balanced → Cinematic) и изоляция 2D-canvas / PointLight / Частиц"
        >
          <SettingsRow
            id="system.diag.render_stage_mode"
            layout="stacked"
            label="Режим тестирования конвейера (window.__arcDiag)"
            description="«Профили графики» замеряет FPS на Eco → Balanced → Cinematic и выбирает лучший для GPU. «Изоляция узлов 1–4» проверяет вклад 2D-canvas, источников света и 3 слоёв частиц."
            data-search="диагностика рендера профили графики eco balanced cinematic замеры baseline pointlight частицы fps"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 w-full">
              <div class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[12px] border border-[var(--arc-hairline)]">
                <button type="button" :disabled="isSweepRunning" @click="benchmarkTab = 'presets'" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer disabled:opacity-50" :class="tabBtnClass(benchmarkTab === 'presets')">3 профиля (Eco–Cinematic)</button>
                <button type="button" :disabled="isSweepRunning" @click="benchmarkTab = 'subsystems'" class="px-2.5 py-1 rounded-[8px] text-xs font-mono transition cursor-pointer disabled:opacity-50" :class="tabBtnClass(benchmarkTab === 'subsystems')">Узлы 1–4 (2D / Свет)</button>
              </div>

              <button v-if="benchmarkTab === 'presets'" type="button" :disabled="isSweepRunning" @click="runPresetBenchmark()" class="px-3.5 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[rgba(var(--accent-rgb),0.45)] text-xs font-mono font-semibold text-[var(--accent)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50">
                {{ isSweepRunning && sweepCurrentPreset ? `Тест: ${sweepCurrentPreset} (${sweepRemainingSec} с)` : 'Тест 3 профилей (12 с)' }}
              </button>
              <button v-else type="button" :disabled="isSweepRunning" @click="runDiagnosticSweep()" class="px-3.5 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[rgba(var(--accent-rgb),0.45)] text-xs font-mono font-semibold text-[var(--accent)] hover:bg-[var(--arc-hover)] transition cursor-pointer disabled:opacity-50">
                {{ isSweepRunning && sweepCurrentStage ? `Этап ${sweepCurrentStage}/4 (${sweepRemainingSec} с)` : 'Автопрогон узлов 1–4 (16 с)' }}
              </button>
            </div>
          </SettingsRow>

          <div class="px-4 pb-4 pt-1 flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs text-[var(--arc-text-muted)] font-mono">
                {{ benchmarkTab === 'presets' ? 'РУЧНОЕ ПЕРЕКЛЮЧЕНИЕ ПРЕСЕТА ГРАФИКИ:' : 'РУЧНОЕ ПЕРЕКЛЮЧЕНИЕ ЭТАПА ИЗОЛЯЦИИ:' }}
              </span>

              <div v-if="benchmarkTab === 'presets'" class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button v-for="pId in presetIds" :key="pId" type="button" :disabled="isSweepRunning" @click="store.applyGraphicsPreset(pId)" class="px-2.5 py-1 rounded-[7px] text-xs font-mono transition cursor-pointer disabled:opacity-50" :class="tabBtnClass(store.graphicsPreset === pId)">
                  {{ report.presets[pId].labelRu }}
                </button>
              </div>
              <div v-else class="inline-flex flex-wrap gap-1 bg-[var(--arc-input)] p-1 rounded-[10px] border border-[var(--arc-hairline)]">
                <button v-for="opt in stageOptions" :key="String(opt.value)" type="button" :disabled="isSweepRunning" @click="setDiagnosticStage(opt.value)" class="px-2.5 py-1 rounded-[7px] text-xs font-mono transition cursor-pointer disabled:opacity-50" :class="tabBtnClass(activeStage === opt.value)">
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div v-if="isSweepRunning" class="w-full h-1.5 rounded-full bg-[var(--arc-plane)] overflow-hidden border border-[var(--arc-hairline)]">
              <div class="h-full bg-[var(--accent)] transition-all duration-200" :style="{ width: `${sweepProgressPercent}%` }"></div>
            </div>

            <div v-if="benchmarkTab === 'presets'" class="overflow-x-auto rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
              <table class="w-full text-left border-collapse font-mono text-xs tabular-nums">
                <thead>
                  <tr class="border-b border-[var(--arc-hairline)] text-[var(--arc-text-muted)]">
                    <th class="py-2 px-3 font-medium">Пресет графики</th>
                    <th class="py-2 px-3 font-medium">Параметры конвейера</th>
                    <th class="py-2 px-3 font-medium text-right">Средний FPS</th>
                    <th class="py-2 px-3 font-medium text-right">Min FPS</th>
                    <th class="py-2 px-3 font-medium text-right">Кадр (ms)</th>
                    <th class="py-2 px-3 font-medium text-right">3D CPU</th>
                    <th class="py-2 px-3 font-medium text-right">Частицы</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[var(--arc-hairline)]">
                  <tr v-for="pId in presetIds" :key="pId" class="transition-colors cursor-pointer" :class="store.graphicsPreset === pId ? 'bg-[var(--arc-selected)]' : 'hover:bg-[var(--arc-hover)]'" @click="!isSweepRunning && store.applyGraphicsPreset(pId)">
                    <td class="py-2 px-3 font-semibold text-[var(--arc-text-primary)] flex items-center gap-2">
                      <span>{{ report.presets[pId].labelRu }}</span>
                      <span v-if="report.recommendedPreset === pId" class="px-1.5 py-0.5 rounded-[5px] text-xs font-mono bg-[var(--arc-block)] text-[var(--status-ok)] border border-[var(--arc-hairline)]">ОПТИМУМ GPU</span>
                    </td>
                    <td class="py-2 px-3 font-sans text-xs text-[var(--arc-text-secondary)]">{{ report.presets[pId].configSummary }}</td>
                    <td class="py-2 px-3 text-right font-semibold" :class="report.presets[pId].avgFps >= 45 ? 'text-[var(--status-ok)]' : report.presets[pId].avgFps >= 28 ? 'text-[var(--arc-text-primary)]' : 'text-[var(--status-warn)]'">{{ report.presets[pId].avgFps }} fps</td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-secondary)]">{{ report.presets[pId].minFps }} fps</td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-secondary)]">{{ report.presets[pId].frameTimeMs.toFixed(1) }} ms</td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-secondary)]">{{ report.presets[pId].threeUpdateTimeMs.toFixed(1) }} ms</td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-primary)]">{{ report.presets[pId].particleCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="overflow-x-auto rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)]">
              <table class="w-full text-left border-collapse font-mono text-xs tabular-nums">
                <thead>
                  <tr class="border-b border-[var(--arc-hairline)] text-[var(--arc-text-muted)]">
                    <th class="py-2 px-3 font-medium">Этап изоляции</th>
                    <th class="py-2 px-3 font-medium">Конфигурация узлов</th>
                    <th class="py-2 px-3 font-medium text-right">FPS</th>
                    <th class="py-2 px-3 font-medium text-right">Кадр (ms)</th>
                    <th class="py-2 px-3 font-medium text-right">Дельта шага</th>
                    <th class="py-2 px-3 font-medium text-right">3D CPU</th>
                    <th class="py-2 px-3 font-medium text-right">Частицы</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[var(--arc-hairline)]">
                  <tr v-for="st in ([1, 2, 3, 4] as const)" :key="st" class="transition-colors" :class="activeStage === st ? 'bg-[var(--arc-selected)]' : 'hover:bg-[var(--arc-hover)]'">
                    <td class="py-2 px-3 font-semibold text-[var(--arc-text-primary)]">{{ report.stages[st].name }}</td>
                    <td class="py-2 px-3 font-sans text-xs text-[var(--arc-text-secondary)]">{{ report.stages[st].configSummary }}</td>
                    <td class="py-2 px-3 text-right font-semibold text-[var(--arc-text-primary)]">{{ report.stages[st].avgFps }} fps</td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-secondary)]">{{ report.stages[st].frameTimeMs.toFixed(1) }} ms</td>
                    <td class="py-2 px-3 text-right">
                      <span v-if="st === 1" class="text-[var(--arc-text-muted)]">Эталон</span>
                      <span v-else-if="st === 2" :class="report.deltas.fps2vs1 >= 0 ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">{{ formatDelta(report.deltas.fps2vs1, 'fps') }} · {{ formatDelta(report.deltas.ms2vs1, 'ms') }}</span>
                      <span v-else-if="st === 3" :class="report.deltas.fps3vs2 >= 0 ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">{{ formatDelta(report.deltas.fps3vs2, 'fps') }} · {{ formatDelta(report.deltas.ms3vs2, 'ms') }}</span>
                      <span v-else :class="Math.abs(report.deltas.ms4vs3) <= 1.2 ? 'text-[var(--status-ok)]' : 'text-[var(--status-warn)]'">{{ formatDelta(report.deltas.fps4vs3, 'fps') }} · {{ formatDelta(report.deltas.ms4vs3, 'ms') }}</span>
                    </td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-secondary)]">{{ report.stages[st].threeUpdateTimeMs.toFixed(1) }} ms</td>
                    <td class="py-2 px-3 text-right text-[var(--arc-text-primary)]">{{ report.stages[st].particleCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="rounded-[12px] border border-[var(--arc-hairline)] bg-[var(--arc-plane)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex flex-col gap-1">
                <div class="text-xs font-mono font-semibold text-[var(--accent)]">{{ benchmarkTab === 'presets' ? report.presetVerdict : report.appliedProfile.summary }}</div>
                <div class="text-xs text-[var(--arc-text-secondary)] leading-relaxed">{{ report.bottleneckVerdict }}</div>
              </div>
              <button type="button" @click="handleCopyDiagJson" class="shrink-0 px-3 py-1.5 rounded-[10px] bg-[var(--arc-block)] border border-[var(--arc-hairline)] text-xs font-mono text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition cursor-pointer">
                {{ isDiagJsonCopied ? '✓ JSON скопирован' : 'Копировать замеры JSON' }}
              </button>
            </div>
          </div>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        indexLabel="02"
        title="Мониторинг вычислительных ресурсов"
        description="Живая телеметрия нагрузки процессора, оперативной памяти и процесса приложения"
        :badgeText="hasLiveMetrics ? `CPU ${cpuPercent}% · RAM ${ramPercent}%` : 'Ожидание замера'"
      >
        <SettingsBlock title="Текущее состояние системы" subtitle="Живая телеметрия ресурсов">
          <SettingsRow
            id="system.diag.status"
            label="Текущее состояние"
            description="Актуальная нагрузка вычислительного контура и потребление оперативной памяти."
            :tech="telemetryTechText"
            data-search="текущее состояние системы cpu ram память нагрузка процесс rss"
          >
            <div class="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs tabular-nums">
              <span class="px-2.5 py-1 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)]">CPU {{ hasLiveMetrics ? `${cpuPercent}%` : '—' }}</span>
              <span class="px-2.5 py-1 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-primary)]">RAM {{ hasLiveMetrics ? `${ramPercent}%` : '—' }}</span>
              <span class="px-2.5 py-1 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-[var(--arc-text-secondary)]">RSS {{ processRssText }}</span>
            </div>
          </SettingsRow>
          <SettingsRow
            id="system.diag.db_engine"
            label="Движок базы данных"
            description="Фактический режим хранения, персистентность и поддержка транзакций."
            :tech="dbDiagTech"
            data-search="движок базы данных sqlite json degraded safe mode acid rollback ограничения"
          >
            <span class="px-2.5 py-1 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono shrink-0" :class="dbDiagToneClass">
              {{ dbDiagBadge }}
            </span>
          </SettingsRow>
          <SettingsRow
            id="system.diag.build_meta"
            label="Версия и сборка артефакта"
            description="Идентификатор установленной версии A.R.C. и коммита сборки для трассируемости диагностики."
            :tech="buildMetaTech"
            data-search="версия сборка commit sha build metadata артефакт диагностика"
          >
            <span class="px-2.5 py-1 rounded-[8px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono tabular-nums shrink-0 text-[var(--arc-text-primary)]">
              {{ buildIdentityText }}
            </span>
          </SettingsRow>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup
        indexLabel="03"
        title="Инженерный экспорт и отладочные логи"
        description="Выгрузка диагностических слепков, системных журналов и консольной телеметрии FPS"
        :badgeText="store.logFpsToConsole ? 'FPS Лог Вкл' : 'Штатный режим'"
      >
        <SettingsBlock title="Журнал и Отчёт об ошибках" subtitle="Инженерный экспорт">
          <SettingsRow
            id="system.diag.copy_report"
            label="Выгрузка диагностического отчёта"
            description="Формирует технический отчёт о конфигурации, статусах моделей и ошибках для разработчиков."
            data-search="выгрузка диагностического отчета report copy diagnostics логи ошибки техподдержка"
          >
            <button type="button" @click="handleCopyReport" class="px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono font-medium text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-all duration-200 flex items-center gap-1.5 cursor-pointer">
              <FileText class="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{{ isCopied ? '✓ Скопировано' : 'Скопировать отчёт' }}</span>
            </button>
          </SettingsRow>

          <SettingsRow
            id="system.diag.export_logs"
            label="Экспорт логов в файл"
            description="Сохранить файл логов на рабочий стол."
            data-search="экспорт логов в файл logs export diagnostics log скачать логи"
          >
            <button type="button" @click="exportPerformanceLogs" class="px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono font-medium text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-all duration-200 cursor-pointer">
              Скачать arc-diagnostics.log
            </button>
          </SettingsRow>

          <SettingsRow
            id="system.diag.export_json"
            label="Экспорт полного отчёта (JSON)"
            description="Сохранить файл системной диагностики (ОС, GPU, БД, планировщик) через системный диалог."
            data-search="экспорт диагностики json диагностический отчет system:export-diagnostics"
          >
            <button type="button" :disabled="isExportingDiag" @click="handleExportDiagnostics" class="px-4 py-1.5 rounded-[10px] bg-[var(--arc-plane)] border border-[var(--arc-hairline)] text-xs font-mono font-medium text-[var(--arc-text-primary)] hover:bg-[var(--arc-hover)] transition-all duration-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Download class="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{{ isExportingDiag ? 'Экспорт...' : 'Скачать отчёт JSON' }}</span>
            </button>
          </SettingsRow>

          <SettingsRow
            id="system.diag.fps_log"
            label="Логирование FPS в консоль разработчика"
            description="Выводить замеры производительности в DevTools раз в 5 секунд."
            data-search="логирование fps в консоль разработчика devtools fps log console замеры"
          >
            <ArcToggle v-model="store.logFpsToConsole" />
          </SettingsRow>
        </SettingsBlock>
      </SettingsGroup>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../../../stores/settings.store';
import { useSystemStore } from '../../../../../stores/system.store';
import { usePerformanceTest } from '../../../composables/usePerformanceTest';
import { useRenderBottleneckDiag, type DiagnosticStageMode, type BenchmarkedPresetId } from '../../../composables/useRenderBottleneckDiag';
import SettingsSectionHeader from '../../SettingsSectionHeader.vue';
import SettingsGroup from '../../primitives/SettingsGroup.vue';
import SettingsSummaryStrip, { type SummaryStripItem } from '../../primitives/SettingsSummaryStrip.vue';
import SettingsBlock from '../../primitives/SettingsBlock.vue';
import SettingsRow from '../../primitives/SettingsRow.vue';
import ArcToggle from '../../../../../components/ui/ArcToggle.vue';
import { Activity, FileText, Download } from 'lucide-vue-next';
import { buildDbStoragePresentation, type DbEngineStatusInfo } from './storage-db-presentation';
import { formatBuildIdentity, getRuntimeBuildMetadata, UNKNOWN_BUILD_COMMIT } from '../../../../../../shared/config/build-metadata';

const store = useSettingsStore();
const systemStore = useSystemStore();
const { copyTestResults, exportPerformanceLogs } = usePerformanceTest();
const {
  benchmarkTab, activeStage, isSweepRunning, sweepCurrentStage, sweepCurrentPreset,
  sweepProgressPercent, sweepRemainingSec, report, setDiagnosticStage, runDiagnosticSweep, runPresetBenchmark,
} = useRenderBottleneckDiag();

const presetIds: BenchmarkedPresetId[] = ['Eco', 'Balanced', 'Cinematic'];
const stageOptions: Array<{ value: DiagnosticStageMode; label: string }> = [
  { value: 'auto', label: 'Авто (Оптимум)' },
  { value: 1, label: '1 · Baseline' },
  { value: 2, label: '2 · No-2D' },
  { value: 3, label: '3 · No-Lights' },
  { value: 4, label: '4 · Particles' },
];

function tabBtnClass(active: boolean) {
  return active
    ? 'bg-[var(--arc-selected)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.4)] font-semibold'
    : 'text-[var(--arc-text-muted)] hover:text-[var(--arc-text-primary)] border border-transparent';
}

const isCopied = ref(false);
const isDiagJsonCopied = ref(false);

function formatDelta(val: number, unit: 'fps' | 'ms'): string {
  return `${val > 0 ? '+' : ''}${val} ${unit}`;
}

function handleCopyDiagJson() {
  const json = JSON.stringify(report.value, null, 2);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).catch(() => {});
  }
  isDiagJsonCopied.value = true;
  setTimeout(() => { isDiagJsonCopied.value = false; }, 2000);
}

const hasLiveMetrics = computed(() => Boolean(systemStore.metrics));
const cpuPercent = computed<number | null>(() =>
  hasLiveMetrics.value ? Math.round(systemStore.metrics?.cpuLoad ?? 0) : null
);
const ramPercent = computed<number | null>(() =>
  hasLiveMetrics.value ? Math.round(systemStore.metrics?.memoryUsage ?? 0) : null
);
const processRssText = computed(() => {
  const usedMb = systemStore.metrics?.memoryUsedMb;
  return typeof usedMb === 'number' && usedMb > 0 ? `${(usedMb / 1024).toFixed(1)} ГБ` : 'Н/Д';
});
const telemetryTechText = computed(() =>
  hasLiveMetrics.value
    ? `CPU: ${cpuPercent.value}% · RAM: ${ramPercent.value}% · Process RSS: ${processRssText.value}`
    : 'Ожидание живых метрик от systemStore'
);

const headerStatus = computed(() => {
  if (isSweepRunning.value) return { label: 'ТЕСТ АКТИВЕН', tone: 'warn' as const };
  if (hasLiveMetrics.value) return { label: 'ТЕЛЕМЕТРИЯ АКТИВНА', tone: 'ok' as const };
  return { label: 'ОЖИДАНИЕ ЗАМЕРА', tone: 'off' as const };
});

const summaryItems = computed<SummaryStripItem[]>(() => [
  { label: 'Нагрузка CPU', value: cpuPercent.value !== null ? `${cpuPercent.value}%` : '—', tone: cpuPercent.value === null ? 'off' : cpuPercent.value < 80 ? 'ok' : 'warn', detail: hasLiveMetrics.value ? 'Вычислительный контур' : 'Ожидание замера' },
  { label: 'Память RAM', value: ramPercent.value !== null ? `${ramPercent.value}%` : '—', tone: ramPercent.value === null ? 'off' : ramPercent.value < 85 ? 'ok' : 'warn', detail: `RSS: ${processRssText.value}` },
  { label: 'Режим бенчмарка', value: benchmarkTab.value === 'presets' ? '3 профиля' : 'Узлы 1–4', tone: isSweepRunning.value ? 'warn' : 'default', detail: isSweepRunning.value ? 'Идёт замер...' : 'Готов к запуску' },
  { label: 'Логирование FPS', value: store.logFpsToConsole ? 'Включено' : 'Отключено', tone: store.logFpsToConsole ? 'accent' : 'off', detail: 'Консоль DevTools' },
]);

const dbStatus = ref<DbEngineStatusInfo | null>(null);
const dbDiagPres = computed(() => buildDbStoragePresentation(dbStatus.value, Boolean(dbStatus.value?.engine)));
const dbDiagBadge = computed(() => dbDiagPres.value.diagBadge);
const dbDiagToneClass = computed(() => {
  if (!dbStatus.value?.engine) return 'text-[var(--arc-text-muted)]';
  return dbDiagPres.value.safeMode || dbDiagPres.value.degraded ? 'text-[var(--status-warn)]' : 'text-[var(--status-ok)]';
});
const dbDiagTech = computed(() => dbDiagPres.value.diagTech);

const runtimeAppVersion = ref<string | undefined>(undefined);
const buildMeta = computed(() => getRuntimeBuildMetadata(runtimeAppVersion.value));
const buildIdentityText = computed(() => formatBuildIdentity(buildMeta.value));
const buildMetaTech = computed(() =>
  buildMeta.value.commit === UNKNOWN_BUILD_COMMIT
    ? `Версия: v${buildMeta.value.version} · Commit: unknown (локальная сборка без Git SHA)`
    : `Версия: v${buildMeta.value.version} · Commit: ${buildMeta.value.commit} · Источник: ${buildMeta.value.commitSource}`
);

onMounted(() => {
  if (!systemStore.isReady && typeof systemStore.initialize === 'function') systemStore.initialize();
  else if (typeof systemStore.fetchMetricsNow === 'function') systemStore.fetchMetricsNow();
  const api = typeof window !== 'undefined' ? (window as any).api : null;
  if (typeof api?.getDbStatus === 'function') {
    api.getDbStatus().then((res: any) => { dbStatus.value = res || null; }).catch(() => {});
  }
  if (typeof api?.getVersion === 'function') {
    api.getVersion().then((v: any) => { if (typeof v === 'string' && v.trim()) runtimeAppVersion.value = v.trim(); }).catch(() => {});
  }
});

function handleCopyReport() {
  copyTestResults();
  isCopied.value = true;
  setTimeout(() => { isCopied.value = false; }, 2000);
}

const isExportingDiag = ref(false);
async function handleExportDiagnostics() {
  if (isExportingDiag.value) return;
  if (!window.api || typeof (window.api as any).exportDiagnostics !== 'function') return;
  isExportingDiag.value = true;
  try {
    await (window.api as any).exportDiagnostics();
  } catch (err) {
    console.warn('Diagnostics export error:', err);
  } finally {
    isExportingDiag.value = false;
  }
}
</script>
