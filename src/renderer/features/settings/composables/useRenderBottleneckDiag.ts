import { ref, computed } from 'vue';
import { useUIStore } from '../../../stores/ui.store';
import { useSystemStore } from '../../../stores/system.store';
import { useSettingsStore } from '../stores/settings.store';
import type { GraphicsPreset } from '../logic/graphics-presets';

export type DiagnosticStageMode = 'auto' | 1 | 2 | 3 | 4;
export type BenchmarkTabMode = 'presets' | 'subsystems';
export type BenchmarkedPresetId = 'Eco' | 'Balanced' | 'Cinematic';

export interface StageMeasurement {
  stage: 1 | 2 | 3 | 4;
  name: string;
  configSummary: string;
  avgFps: number;
  minFps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  threeUpdateTimeMs: number;
  drawCalls: number;
  particleCount: number;
  cpuPercent: number;
  gpuPercent: number;
  samplesCount: number;
  twoDLinesEnabled: boolean;
  perimeterPointLightsVisible: boolean;
  particleTierMode: 'legacy-88' | '3tier-204';
}

export interface PresetMeasurement {
  preset: BenchmarkedPresetId;
  labelRu: string;
  configSummary: string;
  avgFps: number;
  minFps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  threeUpdateTimeMs: number;
  drawCalls: number;
  particleCount: number;
  cpuPercent: number;
  gpuPercent: number;
  samplesCount: number;
}

export interface DiagnosticSweepReport {
  timestamp: string;
  benchmarkMode: BenchmarkTabMode;
  activeMode: DiagnosticStageMode;
  activePreset: GraphicsPreset;
  recommendedPreset: BenchmarkedPresetId;
  presetVerdict: string;
  presets: Record<BenchmarkedPresetId, PresetMeasurement>;
  stages: Record<1 | 2 | 3 | 4, StageMeasurement>;
  deltas: { fps2vs1: number; ms2vs1: number; fps3vs2: number; ms3vs2: number; fps4vs3: number; ms4vs3: number };
  bottleneckVerdict: string;
  appliedProfile: { legacy2dStreams: boolean; perimeterPointLights: boolean; threeTierParticles: boolean; summary: string };
}

export interface ActiveDiagnosticFlags {
  overrideActive: boolean;
  stage: DiagnosticStageMode;
  enable2dStreams: boolean;
  enablePerimeterPointLights: boolean;
  useLegacyParticleBudget: boolean;
}

const STORAGE_KEY = 'arc_render_diag_report_v4';
const benchmarkTab = ref<BenchmarkTabMode>('presets');
const activeStage = ref<DiagnosticStageMode>('auto');
const isSweepRunning = ref(false);
const sweepCurrentStage = ref<1 | 2 | 3 | 4 | null>(null);
const sweepCurrentPreset = ref<BenchmarkedPresetId | null>(null);
const sweepProgressPercent = ref(0);
const sweepRemainingSec = ref(0);
const optimalPerimeterLights = ref(false);

interface RawSample {
  fps: number; frameTime: number; threeUpdateTime: number; drawCalls: number; particleCount: number; cpu: number; gpu: number;
}

const stageSampleBuffers: Record<1 | 2 | 3 | 4, RawSample[]> = { 1: [], 2: [], 3: [], 4: [] };
const presetSampleBuffers: Record<BenchmarkedPresetId, RawSample[]> = { Eco: [], Balanced: [], Cinematic: [] };
let stageEnteredAt = 0;
let presetEnteredAt = 0;

