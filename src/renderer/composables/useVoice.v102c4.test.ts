import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useVoice, voiceMode, canOpenDialogueWindow } from './useVoice';

// Mock Web API
const AudioContextMock = vi.fn().mockImplementation(() => ({
  createScriptProcessor: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn()
  }),
  close: vi.fn(),
  state: 'closed'
}));
vi.stubGlobal('AudioContext', AudioContextMock);
vi.stubGlobal('webkitAudioContext', AudioContextMock);
vi.stubGlobal('Worker', vi.fn());

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
  },
  ipcRenderer: {
    on: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn().mockResolvedValue({})
  }
}));

describe('VoiceFSM ТЗ v1.0.2-c4 Acceptance Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const { clearActiveDialogueWindow } = useVoice();
    clearActiveDialogueWindow();
  });

  it('Block 1.1 & 1.2: voiceMode initial state is WAKE_WORD_ONLY and canOpenDialogueWindow is false', () => {
    expect(voiceMode.value).toBe('WAKE_WORD_ONLY');
    expect(canOpenDialogueWindow()).toBe(false);
  });

  it('Block 1.2 & 1.4: wake word hit sets voiceMode to ACTIVE_DIALOGUE and allows opening dialogue window', () => {
    const { evaluateVoiceTrigger } = useVoice();
    const result = evaluateVoiceTrigger('арк какая погода');
    expect(result.wakeWordFound).toBe(true);
    expect(voiceMode.value).toBe('ACTIVE_DIALOGUE');
    expect(canOpenDialogueWindow()).toBe(true);
  });

  it('Block 1.4 & 1.5: gratitude closer sets voiceMode to WAKE_WORD_ONLY and suppresses reopening until next wake word', () => {
    const { evaluateVoiceTrigger, refreshActiveDialogueWindow, isDialogueWindowActive } = useVoice();
    
    // First, enter active dialogue
    evaluateVoiceTrigger('арк включи свет');
    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);
    expect(voiceMode.value).toBe('ACTIVE_DIALOGUE');

    // Say "спасибо"
    const gratitudeRes = evaluateVoiceTrigger('спасибо');
    expect(gratitudeRes.shouldProcess).toBe(false);
    expect(voiceMode.value).toBe('WAKE_WORD_ONLY');
    expect(canOpenDialogueWindow()).toBe(false);
    expect(isDialogueWindowActive()).toBe(false);

    // After gratitude closer, canOpenDialogueWindow is strictly false
    expect(canOpenDialogueWindow()).toBe(false);

    // Reset cooldown to simulate passing of cooldown before next hit
    const { resetWakeWordLock } = useVoice();
    resetWakeWordLock();

    // Next hit wake word restores ACTIVE_DIALOGUE
    const nextWake = evaluateVoiceTrigger('арк ты тут');
    expect(nextWake.wakeWordFound).toBe(true);
    expect(voiceMode.value).toBe('ACTIVE_DIALOGUE');
    expect(canOpenDialogueWindow()).toBe(true);
  });

  it('Block 1.5: follow-up query works in active dialogue immediately after response', () => {
    const { evaluateVoiceTrigger, refreshActiveDialogueWindow, isDialogueWindowActive } = useVoice();
    
    // Initial wake word command
    evaluateVoiceTrigger('арк какая погода в Москве');
    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);
    expect(voiceMode.value).toBe('ACTIVE_DIALOGUE');

    // Follow-up query "а завтра?" without wake word
    const followUp = evaluateVoiceTrigger('а завтра');
    expect(followUp.dialogueActive).toBe(true);
    expect(followUp.shouldProcess).toBe(true);
  });
});
