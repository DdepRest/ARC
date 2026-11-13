import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { isSimpleQuery } from '../../main/services/llm/intent-classifier';

// Mock Web API which holds AudioContext, Worker, etc.
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

// Mock electron to prevent issues when importing AiService
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

const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((k) => mockStorage[k] || null),
  setItem: vi.fn((k, v) => { mockStorage[k] = v; }),
  removeItem: vi.fn((k) => { delete mockStorage[k]; }),
  clear: vi.fn(() => { for (const k in mockStorage) delete mockStorage[k]; })
});

// Mock @xenova/transformers fully
vi.mock('@xenova/transformers', () => {
  return {
    pipeline: vi.fn(),
    env: {
      allowLocalModels: false,
      useBrowserCache: true,
      backends: {
        onnx: {
          wasm: {
            numThreads: 1
          }
        }
      }
    }
  };
});

import { useVoice, safeCloseAudioContext } from './useVoice';
import { useSettingsStore } from '../features/settings/stores/settings.store';
import { AiService } from '../../main/services/ai.service';
import { restorePunctuation } from '../../shared/utils/russian-punctuator';

describe('useVoice postProcessTranscription Unit Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should clean up common oговорок and map them successfully', () => {
    const store = useSettingsStore();
    const { postProcessTranscription } = useVoice();

    // Built-in standard corrections
    expect(postProcessTranscription('открый ютубе')).toContain('открой ютуб');
    expect(postProcessTranscription('закрои телеграм')).toContain('закрой telegram');
    expect(postProcessTranscription('запусти плэй')).toContain('запусти плей');
    expect(postProcessTranscription('представьте')).toBe('представься');
    expect(postProcessTranscription('представьтесь')).toBe('представься');
    expect(postProcessTranscription('арк представьте')).toContain('a.r.c. представься');
  });

  it('should apply user dictionary entries with highest priority', () => {
    const store = useSettingsStore();
    const { postProcessTranscription } = useVoice();

    // Set custom STT correction
    store.addSttCorrection('погода', 'хаос');
    expect(postProcessTranscription('какая сегодня погода')).toContain('какая сегодня хаос');
  });

  it('should format wake words correctly', () => {
    const store = useSettingsStore();
    const { postProcessTranscription } = useVoice();

    // Default wake word mappings
    expect(postProcessTranscription('привет арк')).toContain('привет a.r.c.');
  });

  it('should execute intelligent token fuzzy vocabulary matching (edit distance)', () => {
    const store = useSettingsStore();
    const { postProcessTranscription } = useVoice();

    // Fuzzy matcher mapping (e.g. "открый" vs "открой" distance 1)
    expect(postProcessTranscription('открый')).toBe('открой');
    expect(postProcessTranscription('закрои')).toBe('закрой');
    
    // Far away distance words should NOT match to avoid false replacements
    expect(postProcessTranscription('самолет')).toBe('самолет');
  });

  it('should maintain an active dialogue window for 10 seconds', () => {
    const { isDialogueWindowActive, refreshActiveDialogueWindow, clearActiveDialogueWindow } = useVoice();

    clearActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(false);

    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);

    clearActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(false);
  });

  it('should have sttKeywordsEnabled true by default and gate speech correctly', () => {
    const store = useSettingsStore();
    expect(store.sttKeywordsEnabled).toBe(true);

    const { evaluateVoiceTrigger, isTriggeredByText, clearActiveDialogueWindow, refreshActiveDialogueWindow } = useVoice();
    clearActiveDialogueWindow();

    // 1. Without wake word outside active window
    const res1 = evaluateVoiceTrigger('включи музыку');
    expect(res1.shouldProcess).toBe(false);
    expect(isTriggeredByText('музыку')).toBe(false); // Barge-in won't interrupt

    // 2. With wake word
    const res2 = evaluateVoiceTrigger('арк включи музыку');
    expect(res2.shouldProcess).toBe(true);
    expect(res2.wakeWordFound).toBe(true);
    expect(res2.cleanedCommand).toBe('включи музыку');

    // 3. Inside active dialogue window
    refreshActiveDialogueWindow();
    const res3 = evaluateVoiceTrigger('включи музыку');
    expect(res3.shouldProcess).toBe(true);
    expect(res3.dialogueActive).toBe(true);
  });
});