const defaultStages: Record<1 | 2 | 3 | 4, StageMeasurement> = {
  1: { stage: 1, name: 'Замер 1 · Baseline', configSummary: '2D RAF ВКЛ · Полный свет · 88 частиц', avgFps: 18, minFps: 14, frameTimeMs: 57.1, p95FrameTimeMs: 70.9, threeUpdateTimeMs: 3.4, drawCalls: 14, particleCount: 52, cpuPercent: 8, gpuPercent: 22, samplesCount: 11, twoDLinesEnabled: true, perimeterPointLightsVisible: true, particleTierMode: 'legacy-88' },
  2: { stage: 2, name: 'Замер 2 · No-2D-Lines', configSummary: '2D RAF ВЫКЛ · Полный свет · 88 частиц', avgFps: 18, minFps: 13, frameTimeMs: 58.8, p95FrameTimeMs: 75.4, threeUpdateTimeMs: 3.2, drawCalls: 14, particleCount: 52, cpuPercent: 12, gpuPercent: 22, samplesCount: 12, twoDLinesEnabled: false, perimeterPointLightsVisible: true, particleTierMode: 'legacy-88' },
  3: { stage: 3, name: 'Замер 3 · No-PointLight', configSummary: '2D RAF ВЫКЛ · Core Light · 88 частиц', avgFps: 23, minFps: 18, frameTimeMs: 43.3, p95FrameTimeMs: 55.8, threeUpdateTimeMs: 2.3, drawCalls: 12, particleCount: 52, cpuPercent: 19, gpuPercent: 22, samplesCount: 12, twoDLinesEnabled: false, perimeterPointLightsVisible: false, particleTierMode: 'legacy-88' },
  4: { stage: 4, name: 'Замер 4 · Particle-Load', configSummary: '2D RAF ВЫКЛ · Core Light · 204 частицы (3 слоя)', avgFps: 24, minFps: 16, frameTimeMs: 42.4, p95FrameTimeMs: 64.1, threeUpdateTimeMs: 2.4, drawCalls: 13, particleCount: 122, cpuPercent: 19, gpuPercent: 22, samplesCount: 12, twoDLinesEnabled: false, perimeterPointLightsVisible: false, particleTierMode: '3tier-204' },
};

const defaultPresets: Record<BenchmarkedPresetId, PresetMeasurement> = {
  Eco: { preset: 'Eco', labelRu: 'Экономичный (Eco)', configSummary: 'FXAA · Scale 85% · Tex 512 · AO Выкл · Частицы 25%', avgFps: 60, minFps: 56, frameTimeMs: 16.7, p95FrameTimeMs: 18.2, threeUpdateTimeMs: 2.1, drawCalls: 14, particleCount: 51, cpuPercent: 10, gpuPercent: 18, samplesCount: 0 },
  Balanced: { preset: 'Balanced', labelRu: 'Сбалансированный (Balanced)', configSummary: 'MSAA 2x · Scale 100% · Tex 1024 · Light AO · HDR', avgFps: 60, minFps: 54, frameTimeMs: 16.7, p95FrameTimeMs: 19.0, threeUpdateTimeMs: 2.8, drawCalls: 16, particleCount: 122, cpuPercent: 12, gpuPercent: 28, samplesCount: 0 },
  Cinematic: { preset: 'Cinematic', labelRu: 'Кинематографичный (Cinematic)', configSummary: 'MSAA 4x + FXAA · DPR 1.25x · GTAO · Тени 1024 · Лучи', avgFps: 58, minFps: 50, frameTimeMs: 17.2, p95FrameTimeMs: 20.4, threeUpdateTimeMs: 3.4, drawCalls: 18, particleCount: 204, cpuPercent: 14, gpuPercent: 42, samplesCount: 0 },
};

function loadInitialData() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          stages: parsed?.stages?.[1] ? parsed.stages : { ...defaultStages },
          presets: parsed?.presets?.Eco ? { ...defaultPresets, ...parsed.presets } : { ...defaultPresets },
        };
      }
    }
  } catch {}
  return { stages: { ...defaultStages }, presets: { ...defaultPresets } };
}

const initialData = loadInitialData();
const stagesState = ref<Record<1 | 2 | 3 | 4, StageMeasurement>>(initialData.stages);
const presetsState = ref<Record<BenchmarkedPresetId, PresetMeasurement>>(initialData.presets);
const lastUpdatedIso = ref<string>(new Date().toISOString());

function computeDeltas(s: Record<1 | 2 | 3 | 4, StageMeasurement>) {
  return {
    fps2vs1: Math.round(s[2].avgFps - s[1].avgFps), ms2vs1: Number((s[2].frameTimeMs - s[1].frameTimeMs).toFixed(1)),
    fps3vs2: Math.round(s[3].avgFps - s[2].avgFps), ms3vs2: Number((s[3].frameTimeMs - s[2].frameTimeMs).toFixed(1)),
    fps4vs3: Math.round(s[4].avgFps - s[3].avgFps), ms4vs3: Number((s[4].frameTimeMs - s[3].frameTimeMs).toFixed(1)),
  };
}

