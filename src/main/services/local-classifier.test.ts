import { describe, it, expect, beforeEach, vi } from 'vitest';
import { skillsStore } from '../ipc/skills.ipc';

const { mockSend, mockOpenExternal, mockSystemControlExecute, mockVkSendCommand } = vi.hoisted(() => {
  return {
    mockSend: vi.fn(),
    mockOpenExternal: vi.fn(),
    mockSystemControlExecute: vi.fn().mockResolvedValue({ success: true }),
    mockVkSendCommand: vi.fn().mockReturnValue({ success: true, clientCount: 1 })
  };
});

vi.mock('electron', () => {
  return {
    app: {
      getAppPath: vi.fn().mockReturnValue('/mock/app/path'),
      getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
    },
    BrowserWindow: {
      getAllWindows: vi.fn().mockReturnValue([
        {
          webContents: {
            send: (...args: any[]) => mockSend(...args)
          }
        }
      ])
    },
    shell: {
      openExternal: (...args: any[]) => mockOpenExternal(...args)
    }
  };
});

vi.mock('./tools/system-control.tool', () => {
  return {
    SystemControlTool: class {
      execute = mockSystemControlExecute;
    }
  };
});

vi.mock('./media/vk-websocket-server', () => {
  return {
    vkWebSocketServer: {
      sendCommand: mockVkSendCommand,
      hasClients: vi.fn().mockReturnValue(false)
    }
  };
});

vi.mock('./memory/memory-manager', () => {
  return {
    memoryManager: {
      enrichContext: vi.fn().mockResolvedValue({
        contextString: 'mock context',
        userPreferences: [],
        relevantFacts: []
      }),
      saveFact: vi.fn()
    }
  };
});

import { LocalClassifier } from './local-classifier';

