import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useVoiceCommands } from './useVoiceCommands';
import { useTasksStore } from '../features/tasks/stores/tasks.store';
import { useUIStore } from '../stores/ui.store';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { nextTick } from 'vue';

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
    },
    ipcRenderer: {
      on: vi.fn(),
      send: vi.fn()
    }
  };
});

describe('useVoiceCommands', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('window', {
      api: {
        executeTool: vi.fn().mockResolvedValue({}),
        openExternal: vi.fn(),
        logDialog: vi.fn()
      },
      dispatchEvent: vi.fn(),
      open: vi.fn()
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    });
  });

  it('should process hard stop command', async () => {
    const uiStore = useUIStore();
    const { processVoiceCommand } = useVoiceCommands();
    uiStore.setSoftPaused(true);
    
    const result = await processVoiceCommand('стоп');
    expect(result?.handled).toBe(true);
    expect(uiStore.isSoftPaused).toBe(false);
  });

  it('should route to specific website', async () => {
    const { processVoiceCommand } = useVoiceCommands();
    const result = await processVoiceCommand('открой ютуб');
    expect(result?.handled).toBe(true);
    expect((window.api as any).openExternal).toHaveBeenCalledWith('https://youtube.com');
  });

  it('should switch tabs', async () => {
    const uiStore = useUIStore();
    const { processVoiceCommand } = useVoiceCommands();
    
    const resultSettings = await processVoiceCommand('открой настройки');
    expect(resultSettings?.handled).toBe(true);
    expect(uiStore.activeTab).toBe('settings');

    const resultTasks = await processVoiceCommand('открой задачи');
    expect(resultTasks?.handled).toBe(true);
    expect(uiStore.activeTab).toBe('tasks');
  });

  it('should delegate classification to window.api.classifyCommand if available', async () => {
    (window.api as any).classifyCommand = vi.fn().mockResolvedValue('Прекрасная работа.');
    const { processVoiceCommand } = useVoiceCommands();

    const result = await processVoiceCommand('кастомная команда');
    expect(result?.handled).toBe(true);
    expect(result?.response).toBe('Прекрасная работа.');
    expect((window.api as any).classifyCommand).toHaveBeenCalledWith('кастомная команда');
  });

  it('should fallback to local regexes if window.api.classifyCommand returns null', async () => {
    (window.api as any).classifyCommand = vi.fn().mockResolvedValue(null);
    const uiStore = useUIStore();
    const { processVoiceCommand } = useVoiceCommands();

    const result = await processVoiceCommand('стоп');
    expect(result?.handled).toBe(true);
    expect(uiStore.isSoftPaused).toBe(false);
  });

  it('should handle gratitude command without dispatching arc:stop-audio', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { processVoiceCommand } = useVoiceCommands();

    const result = await processVoiceCommand('спасибо большое');
    expect(result?.handled).toBe(true);
    expect(typeof result?.response).toBe('string');
    expect(result?.response?.length).toBeGreaterThan(0);

    const clearWindowCalls = dispatchSpy.mock.calls.filter(c => (c[0] as CustomEvent).type === 'arc:clear-dialogue-window');
    const stopAudioCalls = dispatchSpy.mock.calls.filter(c => (c[0] as CustomEvent).type === 'arc:stop-audio');

    expect(clearWindowCalls.length).toBeGreaterThan(0);
    expect(stopAudioCalls.length).toBe(0);
    dispatchSpy.mockRestore();
  });
});