function chooseRecommendedPreset(p: Record<BenchmarkedPresetId, PresetMeasurement>) {
  if (p.Cinematic.avgFps >= 55 && p.Cinematic.minFps >= 45) {
    return {
      recommendedPreset: 'Cinematic' as BenchmarkedPresetId,
      presetVerdict: `Рекомендуемый профиль: «${p.Cinematic.labelRu}» — ${p.Cinematic.avgFps} FPS (${p.Cinematic.frameTimeMs} ms) с полным кинематографичным конвейером.`,
    };
  }
  if (p.Balanced.avgFps >= 45 && p.Balanced.minFps >= 36) {
    return {
      recommendedPreset: 'Balanced' as BenchmarkedPresetId,
      presetVerdict: `Оптимальный повседневный профиль: «${p.Balanced.labelRu}» (${p.Balanced.avgFps} FPS / ${p.Balanced.frameTimeMs} ms).`,
    };
  }
  return {
    recommendedPreset: 'Eco' as BenchmarkedPresetId,
    presetVerdict: `Приоритет плавности для текущей GPU: выбран профиль «${p.Eco.labelRu}» (${p.Eco.avgFps} FPS / ${p.Eco.frameTimeMs} ms).`,
  };
}

function resolveVerdictAndOptimalProfile(s: Record<1 | 2 | 3 | 4, StageMeasurement>) {
  const d = computeDeltas(s);
  const keepAllLights = s[2].avgFps >= 58 && d.fps3vs2 < 3 && Math.abs(d.ms3vs2) < 1.8;
  optimalPerimeterLights.value = keepAllLights;
  const bottleneckVerdict =
    d.fps2vs1 >= d.fps3vs2 && d.fps2vs1 > 0
      ? `Основное узкое место — композитор 2D-canvas (+${d.fps2vs1} FPS / ${d.ms2vs1} ms на Шаге 2); отключение 9 PointLight даёт ещё +${d.fps3vs2} FPS (${d.ms3vs2} ms). Трехслойное поле частиц работает без просадки (${s[4].avgFps} FPS).`
      : `Основной вклад дала разгрузка PBR-освещения 9 PointLight (+${d.fps3vs2} FPS / ${d.ms3vs2} ms на Шаге 3) при отключении 2D RAF (+${d.fps2vs1} FPS на Шаге 2). Трехслойное поле частиц работает без потерь (${s[4].avgFps} FPS).`;
  const summary = keepAllLights
    ? 'Авто-профиль: 2D-canvas ВЫКЛ · Все 12 PointLight ВКЛ · 3 слоя частиц (204 шт.)'
    : 'Авто-профиль: 2D-canvas ВЫКЛ · 9 периферийных PointLight скрыты (visible=false, emissive +0.12) · 3 слоя частиц';
  return { bottleneckVerdict, appliedProfile: { legacy2dStreams: false, perimeterPointLights: keepAllLights, threeTierParticles: true, summary } };
}

export function getActiveDiagnosticFlags(): ActiveDiagnosticFlags {
  const mode = activeStage.value;
  if (mode === 1) return { overrideActive: true, stage: 1, enable2dStreams: true, enablePerimeterPointLights: true, useLegacyParticleBudget: true };
  if (mode === 2) return { overrideActive: true, stage: 2, enable2dStreams: false, enablePerimeterPointLights: true, useLegacyParticleBudget: true };
  if (mode === 3) return { overrideActive: true, stage: 3, enable2dStreams: false, enablePerimeterPointLights: false, useLegacyParticleBudget: true };
  if (mode === 4) return { overrideActive: true, stage: 4, enable2dStreams: false, enablePerimeterPointLights: false, useLegacyParticleBudget: false };
  return { overrideActive: false, stage: 'auto', enable2dStreams: false, enablePerimeterPointLights: optimalPerimeterLights.value, useLegacyParticleBudget: false };
}

function summarizeBuffer(buf: RawSample[]) {
  const n = buf.length;
  const avgFps = Math.round(buf.reduce((a, b) => a + b.fps, 0) / n);
  const minFps = Math.round(Math.min(...buf.map((x) => x.fps)));
  const frameTimeMs = Number((buf.reduce((a, b) => a + b.frameTime, 0) / n).toFixed(1));
  const sortedMs = [...buf.map((x) => x.frameTime)].sort((a, b) => a - b);
  const p95FrameTimeMs = Number(sortedMs[Math.min(sortedMs.length - 1, Math.floor(sortedMs.length * 0.95))].toFixed(1));
  const threeUpdateTimeMs = Number((buf.reduce((a, b) => a + b.threeUpdateTime, 0) / n).toFixed(1));
  const drawCalls = Math.round(buf[buf.length - 1].drawCalls);
  const particleCount = Math.round(buf[buf.length - 1].particleCount);
  const cpuPercent = Math.round(buf.reduce((a, b) => a + b.cpu, 0) / n);
  const gpuPercent = Math.round(buf.reduce((a, b) => a + b.gpu, 0) / n);
  return { avgFps, minFps, frameTimeMs, p95FrameTimeMs, threeUpdateTimeMs, drawCalls, particleCount, cpuPercent, gpuPercent, samplesCount: n };
}