describe('Wake-word Logic & Anti-Hallucination ТЗ v1.0 Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const { resetWakeWordLock, clearActiveDialogueWindow } = useVoice();
    resetWakeWordLock();
    clearActiveDialogueWindow();
  });

  it('Filter 1 (Negation): should reject wake word if preceded by negation word, clear dialogue, and lock for 5s', () => {
    const { evaluateVoiceTrigger, refreshActiveDialogueWindow, getWakeWordLockUntil } = useVoice();
    
    // Simulate active dialogue window first
    refreshActiveDialogueWindow();

    // "я не арк" must forcibly close dialogue window and reject
    const before = Date.now();
    const res1 = evaluateVoiceTrigger('я не арк');
    expect(res1.wakeWordFound).toBe(false);
    expect(res1.shouldProcess).toBe(false);
    expect(res1.dialogueActive).toBe(false);
    expect(getWakeWordLockUntil()).toBeGreaterThanOrEqual(before + 4900);

    // "нет арк"
    const res2 = evaluateVoiceTrigger('нет арк');
    expect(res2.wakeWordFound).toBe(false);
    expect(res2.shouldProcess).toBe(false);

    // "без арк"
    const res3 = evaluateVoiceTrigger('без арк');
    expect(res3.wakeWordFound).toBe(false);
    expect(res3.shouldProcess).toBe(false);
  });

  it('Stop words detection: checkBargeInStop should recognize all Russian and English stop words', () => {
    const { checkBargeInStop } = useVoice();
    expect(checkBargeInStop('стоп')).toBe(true);
    expect(checkBargeInStop('арк стоп')).toBe(true);
    expect(checkBargeInStop('замолчи')).toBe(true);
    expect(checkBargeInStop('хватит говорить')).toBe(true);
    expect(checkBargeInStop('тихо')).toBe(true);
    expect(checkBargeInStop('stop')).toBe(true);
    expect(checkBargeInStop('отмена')).toBe(true);
    expect(checkBargeInStop('включи музыку')).toBe(false);
  });

  it('Filter 2 (Position): should accept wake word strictly in first 3 words and reject after', () => {
    const { evaluateVoiceTrigger, resetWakeWordLock } = useVoice();
    
    // Position 0 (1st word)
    const res1 = evaluateVoiceTrigger('арк, как дела?');
    expect(res1.wakeWordFound).toBe(true);
    expect(res1.shouldProcess).toBe(true);
    expect(res1.cleanedCommand).toBe('как дела');

    resetWakeWordLock();
    // Position 2 (3rd word: 'привет', 'слушай', 'арк')
    const res2 = evaluateVoiceTrigger('привет слушай арк включи радио');
    expect(res2.wakeWordFound).toBe(true);
    expect(res2.shouldProcess).toBe(true);

    resetWakeWordLock();
    // Position 3 (4th word: 'привет', 'я', 'говорю', 'арк') -> REJECTED
    const res3 = evaluateVoiceTrigger('привет я говорю арк включи радио');
    expect(res3.wakeWordFound).toBe(false);
    expect(res3.shouldProcess).toBe(false);

    resetWakeWordLock();
    // Position 5 (6th word or later) -> REJECTED
    const res4 = evaluateVoiceTrigger('рассказываю вам длинную историю про арк');
    expect(res4.wakeWordFound).toBe(false);
    expect(res4.shouldProcess).toBe(false);

    resetWakeWordLock();
    // Acceptance: monologue "...без слова арк но когда я говорю спасибо..." -> MUST NOT trigger
    const resMonologue = evaluateVoiceTrigger('...без слова арк но когда я говорю спасибо...');
    expect(resMonologue.wakeWordFound).toBe(false);
    expect(resMonologue.shouldProcess).toBe(false);

    resetWakeWordLock();
    // Acceptance: "Арк, какая погода" -> MUST trigger
    const resWeather = evaluateVoiceTrigger('Арк, какая погода');
    expect(resWeather.wakeWordFound).toBe(true);
    expect(resWeather.shouldProcess).toBe(true);
    expect(resWeather.cleanedCommand).toBe('какая погода');
  });

  it('Gratitude closers: should immediately close dialogue window without triggering command', () => {
    const { evaluateVoiceTrigger, refreshActiveDialogueWindow, isDialogueWindowActive } = useVoice();
    
    // Test while dialogue window is open
    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);

    const res1 = evaluateVoiceTrigger('спасибо');
    expect(res1.shouldProcess).toBe(false);
    expect(isDialogueWindowActive()).toBe(false);

    refreshActiveDialogueWindow();
    const res2 = evaluateVoiceTrigger('спасибо большое');
    expect(res2.shouldProcess).toBe(false);
    expect(isDialogueWindowActive()).toBe(false);

    refreshActiveDialogueWindow();
    const res3 = evaluateVoiceTrigger('благодарю');
    expect(res3.shouldProcess).toBe(false);
    expect(isDialogueWindowActive()).toBe(false);

    refreshActiveDialogueWindow();
    const res4 = evaluateVoiceTrigger('всё, спасибо');
    expect(res4.shouldProcess).toBe(false);
    expect(isDialogueWindowActive()).toBe(false);

    refreshActiveDialogueWindow();
    const res5 = evaluateVoiceTrigger('от души');
    expect(res5.shouldProcess).toBe(false);
    expect(isDialogueWindowActive()).toBe(false);
  });

  it('Filter 3 (Empty remainder): should reject bare wake-word or echo without command', () => {
    const { evaluateVoiceTrigger } = useVoice();
    
    // Bare wake word
    const res1 = evaluateVoiceTrigger('арк');
    expect(res1.wakeWordFound).toBe(false);
    expect(res1.shouldProcess).toBe(false);

    // Wake word with punctuation
    const res2 = evaluateVoiceTrigger('арк !');
    expect(res2.wakeWordFound).toBe(false);
    expect(res2.shouldProcess).toBe(false);

    // Valid command remainder
    const res3 = evaluateVoiceTrigger('арк, привет');
    expect(res3.wakeWordFound).toBe(true);
    expect(res3.shouldProcess).toBe(true);
    expect(res3.cleanedCommand).toBe('привет');
  });

  it('Global State Lock: should enforce 3s cooldown on wake-word triggers', () => {
    const { evaluateVoiceTrigger, resetWakeWordLock } = useVoice();
    
    // 1st trigger: should succeed
    const res1 = evaluateVoiceTrigger('арк включи свет');
    expect(res1.wakeWordFound).toBe(true);
    expect(res1.shouldProcess).toBe(true);

    // Rapid second trigger (simulating partial spam or echo): blocked by cooldown lock
    const res2 = evaluateVoiceTrigger('арк включи свет');
    expect(res2.wakeWordFound).toBe(false);
    expect(res2.shouldProcess).toBe(false);

    // After reset: should trigger again
    resetWakeWordLock();
    const res3 = evaluateVoiceTrigger('арк выключи свет');
    expect(res3.wakeWordFound).toBe(true);
    expect(res3.shouldProcess).toBe(true);
  });

  it('Context Preservation: should strip only leading wake-word and preserve subsequent occurrences in sentence', () => {
    const { evaluateVoiceTrigger, resetWakeWordLock } = useVoice();
    resetWakeWordLock();

    const res = evaluateVoiceTrigger('арк хочу познакомить тебя с леной арк это лена лена это арк');
    expect(res.wakeWordFound).toBe(true);
    expect(res.shouldProcess).toBe(true);
    expect(res.cleanedCommand).toBe('хочу познакомить тебя с леной арк это лена лена это арк');

    const formatted = restorePunctuation(res.cleanedCommand);
    expect(formatted).toContain('АРК');
    expect(formatted).toContain('Лена');
  });

  it('State Machine: should transition IDLE -> TRIGGERED on hit and bypass duplicate wake detection', () => {
    const { evaluateVoiceTrigger, resetWakeWordLock, getVoiceState, setVoiceState } = useVoice();
    resetWakeWordLock();
    expect(getVoiceState()).toBe('IDLE');

    // Trigger hit transitions state to TRIGGERED
    const res = evaluateVoiceTrigger('арк привет');
    expect(res.wakeWordFound).toBe(true);
    expect(getVoiceState()).toBe('TRIGGERED');

    // Subsequent voice input in TRIGGERED state bypasses wake detection (prevents bounce/echo)
    const resDuringTriggered = evaluateVoiceTrigger('арк как дела');
    expect(resDuringTriggered.wakeWordFound).toBe(false);

    // Set to PROCESSING
    setVoiceState('PROCESSING');
    expect(getVoiceState()).toBe('PROCESSING');

    // In PROCESSING state, wake detection is still blocked
    const resDuringProcessing = evaluateVoiceTrigger('арк');
    expect(resDuringProcessing.wakeWordFound).toBe(false);

    // Returning to IDLE
    setVoiceState('IDLE');
    expect(getVoiceState()).toBe('IDLE');
  });

  it('Word Boundary: should NOT trigger on words that merely contain wake-word as a substring', () => {
    const { evaluateVoiceTrigger, resetWakeWordLock } = useVoice();
    resetWakeWordLock();

    // "красивая триумфальная арка в городе" -> "арка" should NOT match "арк"
    const res1 = evaluateVoiceTrigger('красивая триумфальная арка в городе');
    expect(res1.wakeWordFound).toBe(false);

    resetWakeWordLock();
    // "накинь аркан на лошадь" -> "аркан" should NOT match "арк"
    const res2 = evaluateVoiceTrigger('накинь аркан на лошадь');
    expect(res2.wakeWordFound).toBe(false);

    resetWakeWordLock();
    // "я не арк" -> strictly rejected by negation and zero hit
    const res3 = evaluateVoiceTrigger('я не арк');
    expect(res3.wakeWordFound).toBe(false);
    expect(res3.shouldProcess).toBe(false);
  });
});

