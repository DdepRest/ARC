import { describe, it, expect } from 'vitest';
import * as VueRuntime from 'vue';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse as parseSfc, compileTemplate } from '@vue/compiler-sfc';
import * as ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { buildDbStoragePresentation } from './storage-db-presentation';
import {
  getAppDataResetDisclosure,
  getUiResetDisclosure
} from '../../../../../../shared/config/reset-policy';

const StubIcon = defineComponent({ setup: () => () => h('svg') });
const PassThrough = defineComponent({
  props: ['label', 'description', 'tech', 'title', 'subtitle', 'statusLabel', 'statusTone', 'items'],
  setup(props, { slots }) {
    return () =>
      h('div', { 'data-label': props.label, 'data-tech': props.tech, 'data-status': props.statusLabel }, [
        props.items ? h('div', props.items.map((i: any) => `${i.label}:${i.value}:${i.detail}`)) : null,
        slots.summary ? slots.summary() : null,
        slots.default ? slots.default() : null
      ]);
  }
});

function compileSfc(relPath: string) {
  const fullPath = path.resolve(__dirname, relPath);
  const src = fs.readFileSync(fullPath, 'utf8');
  const { descriptor } = parseSfc(src, { filename: fullPath });
  const compiled = compileTemplate({
    source: descriptor.template!.content,
    filename: fullPath,
    id: fullPath,
    compilerOptions: {
      mode: 'function',
      isTS: true,
      expressionPlugins: ['typescript']
    }
  });
  expect(compiled.errors).toEqual([]);
  const transpiled = ts.transpileModule(compiled.code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    }
  });
  return new Function('Vue', transpiled.outputText)(VueRuntime);
}