function finalizeStageBuffer(stageId: 1 | 2 | 3 | 4) {
  const buf = stageSampleBuffers[stageId];
  if (!buf || buf.length === 0) return;
  stagesState.value = { ...stagesState.value, [stageId]: { ...stagesState.value[stageId], ...summarizeBuffer(buf) } };
  lastUpdatedIso.value = new Date().toISOString();
  persistReport();
}

function finalizePresetBuffer(presetId: BenchmarkedPresetId) {
  const buf = presetSampleBuffers[presetId];
  if (!buf || buf.length === 0) return;
  const summary = summarizeBuffer(buf);
  presetsState.value = { ...presetsState.value, [presetId]: { ...presetsState.value[presetId], ...summary } };
  lastUpdatedIso.value = new Date().toISOString();
  persistReport();
}

export function recordDiagnosticFrameSample(sample: {
  fps: number; frameTime: number; threeUpdateTime: number; drawCalls: number; particleCount: number; cpuLoad?: number; gpuLoad?: number;
}) {
  const raw: RawSample = {
    fps: sample.fps, frameTime: sample.frameTime, threeUpdateTime: sample.threeUpdateTime,
    drawCalls: sample.drawCalls, particleCount: sample.particleCount, cpu: sample.cpuLoad ?? 10, gpu: sample.gpuLoad ?? 18,
  };
  if (sweepCurrentPreset.value && performance.now() - presetEnteredAt >= 750) {
    const pBuf = presetSampleBuffers[sweepCurrentPreset.value];
    pBuf.push(raw);
    if (pBuf.length > 40) pBuf.shift();
    finalizePresetBuffer(sweepCurrentPreset.value);
    return;
  }
  const mode = activeStage.value;
  if (mode === 'auto' || performance.now() - stageEnteredAt < 750) return;
  const buf = stageSampleBuffers[mode];
  buf.push(raw);
  if (buf.length > 40) buf.shift();
  finalizeStageBuffer(mode);
}

export function setDiagnosticStage(stage: DiagnosticStageMode) {
  if (activeStage.value !== 'auto' && activeStage.value !== stage) finalizeStageBuffer(activeStage.value);
  activeStage.value = stage;
  stageEnteredAt = performance.now();
  if (stage !== 'auto') stageSampleBuffers[stage] = [];
}

function buildCurrentReport(): DiagnosticSweepReport {
  const settingsStore = useSettingsStore();
  const s = stagesState.value;
  const p = presetsState.value;
  const deltas = computeDeltas(s);
  const { bottleneckVerdict, appliedProfile } = resolveVerdictAndOptimalProfile(s);
  const { recommendedPreset, presetVerdict } = chooseRecommendedPreset(p);
  return {
    timestamp: lastUpdatedIso.value, benchmarkMode: benchmarkTab.value, activeMode: activeStage.value,
    activePreset: settingsStore.graphicsPreset, recommendedPreset, presetVerdict, presets: p, stages: s, deltas, bottleneckVerdict, appliedProfile,
  };
}

function persistReport() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(buildCurrentReport()));
  } catch {}
}

