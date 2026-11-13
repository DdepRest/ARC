import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reactive } from 'vue';

const { mockChatStore, mockUIStore, mockReactor } = vi.hoisted(() => {
  return {
    mockChatStore: {
      addMessage: vi.fn(),
      updateMessageChunks: vi.fn(),
      clearStreaming: vi.fn(),
      setAgentStatus: vi.fn(),
      setExecutionSteps: vi.fn(),
      completeExecutionStep: vi.fn(),
      failExecutionStep: vi.fn(),
      messages: [] as any[],
      isStreaming: false,
      currentResponse: '',
      isSearching: false
    },
    mockUIStore: {
      setTimelineStep: vi.fn(),
      setActiveRoute: vi.fn(),
      setActiveModel: vi.fn(),
      setLastRouterError: vi.fn(),
      setStandbyMode: vi.fn(),
      addAppNotification: vi.fn(),
      speak: vi.fn()
    },
    mockReactor: {
      setReactorState: vi.fn(),
      setState: vi.fn()
    }
  };
});

const reactiveChatStore = reactive(mockChatStore);

// Mock Pinia
vi.mock('pinia', () => ({
  defineStore: vi.fn(() => vi.fn(() => ({})))
}));

vi.mock('../stores/chat.store', () => ({
  useChatStore: () => reactiveChatStore
}));

vi.mock('../stores/sessions.store', () => ({
  useSessionsStore: () => ({
    activeSessionId: 'default',
    sessions: [{ id: 'default', summary: '' }]
  })
}));

vi.mock('../../../stores/ui.store', () => ({
  useUIStore: () => mockUIStore
}));

vi.mock('../../settings/stores/settings.store', () => ({
  useSettingsStore: () => ({ sttProvider: 'native' })
}));

vi.mock('../../../composables/useReactor', () => ({
  useReactor: () => mockReactor
}));

vi.mock('../../../composables/useVoiceCommands', () => ({
  useVoiceCommands: () => ({
    processVoiceCommand: vi.fn()
  })
}));

const mockDispatchEvent = vi.fn();
const mockAiRequest = vi.fn();
const mockClassifyLocalCommand = vi.fn();

// Pre-setup window before useChat is imported
if (typeof global.window === 'undefined') {
  (global as any).window = {};
}
(global.window as any).dispatchEvent = mockDispatchEvent;
(global.window as any).api = {
  aiRequest: mockAiRequest,
  classifyCommand: mockClassifyLocalCommand,
  onAiChunk: vi.fn().mockReturnValue(() => {}),
  onAiRouteInfo: vi.fn().mockReturnValue(() => {}),
  onAiTextCorrected: vi.fn().mockReturnValue(() => {})
};
(global.window as any).CustomEvent = class CustomEvent {
  type: string;
  detail?: any;
  constructor(type: string, options?: any) {
    this.type = type;
    this.detail = options?.detail;
  }
};

import { useChat } from './useChat';

describe('useChat composable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle stop command, dispatch stop event and reset timeline', async () => {
    const { sendMessage } = useChat();
    await sendMessage('хватит');
    
    expect(mockDispatchEvent).toHaveBeenCalled();
    const call = mockDispatchEvent.mock.calls.find(c => c[0].type === 'arc:stop-audio');
    expect(call).toBeDefined();
    expect(mockReactor.setReactorState).toHaveBeenCalledWith('idle');
  });

  it('should handle gratitude command, respond politely, speak reply and clear dialogue window', async () => {
    const { sendMessage } = useChat();
    await sendMessage('спасибо большое');

    expect(mockChatStore.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      content: 'спасибо большое'
    }));
    expect(mockChatStore.addMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      blockType: 'final_answer'
    }));
    expect(mockUIStore.speak).toHaveBeenCalled();
    expect(mockDispatchEvent).toHaveBeenCalled();
    const clearCall = mockDispatchEvent.mock.calls.find(c => c[0].type === 'arc:clear-dialogue-window');
    expect(clearCall).toBeDefined();
  });

  it('should skip LLM when LocalClassifier returns a response', async () => {
    mockClassifyLocalCommand.mockResolvedValueOnce('Локальный ответ');
    const { sendMessage } = useChat();
    
    await sendMessage('включи музыку');
    
    expect(mockClassifyLocalCommand).toHaveBeenCalledWith('включи музыку');
    expect(mockChatStore.addMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Локальный ответ' }));
    expect(mockAiRequest).not.toHaveBeenCalled();
  });

  it('should proceed to LLM when LocalClassifier returns null', async () => {
    mockClassifyLocalCommand.mockResolvedValueOnce(null);
    mockAiRequest.mockResolvedValueOnce({ success: true });
    
    const { sendMessage } = useChat();
    await sendMessage('расскажи сказку');
    
    expect(mockClassifyLocalCommand).toHaveBeenCalledWith('расскажи сказку');
    expect(mockAiRequest).toHaveBeenCalled();
  });

  it('should reactively expose messages and streaming flags from chatStore', () => {
    reactiveChatStore.messages = [{ id: 1, role: 'user', content: 'Привет' } as any];
    reactiveChatStore.isStreaming = true;
    reactiveChatStore.currentResponse = 'Ответ...';
    reactiveChatStore.isSearching = false;

    const { messages, isStreaming, currentResponse, isSearching } = useChat();

    expect(messages.value).toHaveLength(1);
    expect(messages.value[0].content).toBe('Привет');
    expect(isStreaming.value).toBe(true);
    expect(currentResponse.value).toBe('Ответ...');
    expect(isSearching.value).toBe(false);

    // Update store messages dynamically
    reactiveChatStore.messages = [
      { id: 1, role: 'user', content: 'Привет' } as any,
      { id: 2, role: 'assistant', content: 'Здравствуйте' } as any
    ];
    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].content).toBe('Здравствуйте');
  });
});