describe('Routing / isSimpleQuery Unit Tests', () => {
  it('should identify short commands without complex keywords as simple', () => {
    expect(isSimpleQuery('привет')).toBe(true);
    expect(isSimpleQuery('как дела?')).toBe(true);
    expect(isSimpleQuery('открой ютуб')).toBe(true);
  });

  it('should identify queries containing complex keywords as complex', () => {
    expect(isSimpleQuery('напиши код на питоне')).toBe(false);
    expect(isSimpleQuery('создай базу данных sqlite')).toBe(false);
    expect(isSimpleQuery('покажи лог компиляции модуля')).toBe(false);
  });

  it('should identify extremely long queries as complex (length >= 80 characters)', () => {
    const longQuery = 'я хотел спросить тебя о возможности рассказать историю про то как строилось ядро';
    expect(longQuery.length).toBeGreaterThanOrEqual(80);
    expect(isSimpleQuery(longQuery)).toBe(false);
  });
});

describe('Five Critical Bugs v1.0.1-b1 Verification Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('Bug 1 (Gratitude closer priority): handleTranscriptionResult should close dialogue window immediately without phantom filter log', () => {
    const { handleTranscriptionResult, refreshActiveDialogueWindow, isDialogueWindowActive, getVoiceState } = useVoice();
    
    // Open 15s dialogue window
    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);

    // "спасибо" should immediately close the window and set FSM to IDLE
    handleTranscriptionResult('спасибо');
    expect(isDialogueWindowActive()).toBe(false);
    expect(getVoiceState()).toBe('IDLE');

    // Test with "всё, спасибо"
    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);
    handleTranscriptionResult('всё, спасибо');
    expect(isDialogueWindowActive()).toBe(false);
    expect(getVoiceState()).toBe('IDLE');

    // Test with "спасибо большое"
    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);
    handleTranscriptionResult('спасибо большое');
    expect(isDialogueWindowActive()).toBe(false);
    expect(getVoiceState()).toBe('IDLE');
  });

  it('Bug 3 (AudioContext guard): safeCloseAudioContext must never throw on closed or null context', () => {
    // 1. null / undefined context
    expect(() => safeCloseAudioContext(null)).not.toThrow();
    expect(() => safeCloseAudioContext(undefined)).not.toThrow();

    // 2. Already closed context
    const closedMock = {
      state: 'closed',
      close: vi.fn()
    } as any;
    expect(() => safeCloseAudioContext(closedMock)).not.toThrow();
    expect(closedMock.close).not.toHaveBeenCalled();

    // 3. Context in running state that throws InvalidStateError synchronously
    const throwingMock = {
      state: 'running',
      close: vi.fn().mockImplementation(() => {
        throw new Error('Cannot close a closed AudioContext');
      })
    } as any;
    expect(() => safeCloseAudioContext(throwingMock)).not.toThrow();

    // 4. Context that rejects as a promise
    const rejectingMock = {
      state: 'running',
      close: vi.fn().mockRejectedValue(new Error('InvalidStateError: Cannot close a closed AudioContext.'))
    } as any;
    expect(() => safeCloseAudioContext(rejectingMock)).not.toThrow();
  });

  it('Bug 4 (Stop-word debounce): handleStopWordAction should debounce duplicate triggers within 1000ms and not duplicate window clear', () => {
    const { handleStopWordAction, refreshActiveDialogueWindow, isDialogueWindowActive } = useVoice();
    
    // Ensure mock window exists in node test environment
    const dispatchMock = vi.fn();
    vi.stubGlobal('window', {
      dispatchEvent: dispatchMock,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    refreshActiveDialogueWindow();
    expect(isDialogueWindowActive()).toBe(true);

    // First stop-word trigger
    handleStopWordAction('пауза', 'Test');
    expect(isDialogueWindowActive()).toBe(false);
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    // Immediate second trigger within 1000ms window should be ignored by debounce
    handleStopWordAction('пауза', 'Test');
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('Bug 5 (Wake-word position filter): should reject wake word mentions occurring after the first 3 words', () => {
    const { evaluateVoiceTrigger, resetWakeWordLock } = useVoice();
    resetWakeWordLock();

    // User session monologue: "...без слова a.r.c. но когда я говорю спасибо..." (a.r.c. is 16th word)
    const monologue = 'когда он заканчивает предложение то он еще слушает меня пятнадцать секунд без вейкворда без слова a.r.c. но когда я говорю спасибо он должен эту функцию то есть закрывать';
    const monologueRes = evaluateVoiceTrigger(monologue);
    expect(monologueRes.wakeWordFound).toBe(false);
    expect(monologueRes.shouldProcess).toBe(false);

    resetWakeWordLock();
    // Wake word strictly in position 0, 1, or 2 should be accepted
    const pos0 = evaluateVoiceTrigger('арк какая погода');
    expect(pos0.wakeWordFound).toBe(true);
    expect(pos0.shouldProcess).toBe(true);

    resetWakeWordLock();
    const pos1 = evaluateVoiceTrigger('привет арк включи свет');
    expect(pos1.wakeWordFound).toBe(true);
    expect(pos1.shouldProcess).toBe(true);

    resetWakeWordLock();
    const pos2 = evaluateVoiceTrigger('эй привет арк сделай чай');
    expect(pos2.wakeWordFound).toBe(true);
    expect(pos2.shouldProcess).toBe(true);

    resetWakeWordLock();
    // Position 3 (4th word) must be rejected
    const pos3 = evaluateVoiceTrigger('эй слушай меня арк сделай чай');
    expect(pos3.wakeWordFound).toBe(false);
    expect(pos3.shouldProcess).toBe(false);

    resetWakeWordLock();
    // Negation filter: "без слова арк" -> rejected
    const neg1 = evaluateVoiceTrigger('без слова арк');
    expect(neg1.wakeWordFound).toBe(false);

    resetWakeWordLock();
    // Negation filter: "не арк" -> rejected
    const neg2 = evaluateVoiceTrigger('не арк');
    expect(neg2.wakeWordFound).toBe(false);
  });

  it('Dictation isolation: suspendWakeWord suppresses wake-word evaluation and accumulates dictationTranscript until resumeWakeWord', async () => {
    const {
      suspendWakeWord,
      resumeWakeWord,
      isWakeWordSuspended,
      dictationTranscript,
      evaluateVoiceTrigger,
      handleTranscriptionResult,
      resetWakeWordLock,
    } = useVoice();
    resetWakeWordLock();

    suspendWakeWord();
    expect(isWakeWordSuspended.value).toBe(true);

    // Wake word should not trigger while suspended
    const trig = evaluateVoiceTrigger('арк включи музыку');
    expect(trig.wakeWordFound).toBe(false);
    expect(trig.shouldProcess).toBe(false);

    // Final transcript should populate dictationTranscript without dispatching voice commands
    handleTranscriptionResult('как дела');
    expect(dictationTranscript.value).toBe('Как дела?');

    await resumeWakeWord();
    expect(isWakeWordSuspended.value).toBe(false);
    expect(dictationTranscript.value).toBe('');
  });
});