describe('LocalClassifier Command Suite', () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockOpenExternal.mockClear();
    mockSystemControlExecute.mockClear();
    mockVkSendCommand.mockClear();
    skillsStore.clear();
    skillsStore.set('media', { id: 'media', title: 'Media', desc: 'desc', icon: 'Music', triggers: [], enabled: true });
  });

  it('should classify hard stop command and trigger ui:stop-audio', async () => {
    const result = await LocalClassifier.classify('стоп');
    expect(result).toBe('Остановлено.');
    expect(mockSend).toHaveBeenCalledWith('ui:stop-audio');
  });

  it('should classify UI navigation to settings', async () => {
    const result = await LocalClassifier.classify('перейди в настройки');
    expect(result).toContain('Переключаю интерфейс на настройки');
    expect(mockSend).toHaveBeenCalledWith('ui:navigate', { tab: 'settings' });
  });

  it('should classify UI navigation to objectives using "перейди к целям"', async () => {
    const result = await LocalClassifier.classify('перейди к целям');
    expect(result).toContain('Переключаю интерфейс на цели и стратегическую карту');
    expect(mockSend).toHaveBeenCalledWith('ui:navigate', { tab: 'objectives' });
  });

  it('should classify UI navigation to vision using "запусти оптический мост видения"', async () => {
    const result = await LocalClassifier.classify('запусти оптический мост видения');
    expect(result).toContain('Переключаю интерфейс на оптический мост видения');
    expect(mockSend).toHaveBeenCalledWith('ui:navigate', { tab: 'vision' });
  });

  it('should classify start focus sprint command', async () => {
    const result = await LocalClassifier.classify('запусти фокус-спринт');
    expect(result).toBe('Запускаю фокус-спринт. Желаю продуктивной работы.');
    expect(mockSend).toHaveBeenCalledWith('ui:timer-action', { action: 'start-focus' });
  });

  it('should classify stop focus sprint command', async () => {
    const result = await LocalClassifier.classify('останови фокус-спринт');
    expect(result).toBe('Фокус-спринт приостановлен.');
    expect(mockSend).toHaveBeenCalledWith('ui:timer-action', { action: 'stop-focus' });
  });

  it('should classify start rest timer command', async () => {
    const result = await LocalClassifier.classify('запусти перерыв');
    expect(result).toBe('Режим отдыха активирован. Отдохните немного.');
    expect(mockSend).toHaveBeenCalledWith('ui:timer-action', { action: 'start-rest' });
  });

  it('should classify stop rest timer command', async () => {
    const result = await LocalClassifier.classify('останови перерыв');
    expect(result).toBe('Режим отдыха отключен.');
    expect(mockSend).toHaveBeenCalledWith('ui:timer-action', { action: 'stop-rest' });
  });

  it('should classify media play command', async () => {
    const result = await LocalClassifier.classify('включи музыку');
    expect(mockVkSendCommand).toHaveBeenCalledWith('play');
    expect(result).toBe('Запускаю музыку ВКонтакте.');
  });

  it('should execute app launch using systemControlTool', async () => {
    mockSystemControlExecute.mockResolvedValueOnce({ success: true });
    const result = await LocalClassifier.classify('открой калькулятор');
    expect(mockSystemControlExecute).toHaveBeenCalledWith(expect.objectContaining({
      action: 'launch_app',
      app_name: 'calculator'
    }));
    expect(result).toContain('Запускаю калькулятор');
  });

  it('should fallback to null for unknown commands', async () => {
    const result = await LocalClassifier.classify('расскажи сказку');
    expect(result).toBeNull();
  });

  describe('Volume vs Task Intent Collision Integration Tests', () => {
    it('should adjust volume for "сделай погромче" and not classify as a task', async () => {
      const result = await LocalClassifier.classify('сделай погромче');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toContain('Громкость');
    });

    it('should adjust volume for "сделай потише" and not classify as a task', async () => {
      const result = await LocalClassifier.classify('сделай потише');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toMatch(/снижена|потише|Громкость/i);
    });

    it('should adjust volume for "сделай громче" and not classify as a task', async () => {
      const result = await LocalClassifier.classify('сделай громче');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toContain('Громкость');
    });

    it('should adjust volume for "громкость на 50" and not classify as a task', async () => {
      const result = await LocalClassifier.classify('громкость на 50');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toContain('50%');
    });

    it('should adjust volume for "убавь громкость" and not classify as a task', async () => {
      const result = await LocalClassifier.classify('убавь громкость');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toMatch(/снижена|потише|Громкость/i);
    });

    it('should adjust media volume for "сделай музыку погромче" and not classify as a task', async () => {
      const result = await LocalClassifier.classify('сделай музыку погромче');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toContain('Громкость музыки');
    });

    it('should properly create task for "создай задачу купить хлеб"', async () => {
      const result = await LocalClassifier.classify('создай задачу купить хлеб');
      expect(result).not.toBeNull();
      expect(result).toContain('Задача «купить хлеб»');
      expect(result).toContain('принята');
    });

    it('should properly complete task for "отметь задачу купить хлеб"', async () => {
      const result = await LocalClassifier.classify('отметь задачу купить хлеб');
      expect(result).not.toBeNull();
      expect(result).toContain('Задача «купить хлеб»');
      expect(result).toContain('отмечена как выполненная');
    });

    it('should not classify "убери звук" as task deletion', async () => {
      const result = await LocalClassifier.classify('убери звук');
      expect(result ?? '').not.toContain('Задача');
      expect(result ?? '').not.toContain('удалена');
    });

    it('should not classify "убери громкость" as task deletion', async () => {
      const result = await LocalClassifier.classify('убери громкость');
      expect(result ?? '').not.toContain('Задача');
      expect(result ?? '').not.toContain('удалена');
    });

    it('should properly delete all tasks for "удали все задачи"', async () => {
      const result = await LocalClassifier.classify('удали все задачи');
      expect(result).toBe('Все задачи удалены из оперативного списка.');
    });

    it('should properly delete specific task for "удали задачу купить хлеб"', async () => {
      const result = await LocalClassifier.classify('удали задачу купить хлеб');
      expect(result).toContain('Задача «купить хлеб» удалена из списка.');
    });

    it('should open VK media player via shell.openExternal for "включи вк музыку"', async () => {
      const result = await LocalClassifier.classify('включи вк музыку');
      expect(mockOpenExternal).toHaveBeenCalledWith(expect.stringContaining('vk.ru'));
      expect(result).toContain('Открываю медиаплеер ВКонтакте');
    });

    it('should strip trailing punctuation from "Открой youtube." and open https://youtube.com', async () => {
      mockOpenExternal.mockClear();
      const result = await LocalClassifier.classify('Открой youtube.');
      expect(mockOpenExternal).toHaveBeenCalledWith('https://youtube.com');
      expect(result).toBe('Открываю youtube.');
    });

    it('should not call shell.openExternal for generic "включи музыку"', async () => {
      mockOpenExternal.mockClear();
      const result = await LocalClassifier.classify('включи музыку');
      expect(mockOpenExternal).not.toHaveBeenCalled();
      expect(result).toBe('Запускаю музыку ВКонтакте.');
    });

    it('should adjust volume to 50% for "Поставь пятьдесят процентов." and never create a task', async () => {
      const result = await LocalClassifier.classify('Поставь пятьдесят процентов.');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toContain('50%');
      expect(mockVkSendCommand).toHaveBeenCalledWith('volume', { value: 0.5 });
    });

    it('should adjust volume to 50% for colloquial "Сделай на половину"', async () => {
      const result = await LocalClassifier.classify('Сделай на половину');
      expect(result).not.toBeNull();
      expect(result).not.toContain('Задача');
      expect(result).toContain('50%');
      expect(mockVkSendCommand).toHaveBeenCalledWith('volume', { value: 0.5 });
    });

    it('should handle sequential volume dialogue ("Сделай тише" -> "Еще тише" -> "Поставь на сорок")', async () => {
      const r1 = await LocalClassifier.classify('Сделай тише.');
      expect(r1).toContain('снижена');
      const r2 = await LocalClassifier.classify('Еще тише.');
      expect(r2).toContain('снижена');
      const r3 = await LocalClassifier.classify('Поставь на сорок');
      expect(r3).toContain('40%');
      expect(r3).not.toContain('Задача');
    });

    it('should handle STT phonetic variant "Включи музыку ока." as VK Music', async () => {
      const result = await LocalClassifier.classify('Включи музыку ока.');
      expect(result).not.toBeNull();
      expect(result).toContain('ВКонтакте');
    });
  });
});

