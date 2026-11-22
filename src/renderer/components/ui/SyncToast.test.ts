import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'fs';
import path from 'path';
import { useSettingsStore } from '../../features/settings/stores/settings.store';

describe('SyncToast (S1-05 Honest Sync / Error Feedback)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const storage: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: vi.fn((k: string) => (k in storage ? storage[k] : null)),
      setItem: vi.fn((k: string, v: string) => {
        storage[k] = String(v);
      }),
      removeItem: vi.fn((k: string) => {
        delete storage[k];
      }),
      clear: vi.fn()
    };
    (globalThis as any).window = (globalThis as any).window || {};
  });

  it('SyncToast.vue renders error badge, Retry action, and status-err token without false SYNCED text', () => {
    const componentPath = path.resolve(__dirname, 'SyncToast.vue');
    const content = fs.readFileSync(componentPath, 'utf8');

    expect(content).toContain("variant === 'error'");
    expect(content).toContain('✦ SYNC FAIL');
    expect(content).toContain('✦ ОШИБКА БД');
    expect(content).toContain('✦ SYNCED');
    expect(content).toContain('var(--status-err)');
    expect(content).toContain('RotateCcw');
    expect(content).toContain("'Retry'");
    expect(content).toContain("'Повторить'");
  });

  it('settingsStore.triggerSyncToast sets variant=error cleanly and executes retry callback', () => {
    const settingsStore = useSettingsStore();
    const retrySpy = vi.fn();

    settingsStore.triggerSyncToast('Ошибка сохранения в БД (SQLITE_BUSY)', retrySpy, true, {
      variant: 'error',
      actionLabel: 'Повторить'
    });

    expect(settingsStore.lastChangedToastVisible).toBe(true);
    expect(settingsStore.lastChangedState?.variant).toBe('error');
    expect(settingsStore.lastChangedState?.actionLabel).toBe('Повторить');
    expect(settingsStore.lastChangedState?.label).toContain('SQLITE_BUSY');

    settingsStore.lastChangedState?.undo();
    expect(retrySpy).toHaveBeenCalledTimes(1);
    expect(settingsStore.lastChangedToastVisible).toBe(false);
  });

  it('defaults triggerSyncToast to variant=synced when called normally', () => {
    const settingsStore = useSettingsStore();
    const undoSpy = vi.fn();

    settingsStore.triggerSyncToast('✦ Задача сохранена', undoSpy);
    expect(settingsStore.lastChangedToastVisible).toBe(true);
    expect(settingsStore.lastChangedState?.variant).toBe('synced');
  });

  it('supports variant=warn with status-warn token and local-template label without false SYNCED badge', () => {
    const componentPath = path.resolve(__dirname, 'SyncToast.vue');
    const content = fs.readFileSync(componentPath, 'utf8');

    expect(content).toContain("variant === 'warn'");
    expect(content).toContain('✦ ЛОКАЛЬНЫЙ ШАБЛОН');
    expect(content).toContain('✦ LOCAL TEMPLATE');
    expect(content).toContain('var(--status-warn)');

    const settingsStore = useSettingsStore();
    const retrySpy = vi.fn();
    settingsStore.triggerSyncToast('ИИ недоступен — применён локальный шаблон', retrySpy, true, {
      variant: 'warn',
      actionLabel: 'Повторить ИИ'
    });

    expect(settingsStore.lastChangedState?.variant).toBe('warn');
    expect(settingsStore.lastChangedState?.actionLabel).toBe('Повторить ИИ');
    settingsStore.lastChangedState?.undo();
    expect(retrySpy).toHaveBeenCalledTimes(1);
  });
});