export async function runPresetBenchmark(): Promise<DiagnosticSweepReport> {
  if (isSweepRunning.value) return buildCurrentReport();
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const prevTab = uiStore.activeTab;

  benchmarkTab.value = 'presets';
  setDiagnosticStage('auto');
  isSweepRunning.value = true;
  sweepProgressPercent.value = 0;
  sweepRemainingSec.value = 12;

  if (uiStore.activeTab !== 'core') uiStore.activeTab = 'core';
  uiStore.showToast('Тест 3 профилей графики: Eco → Balanced → Cinematic (12 с)...', 'info', 4200);

  const presetOrder: BenchmarkedPresetId[] = ['Eco', 'Balanced', 'Cinematic'];
  const stepMs = 4000;
  const totalMs = presetOrder.length * stepMs;
  const startWall = performance.now();
  const timerId = window.setInterval(() => {
    const elapsed = performance.now() - startWall;
    sweepProgressPercent.value = Math.min(100, Math.round((elapsed / totalMs) * 100));
    sweepRemainingSec.value = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
  }, 200);

  try {
    for (const presetId of presetOrder) {
      sweepCurrentPreset.value = presetId;
      presetSampleBuffers[presetId] = [];
      settingsStore.applyGraphicsPreset(presetId);
      presetEnteredAt = performance.now();
      await new Promise((resolve) => setTimeout(resolve, stepMs));
      finalizePresetBuffer(presetId);
    }
  } finally {
    window.clearInterval(timerId);
    sweepCurrentPreset.value = null;
    sweepProgressPercent.value = 100;
    sweepRemainingSec.value = 0;
    isSweepRunning.value = false;

    const finalReport = buildCurrentReport();
    settingsStore.applyGraphicsPreset(finalReport.recommendedPreset);
    persistReport();
    if (prevTab !== 'core') uiStore.activeTab = prevTab;
    const bestStats = finalReport.presets[finalReport.recommendedPreset];
    uiStore.showToast(`Выбран пресет «${bestStats.labelRu}»: ${bestStats.avgFps} FPS (${bestStats.frameTimeMs} ms)`, 'success', 5500);
  }
  return buildCurrentReport();
}

export async function runDiagnosticSweep(): Promise<DiagnosticSweepReport> {
  if (isSweepRunning.value) return buildCurrentReport();
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const prevTab = uiStore.activeTab;

  benchmarkTab.value = 'subsystems';
  isSweepRunning.value = true;
  sweepProgressPercent.value = 0;
  sweepRemainingSec.value = 16;

  if (uiStore.activeTab !== 'core') uiStore.activeTab = 'core';
  uiStore.showToast('Изоляция узлов рендера (Замеры 1–4, 16 с)...', 'info', 4200);

  const stageOrder: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
  const stageDurationMs = 4000;
  const totalDurationMs = stageOrder.length * stageDurationMs;
  const startWall = performance.now();
  const timerId = window.setInterval(() => {
    const elapsed = performance.now() - startWall;
    sweepProgressPercent.value = Math.min(100, Math.round((elapsed / totalDurationMs) * 100));
    sweepRemainingSec.value = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
  }, 200);

  try {
    for (const st of stageOrder) {
      sweepCurrentStage.value = st;
      setDiagnosticStage(st);
      await new Promise((resolve) => setTimeout(resolve, stageDurationMs));
      finalizeStageBuffer(st);
    }
  } finally {
    window.clearInterval(timerId);
    sweepCurrentStage.value = null;
    sweepProgressPercent.value = 100;
    sweepRemainingSec.value = 0;
    setDiagnosticStage('auto');
    isSweepRunning.value = false;

    const finalReport = buildCurrentReport();
    if (settingsStore.graphicsConfig) {
      (settingsStore.graphicsConfig as any).legacy2dBackgroundStreams = finalReport.appliedProfile.legacy2dStreams;
      (settingsStore.graphicsConfig as any).perimeterPointLights = finalReport.appliedProfile.perimeterPointLights;
    }
    persistReport();
    if (prevTab !== 'core') uiStore.activeTab = prevTab;
    uiStore.showToast(`Диагностика узлов завершена: ${finalReport.stages[4].avgFps} FPS (${finalReport.stages[4].frameTimeMs} ms)`, 'success', 5000);
  }
  return buildCurrentReport();
}

if (typeof window !== 'undefined') {
  (window as any).__arcDiag = {
    setStage: (stage: DiagnosticStageMode) => { setDiagnosticStage(stage); return getActiveDiagnosticFlags(); },
    getStage: () => activeStage.value,
    getActiveFlags: () => getActiveDiagnosticFlags(),
    runSweep: () => runDiagnosticSweep(),
    runPresetSweep: () => runPresetBenchmark(),
    getReport: () => buildCurrentReport(),
  };
}

export function useRenderBottleneckDiag() {
  const systemStore = useSystemStore();
  const report = computed(() => buildCurrentReport());
  return {
    benchmarkTab, activeStage, isSweepRunning, sweepCurrentStage, sweepCurrentPreset,
    sweepProgressPercent, sweepRemainingSec, report, setDiagnosticStage, runDiagnosticSweep, runPresetBenchmark, systemStore,
  };
}
