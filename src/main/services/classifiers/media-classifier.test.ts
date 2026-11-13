import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaClassifier } from './media-classifier';
import { skillsStore } from '../../ipc/skills.ipc';

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([])
  },
  shell: {
    openExternal: vi.fn()
  }
}));

vi.mock('../media/system-media', () => ({
  SystemMediaController: {
    sendKey: vi.fn()
  }
}));

vi.mock('../media/vk-websocket-server', () => ({
  vkWebSocketServer: {
    sendCommand: vi.fn().mockReturnValue({ success: true, clientCount: 1 }),
    hasClients: vi.fn().mockReturnValue(true)
  }
}));

describe('MediaClassifier', () => {
  beforeEach(() => {
    skillsStore.clear();
    skillsStore.set('media', { id: 'media', title: 'Media', desc: 'desc', icon: 'Music', triggers: [], enabled: true });
  });

  it('should toggle play', async () => {
    const result = MediaClassifier.classify('включи музыку');
    expect(result).toBe('Запускаю музыку ВКонтакте.');
  });

  it('should increase volume', async () => {
    const result = MediaClassifier.classify('сделай погромче');
    expect(result).toContain('Громкость музыки ВКонтакте увеличена');
  });

  it('should handle speech recognition artifacts for VK music', () => {
      const result1 = MediaClassifier.classify('в ключи музыкого k');
      expect(result1).toContain('ВКонтакте');

      const result2 = MediaClassifier.classify('следующий трак');
      expect(result2).toContain('следующий трек');
    });

    it('should intelligently pause playback for speech recognition variants ("музу кулука", "пк музыку")', () => {
      const result1 = MediaClassifier.classify('поставь на пауза музу кулука');
      expect(result1).toContain('приостановлено');

      const result2 = MediaClassifier.classify('блять поставь пк музыку на пауза');
      expect(result2).toContain('приостановлено');

      const result3 = MediaClassifier.classify('поставь пока на пауза');
      expect(result3).toContain('приостановлено');

      const result4 = MediaClassifier.classify('поставь на паузу');
      expect(result4).toContain('приостановлено');

      const result5 = MediaClassifier.classify('выключи музыку');
      expect(result5).toContain('приостановлено');

      const result6 = MediaClassifier.classify('выключи музыку пока');
      expect(result6).toContain('приостановлено');

      const result7 = MediaClassifier.classify('останови музыку');
      expect(result7).toContain('приостановлено');
    });
  });
