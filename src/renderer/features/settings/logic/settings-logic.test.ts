import { describe, it, expect, vi } from 'vitest';
import { evaluateConflicts, type ConflictRuleContext } from './conflict-rules';
import { aggregateModelsState, BASE_SYSTEM_MODELS } from './downloads-adapter';

describe('Settings Conflict Rules (conflict-rules.ts)', () => {
  it('Rule 1: should detect conflict when forcedOfflineMode is true and useLocalLLM is false', () => {
    const ctx: ConflictRuleContext = {
      forcedOfflineMode: true,
      useLocalLLM: false,
      exclusiveMode: false,
      microphoneEnabled: true,
      wakeWordEnabled: true
    };

    const enableLocalAIMock = vi.fn();
    const conflicts = evaluateConflicts(ctx, {
      enableLocalAI: enableLocalAIMock,
      enableMicrophone: vi.fn()
    });

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].id).toBe('conflict-offline-no-local');
    expect(conflicts[0].ruleNumber).toBe(1);
    expect(conflicts[0].message).toContain('облачные запросы заблокированы');

    conflicts[0].resolve();
    expect(enableLocalAIMock).toHaveBeenCalledTimes(1);
  });

  it('Rule 2: should detect conflict when exclusiveMode is true and pinned provider has no key or is quarantined', () => {
    const ctx: ConflictRuleContext = {
      forcedOfflineMode: false,
      useLocalLLM: true,
      exclusiveMode: true,
      exclusiveProvider: {
        id: 'openai',
        name: 'OpenAI',
        apiKey: '',
        isQuarantined: false
      },
      microphoneEnabled: true,
      wakeWordEnabled: true
    };

    const openProviderCardMock = vi.fn();
    const conflicts = evaluateConflicts(ctx, {
      enableLocalAI: vi.fn(),
      openProviderCard: openProviderCardMock,
      enableMicrophone: vi.fn()
    });

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].id).toBe('conflict-exclusive-unavailable');
    expect(conflicts[0].ruleNumber).toBe(2);
    expect(conflicts[0].message).toContain('не задан API-ключ');

    conflicts[0].resolve();
    expect(openProviderCardMock).toHaveBeenCalledWith('openai');
  });

  it('Rule 3: should detect conflict when microphone is disabled while wake word is enabled', () => {
    const ctx: ConflictRuleContext = {
      forcedOfflineMode: false,
      useLocalLLM: true,
      exclusiveMode: false,
      microphoneEnabled: false,
      wakeWordEnabled: true
    };

    const enableMicMock = vi.fn();
    const conflicts = evaluateConflicts(ctx, {
      enableLocalAI: vi.fn(),
      enableMicrophone: enableMicMock
    });

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].id).toBe('conflict-mic-off-wakeword-on');
    expect(conflicts[0].ruleNumber).toBe(3);
    expect(conflicts[0].message).toContain('Кодовое слово включено, но микрофон выключен');

    conflicts[0].resolve();
    expect(enableMicMock).toHaveBeenCalledTimes(1);
  });

  it('should return empty conflicts when configuration is harmonious', () => {
    const ctx: ConflictRuleContext = {
      forcedOfflineMode: false,
      useLocalLLM: true,
      exclusiveMode: false,
      microphoneEnabled: true,
      wakeWordEnabled: true
    };

    const conflicts = evaluateConflicts(ctx, {
      enableLocalAI: vi.fn(),
      enableMicrophone: vi.fn()
    });

    expect(conflicts.length).toBe(0);
  });
});

describe('Downloads Adapter (downloads-adapter.ts)', () => {
  it('should report default installed system models', () => {
    const models = aggregateModelsState(['whisper-small-int8', 'silero-v5.6']);
    const whisper = models.find(m => m.id === 'whisper-small-int8');
    const qwen = models.find(m => m.id === 'qwen2.5-1.5b-gguf');

    expect(whisper?.status).toBe('installed');
    expect(qwen?.status).toBe('not_installed');
  });

  it('should reflect active downloading progress', () => {
    const models = aggregateModelsState(
      ['whisper-small-int8'],
      { 'qwen2.5-1.5b-gguf': 45 }
    );
    const qwen = models.find(m => m.id === 'qwen2.5-1.5b-gguf');

    expect(qwen?.status).toBe('downloading');
    expect(qwen?.progress).toBe(45);
  });
});
