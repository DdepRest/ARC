import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as VueRuntime from 'vue';
import { createSSRApp, defineComponent, computed, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse as parseSfc, compileTemplate } from '@vue/compiler-sfc';
import * as ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { createPinia, setActivePinia } from 'pinia';
import { useSystemStore } from '../../../stores/system.store';
import {
  buildModulesCapabilitySnapshot,
  createBaselineCapabilities
} from '../../../../shared/config/modules-capability.registry';
import {
  filterCapabilities,
  formatCheckedAt,
  getCapabilityBadge,
  getCapabilityIcon,
  isAttentionRequired,
  type ModulesViewFilter
} from '../logic/module-presentation';

const StubIcon = defineComponent({ render: () => VueRuntime.h('svg') });

function compileModulesViewTemplate() {
  const fullPath = path.resolve(__dirname, './ModulesView.vue');
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

describe('S3-04: ModulesView & SystemStore Unified Capability Registry', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    (globalThis as any).window = {
      api: {
        getModulesStatus: vi.fn()
      }
    };
  });

  it('1. Never displays fake active green status when implemented modules are degraded/unavailable and keeps planned items non-active', async () => {
    const store = useSystemStore();
    const caps = createBaselineCapabilities('unknown', 'test', '2026-11-19T12:00:00.000Z').map((c) => {
      if (c.id === 'memory-engine') {
        return {
          ...c,
          availability: 'degraded' as const,
          health: 'degraded' as const,
          reason: 'DB_SAFE_MODE (только чтение)'
        };
      }
      if (c.id === 'speech-stt') {
        return {
          ...c,
          availability: 'unavailable' as const,
          health: 'unavailable' as const,
          reason: 'STT: модели не установлены'
        };
      }
      if (c.id === 'ai-chat') {
        return {
          ...c,
          availability: 'unavailable' as const,
          health: 'error' as const,
          reason: 'Все шлюзы в карантине'
        };
      }
      if (c.lifecycleState === 'implemented') {
        return {
          ...c,
          availability: 'available' as const,
          health: 'ready' as const,
          reason: 'Готов к работе'
        };
      }
      return c;
    });

    store.applyModulesSnapshot(buildModulesCapabilitySnapshot(caps, '2026-11-19T12:00:00.000Z'));

    const renderTemplate = compileModulesViewTemplate();
    const Harness = defineComponent({
      components: {
        Cpu: StubIcon,
        ArrowRight: StubIcon,
        ArrowLeft: StubIcon,
        Search: StubIcon,
        RefreshCw: StubIcon
      },
      setup() {
        const activeFilter = ref<ModulesViewFilter>('all');
        const searchFilter = ref('');
        const snapshot = computed(() => store.capabilitiesSnapshot);
        const attentionCount = computed(() =>
          snapshot.value.capabilities.filter((cap) => isAttentionRequired(cap)).length
        );
        const filtered = computed(() =>
          filterCapabilities(snapshot.value, activeFilter.value, searchFilter.value)
        );
        const formattedSnapshotTime = computed(() => formatCheckedAt(snapshot.value.checkedAt));
        return {
          uiStore: { setActiveTab: vi.fn() },
          systemStore: store,
          activeFilter,
          searchFilter,
          snapshot,
          attentionCount,
          filtered,
          formattedSnapshotTime,
          badgeFor: (cap: any) => getCapabilityBadge(cap.lifecycleState, cap.health),
          getCapabilityIcon,
          formatCheckedAt,
          handleRefresh: vi.fn(),
          openModuleEntrypoint: vi.fn()
        };
      },
      render: renderTemplate
    });

    const html = await renderToString(createSSRApp(Harness));

    expect(html).toContain('ДЕГРАДАЦИЯ');
    expect(html).toContain('DB_SAFE_MODE (только чтение)');
    expect(html).toContain('НЕДОСТУПЕН');
    expect(html).toContain('STT: модели не установлены');
    expect(html).toContain('ОШИБКА');
    expect(html).toContain('Все шлюзы в карантине');
    expect(html).toContain('Запланировано в v1.1');
    expect(html).not.toContain('ONLINE');
  });

  it('2. systemStore.refreshModulesStatus syncs snapshot + derived legacyStatusMap and handles IPC rejection without perpetual checking', async () => {
    const store = useSystemStore();
    const healthyCaps = createBaselineCapabilities('unknown', 'ok', '2026-11-19T12:05:00.000Z').map((c) =>
      c.lifecycleState === 'implemented'
        ? { ...c, availability: 'available' as const, health: 'ready' as const, reason: 'OK' }
        : c
    );
    const snapshot = buildModulesCapabilitySnapshot(healthyCaps, '2026-11-19T12:05:00.000Z');

    (window.api.getModulesStatus as any).mockResolvedValueOnce(snapshot);
    await store.refreshModulesStatus({ refresh: true });

    expect(window.api.getModulesStatus).toHaveBeenCalledWith({ refresh: true });
    expect(store.capabilitiesSnapshot.summary.ready).toBe(10);
    expect(store.modulesStatus).toEqual({
      Assistant: 'Active',
      Voice: 'Active',
      Memory: 'Active',
      Tasks: 'Active'
    });
    expect(store.modulesError).toBeNull();

    (window.api.getModulesStatus as any).mockRejectedValueOnce(new Error('IPC timeout'));
    await store.refreshModulesStatus({ refresh: true });

    expect(store.modulesError).toBe('IPC timeout');
    expect(store.capabilitiesSnapshot.summary.checking).toBe(0);
    expect(store.capabilitiesSnapshot.summary.unknown).toBe(10);
    expect(store.modulesStatus.Assistant).toBe('Idle');
  });

  it('3. Presentation helpers map attention filter and badges accurately', () => {
    const snap = buildModulesCapabilitySnapshot(
      createBaselineCapabilities('unknown', 'no ipc', '2026-11-19T12:00:00.000Z').map((c) => {
        if (c.id === 'tasks-engine') {
          return { ...c, availability: 'available', health: 'ready', reason: 'SQLite' };
        }
        if (c.id === 'memory-engine') {
          return { ...c, availability: 'degraded', health: 'degraded', reason: 'Fallback JSON' };
        }
        return c;
      }),
      '2026-11-19T12:00:00.000Z'
    );

    const attention = filterCapabilities(snap, 'attention', '');
    expect(attention.planned).toHaveLength(0);
    expect(attention.implemented.some((c) => c.id === 'tasks-engine')).toBe(false);
    expect(attention.implemented.some((c) => c.id === 'memory-engine')).toBe(true);
    expect(isAttentionRequired(snap.capabilities.find((c) => c.id === 'memory-engine')!)).toBe(true);

    expect(getCapabilityBadge('planned', 'ready').label).toBe('Запланировано в v1.1');
    expect(getCapabilityBadge('implemented', 'degraded').textClass).toContain('--status-warn');
    expect(getCapabilityBadge('implemented', 'error').textClass).toContain('--status-err');
    expect(getCapabilityBadge('implemented', 'ready').textClass).toContain('--status-ok');
  });
});