describe('S3-02 UI presentation — honest SQLite vs JSON Degraded vs Safe Mode', () => {
  it('distinguishes SQLite, DEGRADED JSON, DB_SAFE_MODE, and TEST_MEMORY honestly', () => {
    const sqlite = buildDbStoragePresentation(
      {
        mode: 'NORMAL',
        engine: 'sqlite',
        storageStatus: 'PERSISTENT_SQLITE',
        isSafeMode: false,
        readOnly: false,
        capabilities: {
          persistent: true,
          supportsTransactions: true,
          supportsRollback: true,
          supportsFts5: true,
          supportsForeignKeys: true,
          supportsSqlIndexes: true
        },
        limitations: []
      },
      true
    );
    expect(sqlite.summaryValue).toBe('SQLite 3');
    expect(sqlite.summaryTone).toBe('ok');
    expect(sqlite.capabilitiesSummary).toContain('ACID: Да');
    expect(sqlite.limitations).toEqual([]);

    const degraded = buildDbStoragePresentation(
      {
        mode: 'DEGRADED',
        engine: 'json-degraded',
        storageStatus: 'PERSISTENT_JSON_DEGRADED',
        isSafeMode: false,
        readOnly: false,
        capabilities: {
          persistent: true,
          supportsTransactions: false,
          supportsRollback: false,
          supportsFts5: false,
          supportsForeignKeys: false,
          supportsSqlIndexes: false
        },
        limitations: ['Нет ACID-транзакций и отката (JSONDatabase)']
      },
      true
    );
    expect(degraded.degraded).toBe(true);
    expect(degraded.summaryValue).toBe('JSON Degraded');
    expect(degraded.summaryTone).toBe('warn');
    expect(degraded.capabilitiesSummary).toContain('ACID/Rollback: Нет');
    expect(degraded.diagBadge).toBe('json-degraded · БЕЗ ACID');

    const safeMode = buildDbStoragePresentation(
      {
        mode: 'DB_SAFE_MODE',
        engine: 'json-safe-mode',
        storageStatus: 'VOLATILE_STORAGE',
        isSafeMode: true,
        readOnly: true,
        capabilities: {
          persistent: false,
          supportsTransactions: false,
          supportsRollback: false,
          supportsFts5: false,
          supportsForeignKeys: false,
          supportsSqlIndexes: false
        },
        limitations: ['Аварийный read-only режим']
      },
      true
    );
    expect(safeMode.safeMode).toBe(true);
    expect(safeMode.summaryValue).toBe('JSON Safe Mode');
    expect(safeMode.capabilitiesSummary).toContain('Read-Only');
    expect(safeMode.diagBadge).toBe('json-safe-mode · READ-ONLY');
  });

  it('renders limitations box and honest mode labels in StorageDataSection.vue when DEGRADED', async () => {
    const renderFn = compileSfc('./StorageDataSection.vue');
    const pres = buildDbStoragePresentation(
      {
        mode: 'DEGRADED',
        engine: 'json-degraded',
        storageStatus: 'PERSISTENT_JSON_DEGRADED',
        isSafeMode: false,
        readOnly: false,
        capabilities: {
          persistent: true,
          supportsTransactions: false,
          supportsRollback: false,
          supportsFts5: false,
          supportsForeignKeys: false,
          supportsSqlIndexes: false
        },
        limitations: ['Отсутствуют ACID-транзакции и откат', 'Нет полнотекстового поиска FTS5']
      },
      true
    );

    const Harness = defineComponent({
      components: {
        Database: StubIcon,
        Download: StubIcon,
        RefreshCw: StubIcon,
        SettingsSectionHeader: PassThrough,
        SettingsSummaryStrip: PassThrough,
        SettingsGroup: PassThrough,
        SettingsBlock: PassThrough,
        SettingsRow: PassThrough,
        SystemResetBlock: PassThrough,
        CacheSettingsBlock: PassThrough,
        DialogTrashRetentionBlock: PassThrough
      },
      setup() {
        return {
          headerStatus: { label: 'JSON DEGRADED · БЕЗ ACID', tone: 'warn' },
          summaryItems: [{ label: 'Движок хранения', value: pres.summaryValue, detail: pres.summaryDetail, tone: pres.summaryTone }],
          dbSizeDisplay: '12 КБ',
          dbRowLabel: pres.rowLabel,
          dbRowTech: pres.engineTag,
          canReadStorage: true,
          measureState: 'measured',
          loadStorageStats: () => {},
          exportArchive: () => {},
          isExporting: false,
          canExportArchive: true,
          exportButtonLabel: 'Экспорт zip-архива',
          dbLimitations: pres.limitations,
          dbEngineBannerTitle: pres.bannerTitle,
          dbCapabilitiesSummary: pres.capabilitiesSummary,
          exportFeedback: null,
          exportFeedbackClass: '',
          handleUiSettingsReset: () => {}
        };
      },
      render: renderFn
    });

    const html = await renderToString(createSSRApp(Harness));
    expect(html).toContain('data-testid="storage-db-limitations"');
    expect(html).toContain('Ограниченный режим JSONDatabase (DEGRADED)');
    expect(html).toContain('PERSISTENT_JSON_DEGRADED · ACID/Rollback: Нет · Read/Write');
    expect(html).toContain('Отсутствуют ACID-транзакции и откат');
    expect(html).toContain('Нет полнотекстового поиска FTS5');
    expect(html).not.toContain('Сброс к заводским параметрам');
  });

  it('S3-08 renders separated honest UI reset and Variant A app data reset disclosures with dynamic clearModels scope', async () => {
    const renderFn = compileSfc('./SystemResetBlock.vue');

    const renderBlock = async (clearModelsVal: boolean) => {
      const Harness = defineComponent({
        components: {
          AlertTriangle: StubIcon,
          RotateCcw: StubIcon,
          SettingsBlock: PassThrough,
          ArcModal: PassThrough,
          ArcCheckbox: PassThrough
        },
        setup() {
          return {
            uiDisclosure: getUiResetDisclosure(),
            appDataDisclosure: getAppDataResetDisclosure({ clearModels: clearModelsVal }),
            showUiModal: false,
            showDataModal: false,
            clearModels: clearModelsVal,
            isResettingUi: false,
            isResettingData: false,
            uiFeedback: null,
            dataFeedback: null,
            canResetSystem: true,
            confirmUiReset: () => {},
            confirmAppDataReset: () => {}
          };
        },
        render: renderFn
      });
      return renderToString(createSSRApp(Harness));
    };

    const htmlDefault = await renderBlock(false);
    expect(htmlDefault).toContain('system.storage.reset.ui');
    expect(htmlDefault).toContain('system.storage.reset.data');
    expect(htmlDefault).toContain('secrets.json');
    expect(htmlDefault).toContain('csp-violations.log');
    expect(htmlDefault).toContain('backups/');
    expect(htmlDefault).toContain('tts-policy.json');
    expect(htmlDefault).toContain('Каталог models/ (GGUF, STT, TTS) сохраняется без изменений');
    expect(htmlDefault).not.toContain('Сброс к заводским параметрам');

    const htmlWithModels = await renderBlock(true);
    expect(htmlWithModels).toContain('Каталог models/ (GGUF, STT, TTS) будет удалён по вашему выбору');
    expect(htmlWithModels).toContain('secrets.json');
    expect(htmlWithModels).toContain('csp-violations.log');
  });

  it('renders honest DB engine row in DiagnosticsSection.vue when DEGRADED', async () => {
    const renderFn = compileSfc('./DiagnosticsSection.vue');
    const pres = buildDbStoragePresentation(
      {
        mode: 'DEGRADED',
        engine: 'json-degraded',
        storageStatus: 'PERSISTENT_JSON_DEGRADED',
        isSafeMode: false,
        readOnly: false,
        capabilities: {
          persistent: true,
          supportsTransactions: false,
          supportsRollback: false,
          supportsFts5: false,
          supportsForeignKeys: false,
          supportsSqlIndexes: false
        },
        limitations: ['Нет ACID-транзакций']
      },
      true
    );

    const Harness = defineComponent({
      components: {
        Activity: StubIcon,
        FileText: StubIcon,
        Download: StubIcon,
        SettingsSectionHeader: PassThrough,
        SettingsSummaryStrip: PassThrough,
        SettingsGroup: PassThrough,
        SettingsBlock: PassThrough,
        SettingsRow: PassThrough,
        ArcToggle: PassThrough
      },
      setup() {
        const emptyMetrics = { labelRu: 'Низкий', configSummary: '', avgFps: 60, minFps: 55, frameTimeMs: 16, threeUpdateTimeMs: 2, particleCount: 100 };
        return {
          headerStatus: { label: 'ТЕЛЕМЕТРИЯ АКТИВНА', tone: 'ok' },
          summaryItems: [],
          isSweepRunning: false,
          report: {
            recommendedPreset: 'Low',
            presetVerdict: 'OK',
            appliedProfile: { summary: 'OK' },
            bottleneckVerdict: 'OK',
            deltas: { fps2vs1: 0, ms2vs1: 0, fps3vs2: 0, ms3vs2: 0, fps4vs3: 0, ms4vs3: 0 },
            presets: { Low: emptyMetrics, Medium: emptyMetrics, High: emptyMetrics, Ultra: emptyMetrics, UltraPlus: emptyMetrics },
            stages: { 1: { name: '1', ...emptyMetrics }, 2: { name: '2', ...emptyMetrics }, 3: { name: '3', ...emptyMetrics }, 4: { name: '4', ...emptyMetrics } }
          },
          store: { graphicsPreset: 'Low', logFpsToConsole: false, applyGraphicsPreset: () => {} },
          benchmarkTab: 'presets',
          tabBtnClass: () => '',
          runPresetBenchmark: () => {},
          runDiagnosticSweep: () => {},
          sweepCurrentPreset: null,
          sweepCurrentStage: null,
          sweepRemainingSec: 0,
          sweepProgressPercent: 0,
          presetIds: ['Low'],
          stageOptions: [],
          activeStage: 'auto',
          setDiagnosticStage: () => {},
          formatDelta: () => '0',
          handleCopyDiagJson: () => {},
          isDiagJsonCopied: false,
          hasLiveMetrics: false,
          cpuPercent: null,
          ramPercent: null,
          processRssText: 'Н/Д',
          telemetryTechText: '',
          dbDiagTech: pres.diagTech,
          dbDiagToneClass: 'text-[var(--status-warn)]',
          dbDiagBadge: pres.diagBadge,
          buildIdentityText: 'v1.0.12 · a3cd3ec',
          buildMetaTech: 'Версия: v1.0.12 · Commit: a3cd3ec · Источник: env',
          handleCopyReport: () => {},
          isCopied: false,
          exportPerformanceLogs: () => {},
          handleExportDiagnostics: () => {},
          isExportingDiag: false
        };
      },
      render: renderFn
    });

    const html = await renderToString(createSSRApp(Harness));
    expect(html).toContain('json-degraded · БЕЗ ACID');
    expect(html).toContain(
      'Режим: DEGRADED · PERSISTENT_JSON_DEGRADED · ACID/Rollback: Нет · Read/Write · Нет ACID-транзакций'
    );
    expect(html).toContain('v1.0.12 · a3cd3ec');
    expect(html).toContain('Commit: a3cd3ec');
    expect(html).not.toContain('9048f71');
  });
});
