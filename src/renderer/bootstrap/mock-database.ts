import { getMockTranscriptionHandlers } from './mock-transcription';
import { getMockObjectiveHandlers } from './mock-objectives';
import { createMockDialogTrashHandlers, purgeExpiredMockSessions } from './mock-dialog-trash';
import { synthesizeMockWorkflowChunks } from '../../shared/utils/auto-workflow';

export function getMockSessions(): any[] {
  if ((window as any)._mockSessions) return (window as any)._mockSessions;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_mock_sessions') : null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        (window as any)._mockSessions = parsed;
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse arc_mock_sessions from localStorage:', e);
    }
  }
  const initialSessions = [
    {
      id: 1,
      name: 'Основной контур A.R.C.',
      message_count: 2,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
      is_pinned: 1,
      is_archived: 0,
      summary: 'Инициализация ядра реактора и проверка модулей',
      tags: null
    }
  ];
  (window as any)._mockSessions = initialSessions;
  saveMockSessions(initialSessions);
  return initialSessions;
}
export function saveMockSessions(sessions: any[]) {
  (window as any)._mockSessions = sessions;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('arc_mock_sessions', JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to save arc_mock_sessions to localStorage:', e);
  }
}
export function saveMockMessages(messages: Record<number, any[]>) {
  (window as any)._mockMessages = messages;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('arc_mock_messages', JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save arc_mock_messages to localStorage:', e);
  }
}

export function getMockMessages(): Record<number, any[]> {
  if ((window as any)._mockMessages) return (window as any)._mockMessages;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('arc_mock_messages') : null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        (window as any)._mockMessages = parsed;
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse arc_mock_messages from localStorage:', e);
    }
  }
  const initialMessages: Record<number, any[]> = { 1: [] };
  (window as any)._mockMessages = initialMessages;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('arc_mock_messages', JSON.stringify(initialMessages));
  } catch (e) { console.warn('Ignored error in catch', e); }
  return initialMessages;
}
export function setupElectronApiMock() {
  (window as any)._mockSkills = [
    { id: 'web-search', title: 'Веб-поиск', desc: 'Поиск информации в глобальной сети', icon: 'Globe', enabled: true, triggers: ['найди в интернете', 'погугли'] },
    { id: 'files', title: 'Проводник', desc: 'Управление локальными файлами и папками', icon: 'Folder', enabled: true, triggers: ['открой файл', 'найди документ'] },
    { id: 'media', title: 'Медиа-центр', desc: 'Управление воспроизведением и громкостью', icon: 'Music', enabled: true, triggers: ['включи музыку', 'пауза'] },
    { id: 'terminal', title: 'Терминал', desc: 'Выполнение системных команд и скриптов', icon: 'Terminal', enabled: true, triggers: ['выполни команду'] }
  ];
  if (!window.api) {
    console.warn('ARC: Running in Web mode. Injecting API mock...');
    (window as any).api = {
      getSystemInfo: async () => ({ os: 'Web', distro: 'Browser', arch: 'wasm', cpu: 'In-Browser Runtime', cores: 8, memory: 16 }),
      getSystemMetrics: async () => ({ cpuLoad: Math.round(Math.random() * 20), memoryUsage: 45, temperature: 42, cpuTemperature: 42, gpuTemperature: 46, uptime: 3600 }),
      writeClipboard: async (text: string) => {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
          }
        } catch {}
        return true;
      },
      setEcoState: (state: string) => { console.log('ARC Mock Eco State:', state); },
      isWindowFocused: async () => true,
      onFocusChanged: (_callback: (focused: boolean) => void) => { return () => {}; },
      getModulesStatus: async () => ({ database: 'online', voice: 'online', ai: 'online', memory: 'online' }),
      speak: async (text: string, style?: string) => {
        console.log(`ARC Mock Speak [${style || 'default'}]:`, text);
        const ttsMetaCbs = (window as any)._mockTtsMetaCallbacks || [];
        ttsMetaCbs.forEach((cb: any) => cb({ engine: 'silero', isCached: false }));
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.warn('SpeechSynthesis browser mock failed:', e);
          }
        }
      },
      onTtsMeta: (cb: (data: { engine: 'silero' | 'edge' | 'sapi'; isCached: boolean }) => void) => {
        if (!(window as any)._mockTtsMetaCallbacks) (window as any)._mockTtsMetaCallbacks = [];
        (window as any)._mockTtsMetaCallbacks.push(cb);
        return () => {
          (window as any)._mockTtsMetaCallbacks = ((window as any)._mockTtsMetaCallbacks || []).filter((fn: any) => fn !== cb);
        };
      },
      onPlayAudio: () => { return () => {}; },
      audioDone: () => {},
      onMediaPlay: () => { return () => {}; },
      onMediaPause: () => { return () => {}; },
      onMediaVolume: () => { return () => {}; },
      onMediaQuieter: () => { return () => {}; },
      onMediaLouder: () => { return () => {}; },
      // Sherpa STT Mocks
      streamAudioChunk: () => {},
      streamAudioEnd: () => {},
      resetSttBuffer: () => {},
      onSttPartial: () => { return () => {}; },
      onSttFinal: () => { return () => {}; },
      getSttStatus: async () => ({ status: 'ready', modelLoaded: true, ready: true, lastError: null }),
      startListening: async () => ({ success: true }),
      stopListening: async () => ({ success: true }),
      setVoiceBusy: (_busy: boolean) => {},
      reloadStt: async () => ({ success: true, ready: true }),
      switchSttModel: async () => ({ success: true, ready: true }),
      cancelSttDownload: async () => ({ success: true }),
      startCalibration: async () => ({ success: true }),
      finishCalibration: async () => ({ success: true }),
      resetCalibration: async () => ({ success: true }),
      onSttModelDownloadProgress: () => { return () => {}; },
      onSttFallback: () => { return () => {}; },
      onSttReady: () => { return () => {}; },
  
      onWake: (callback: () => void) => {
        console.log('ARC: Wake word listener initialized (Browser Mock)');
        // Removed automatic trigger to prevent unsolicited voice activation on startup
        // setTimeout(() => callback(), 5000);
      },
      onAiChunk: (callback: (data: any) => void) => {
        (window as any)._aiChunkCallback = callback;
        return () => { (window as any)._aiChunkCallback = null; };
      },
      onAiRouteInfo: (callback: (data: any) => void) => {
        (window as any)._aiRouteCallback = callback;
        return () => { (window as any)._aiRouteCallback = null; };
      },
      onAiTextCorrected: (callback: (data: any) => void) => {
        return () => {};
      },
      aiRequest: async (text: string, _context: any, reqId: string, settings?: any) => {
        const { routeInfo, chunks } = synthesizeMockWorkflowChunks(text, settings);
        const routeCb = (window as any)._aiRouteCallback;
        if (routeCb) routeCb({ reqId, ...routeInfo, step: 'ROUTER', latency: 18 });
        const callback = (window as any)._aiChunkCallback;
        if (callback) {
          chunks.forEach((chunk, idx) => {
            const isLast = idx === chunks.length - 1;
            setTimeout(() => {
              callback({
                reqId,
                chunk,
                done: isLast,
                meta: isLast ? { provider: routeInfo.modelName, source: routeInfo.target, latency: (idx + 1) * 220, isCache: false } : undefined
              });
            }, (idx + 1) * 220);
          });
        }
        return { success: true };
      },
      checkOllamaOnline: async () => {
        try {
          const res = await fetch('http://localhost:11434/api/tags');
          return { online: res.ok };
        } catch (e) {
          return { online: false };
        }
      },
      memoryGetAll: async () => {
        if (!(window as any)._mockMemory) {
          (window as any)._mockMemory = [
            { id: 'mem-1', category: 'fact', key: 'Project Name', value: 'A.R.C. System', confidence: 1.0, embedding: [0.12, 0.45, 0.78], source: 'user_stated', created_at: Date.now() - 100000, updated_at: Date.now() - 100000, last_accessed_at: Date.now(), access_count: 142 },
            { id: 'mem-2', category: 'preference', key: 'UI Theme', value: 'Dark Mode (Indigo accents)', confidence: 0.95, embedding: [0.33, 0.22, 0.81], source: 'inferred', created_at: Date.now() - 500000, updated_at: Date.now() - 200000, last_accessed_at: Date.now() - 10000, access_count: 56 },
            { id: 'mem-3', category: 'knowledge', key: 'TypeScript Config', value: 'Strict mode is enabled. Node resolution.', confidence: 0.88, embedding: [0.55, 0.12, 0.44], source: 'extracted', created_at: Date.now() - 800000, updated_at: Date.now() - 800000, last_accessed_at: Date.now() - 50000, access_count: 12 },
            { id: 'mem-4', category: 'event', key: 'System Reboot', value: 'System restarted after kernel update v5.0', confidence: 1.0, embedding: null, source: 'system', created_at: Date.now() - 1200000, updated_at: Date.now() - 1200000, last_accessed_at: Date.now() - 80000, access_count: 1 },
            { id: 'mem-5', category: 'fact', key: 'User Alias', value: 'Commander', confidence: 0.75, embedding: [0.91, 0.05, 0.31], source: 'inferred', created_at: Date.now() - 2000000, updated_at: Date.now() - 2000000, last_accessed_at: Date.now() - 5000, access_count: 320 }
          ];
        }
        return JSON.parse(JSON.stringify((window as any)._mockMemory));
      },
      memorySearch: async (query: string, category?: string) => {
        const mems = (window as any)._mockMemory || [];
        const q = (query || '').toLowerCase().trim();
        let list = mems;
        if (category && category !== 'all') {
          list = list.filter((m: any) => m.category === category);
        }
        if (!q) return JSON.parse(JSON.stringify(list));

        return list.map((m: any) => {
          const valStr = typeof m.value === 'string' ? m.value.toLowerCase() : JSON.stringify(m.value).toLowerCase();
          const keyStr = m.key.toLowerCase();
          let score = 0;
          if (valStr.includes(q) || keyStr.includes(q)) score += 85;
          const words = q.split(/\s+/).filter((w: string) => w.length > 2);
          for (const w of words) {
            if (valStr.includes(w) || keyStr.includes(w)) score += 20;
          }
          // Semantic bonus for preference query
          if ((q.includes('люб') || q.includes('предпочит') || q.includes('хоч')) && m.category === 'preference') {
            score += 45;
          }
          if ((q.includes('факт') || q.includes('зна') || q.includes('проект')) && (m.category === 'fact' || m.category === 'knowledge')) {
            score += 35;
          }
          const similarity = Math.min(99, Math.max(72, Math.round(score * m.confidence)));
          return {
            ...m,
            similarity
          };
        }).sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0));
      },
      memoryGetByKey: async (key: string) => {
        const mems = (window as any)._mockMemory || [];
        return mems.find((m: any) => m.key === key) || null;
      },
      memoryGetStats: async () => {
        const mems = (window as any)._mockMemory || [];
        const categories: Record<string, number> = {};
        let vectorCount = 0;
        mems.forEach((m: any) => {
          categories[m.category] = (categories[m.category] || 0) + 1;
          if (m.embedding && Array.isArray(m.embedding) && m.embedding.length > 0) {
            vectorCount++;
          }
        });
        return { totalEntries: mems.length, vectorCount, categories, recentBehaviorCount: 0 };
      },
      memoryDelete: async (id: string) => {
        if ((window as any)._mockMemory) {
          (window as any)._mockMemory = (window as any)._mockMemory.filter((m: any) => m.id !== id);
        }
        return { success: true };
      },
      memoryCreate: async (entryData: any) => {
        if (!(window as any)._mockMemory) (window as any)._mockMemory = [];
        const newEntry = {
          id: entryData.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: entryData.category || 'fact',
          key: entryData.key || 'New Memory Node',
          value: entryData.value || '',
          confidence: typeof entryData.confidence === 'number' ? entryData.confidence : 1.0,
          embedding: [0.1, 0.2, 0.3],
          source: entryData.source || 'user_stated',
          created_at: Date.now(),
          updated_at: Date.now(),
          last_accessed_at: Date.now(),
          access_count: 1
        };
        (window as any)._mockMemory.unshift(newEntry);
        return { success: true, entry: newEntry };
      },
      memoryUpdate: async (id: string, updates: any) => {
        if ((window as any)._mockMemory) {
          const item = (window as any)._mockMemory.find((m: any) => m.id === id);
          if (item) {
            Object.assign(item, updates, { updated_at: Date.now() });
            return { success: true };
          }
        }
        return { success: false, error: 'Memory entry not found' };
      },
      memoryClearAll: async () => {
        (window as any)._mockMemory = [];
        return { success: true };
      },
      memoryImport: async (items: any[]) => {
        if (!Array.isArray(items)) return { success: false, importedCount: 0, error: 'Invalid array' };
        if (!(window as any)._mockMemory) (window as any)._mockMemory = [];
        for (const entryData of items) {
          if (!entryData || typeof entryData.key !== 'string' || !entryData.key.trim()) {
            return { success: false, importedCount: 0, error: 'Invalid entry key' };
          }
        }
        for (const entryData of items) {
          (window as any)._mockMemory.unshift({
            id: entryData.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            category: entryData.category || 'fact',
            key: entryData.key,
            value: entryData.value ?? '',
            confidence: typeof entryData.confidence === 'number' ? entryData.confidence : 1.0,
            embedding: entryData.embedding || null,
            source: entryData.source || 'user_stated',
            created_at: entryData.created_at || Date.now(),
            updated_at: entryData.updated_at || Date.now(),
            last_accessed_at: Date.now(),
            access_count: entryData.access_count || 1
          });
        }
        return { success: true, importedCount: items.length };
      },
      toolsList: async () => [
        { name: 'web_search', description: 'Mock Web Search' },
        { name: 'wikipedia', description: 'Mock Wiki' }
      ],
      skillsList: async () => {
        // Return fresh copies of skills to avoid direct mutation issues if any
        return JSON.parse(JSON.stringify((window as any)._mockSkills || []));
      },
      skillsToggle: async (id: string) => {
        const skills = (window as any)._mockSkills as any[];
        const skill = skills.find((s: any) => s.id === id);
        if (skill) {
          skill.enabled = !skill.enabled;
          return true;
        }
        return false;
      },
      skillsUpdateTriggers: async (id: string, triggers: string[]) => {
        const skills = (window as any)._mockSkills as any[];
        const skill = skills.find((s: any) => s.id === id);
        if (skill) {
          skill.triggers = triggers;
          return true;
        }
        return false;
      },
      skillsAddTrigger: async (id: string, phrase: string) => {
        const skills = (window as any)._mockSkills as any[];
        const skill = skills.find((s: any) => s.id === id);
        if (skill && !skill.triggers.includes(phrase)) {
          skill.triggers.push(phrase);
          return true;
        }
        return false;
      },
      skillsRemoveTrigger: async (id: string, phrase: string) => {
        const skills = (window as any)._mockSkills as any[];
        const skill = skills.find((s: any) => s.id === id);
        if (skill) {
          skill.triggers = skill.triggers.filter((t: string) => t !== phrase);
          return true;
        }
        return false;
      },
      skillsReset: async () => true,
      skillsClone: async () => true,
      skillsCreate: async () => {
        const skills = (window as any)._mockSkills as any[];
        const newId = `new-${Date.now()}`;
        const newSkill = { id: newId, title: 'Новый макрос', desc: 'Описание вашего макроса', icon: 'Play', enabled: true, triggers: [] };
        skills.unshift(newSkill);
        return newId;
      },
      launcherGetFolders: async () => ['C:\\Mock\\Folder', 'D:\\Mock\\Games'],
      launcherAddFolder: async () => 'C:\\New\\Mock\\Folder',
      launcherRemoveFolder: async () => true,
      launcherRefreshIndex: async () => ({ success: true, indexed: 0, folders: 0, elapsedMs: 0, note: 'no_folders' as const }),
      launcherSearch: async () => ({ results: [] }),
      launcherLaunch: async () => ({ success: false, error: 'Not available in browser mock mode' }),
      macrosList: async () => JSON.parse(JSON.stringify((window as any)._mockMacros || [])),
      macrosSave: async (id: string, data: any) => {
        const macros = (window as any)._mockMacros || [];
        const idx = macros.findIndex((m: any) => m.id === id);
        const existing = idx >= 0 ? macros[idx] : null;
        const macroMetaData = {
          id,
          title: data.name || id,
          desc: 'Visual Macro',
          enabled: data.enabled !== undefined ? data.enabled : (existing ? existing.enabled : true),
          triggers: data.triggers || [],
          nodes: data.nodes || [],
          links: data.links || []
        };
        if (idx >= 0) macros[idx] = macroMetaData;
        else macros.push(macroMetaData);
        (window as any)._mockMacros = macros;
        return true;
      },
      macrosLoad: async (id: string) => {
         const macros = (window as any)._mockMacros || [];
         const existing = macros.find((m: any) => m.id === id);
         if (existing) {
           return {
             name: existing.title,
             triggers: JSON.parse(JSON.stringify(existing.triggers || [])),
             enabled: existing.enabled !== false,
             nodes: JSON.parse(JSON.stringify(existing.nodes || [])),
             links: JSON.parse(JSON.stringify(existing.links || []))
           };
         }
         return { name: 'New Macro', triggers: [], nodes: [], links: [] };
      },
      macrosDelete: async (id: string) => {
        (window as any)._mockMacros = ((window as any)._mockMacros || []).filter((m: any) => m.id !== id);
        return true;
      },
      macrosExecute: async (id: string) => {
        console.log('Mock exec macro:', id);
        return true;
      },
      saveAiProvider: async (provider: any) => {
        try {
          const list = JSON.parse(localStorage.getItem('arc_mock_ai_providers') || '[]');
          const idx = list.findIndex((p: any) => p.id === provider.id);
          if (idx > -1) list[idx] = provider; else list.push(provider);
          localStorage.setItem('arc_mock_ai_providers', JSON.stringify(list));
        } catch {}
      },
      getAiProviders: async () => {
        try {
          const list = JSON.parse(localStorage.getItem('arc_mock_ai_providers') || '[]');
          return list.length ? list : [
            { id: 'openrouter', name: 'OpenRouter', type: 'cloud', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'google/gemini-2.5-flash', priority: 1, apiKey: '', maxTokens: 2048, temperature: 0.7, enabled: true },
            { id: 'freeapillm', name: 'FreeAPILLM', type: 'local', endpoint: 'http://127.0.0.1:3067/v1/chat/completions', model: 'auto', priority: 2, apiKey: '', maxTokens: 2048, temperature: 0.7, enabled: false, noAuthHeader: true }
          ];
        } catch { return []; }
      },
      deleteAiProvider: async (id: string) => {
        try {
          const list = JSON.parse(localStorage.getItem('arc_mock_ai_providers') || '[]');
          localStorage.setItem('arc_mock_ai_providers', JSON.stringify(list.filter((p: any) => p.id !== id)));
        } catch {}
      },
      getQuarantinedAiProviders: async () => [],
      resetAiProviderHealth: async (_id: string) => ({ success: true }),
      testAiConnection: async (provider: any) => {
        try {
          const isOllama = provider.type === 'local' && (provider.endpoint.includes('11434') || provider.name.toLowerCase().includes('ollama'));
          if (isOllama) {
            const url = provider.endpoint.replace('localhost:11434', '127.0.0.1:11434');
            const res = await fetch(`${new URL(url).origin}/api/tags`);
            return { success: res.ok };
          }
          const cleanKey = (provider.apiKey || '').trim().replace(/^["']|["']$/g, '');
          if (provider.type === 'cloud' && !cleanKey) return { success: false, error: 'API ключ не указан.' };
          const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'HTTP-Referer': 'https://github.com/arc-assistant', 'X-Title': 'A.R.C.' };
          if (cleanKey) { headers['Authorization'] = `Bearer ${cleanKey}`; headers['x-api-key'] = cleanKey; }
          const ep = (provider.endpoint || '').trim().replace(/\/+$/, '');
          const chatUrl = ep.endsWith('/chat/completions') ? ep : `${ep}${ep.includes('/v1') ? '' : '/v1'}/chat/completions`;
          const res = await fetch(chatUrl, { method: 'POST', headers, body: JSON.stringify({ model: provider.model || 'default', messages: [{ role: 'user', content: 'hi' }], max_tokens: 16, temperature: 0.1 }) });
          if (!res.ok) {
            const errMap: Record<number, string> = { 401: 'Неверный API ключ (401 Unauthorized)', 403: 'Доступ запрещён (403 Forbidden)', 429: 'Превышен лимит запросов / исчерпан баланс (429 Rate Limit)' };
            return { success: false, error: errMap[res.status] || `HTTP ${res.status}` };
          }
          const data = await res.json().catch(() => null);
          if (data?.error) return { success: false, error: data.error.message || JSON.stringify(data.error) };
          if (!data?.choices?.[0]?.message?.content && !data?.choices?.[0]?.text) return { success: false, error: 'Эндпоинт вернул пустой ответ (нет choices)' };
          return { success: true };
        } catch (err: any) { return { success: false, error: err.message || String(err) }; }
      },
      getAvailableModels: async (provider: any) => {
        try {
          const ep = (provider.endpoint || '').trim().replace(/\/+$/, '');
          const baseUrl = ep.endsWith('/chat/completions') ? ep.replace(/\/chat\/completions$/, '/models') : `${ep}${ep.includes('/v1') ? '' : '/v1'}/models`;
          const cleanKey = (provider.apiKey || '').trim();
          const headers: Record<string, string> = { 'Accept': 'application/json', 'HTTP-Referer': 'https://github.com/arc-assistant', 'X-Title': 'A.R.C.' };
          if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
          const res = await fetch(baseUrl, { headers });
          if (res.ok) {
            const data = await res.json();
            const list = data.data || data.models || data.result || data;
            if (Array.isArray(list)) return list.map((m: any) => m.id || m.name || m).filter(Boolean);
          }
        } catch {}
        return [];
      },
      scanFreeLlm: async (_host?: string) => ({ found: false }),
      toggleFocus: () => console.log('ARC: Toggle Focus Mode (Simulated)'),
      checkBuiltinModel: async (modelName?: string) => { const list: string[] = JSON.parse(localStorage.getItem('arc_mock_downloaded_gguf_models') || '["qwen2.5-1.5b-instruct-q4_k_m.gguf"]'); return list.includes(modelName || 'qwen2.5-1.5b-instruct-q4_k_m.gguf') || !!localStorage.getItem('arc_mock_builtin_model_downloaded'); },
      downloadBuiltinModel: async (modelName?: string) => { const list = new Set<string>(JSON.parse(localStorage.getItem('arc_mock_downloaded_gguf_models') || '["qwen2.5-1.5b-instruct-q4_k_m.gguf"]')); list.add(modelName || 'qwen2.5-1.5b-instruct-q4_k_m.gguf'); localStorage.setItem('arc_mock_downloaded_gguf_models', JSON.stringify(Array.from(list))); localStorage.setItem('arc_mock_builtin_model_downloaded', 'true'); return { success: true }; },
      cancelBuiltinModelDownload: async () => ({ success: true }),
      listFiles: async () => ['arc_kernel_v5.ts', 'system_config.json', 'neural_weights_opt.bin', 'reactor_core.vue', 'security_audit_log.txt', 'holographic_projection.css', 'cognitive_models.zip', 'boot_sequence.md', 'voice_dsp.wav', 'satellite_feed.mp4'],
      objectiveGetAll: async () => [],
      objectiveGetEntropyState: async () => ({ entropy: 0, state: 'STABLE', autoApprove: false }),
      objectiveCreate: async () => ({ id: 'new-obj' }),
      objectiveGetGraph: async () => ({ nodes: [], links: [] }),
      objectiveDecompose: async () => ({}),
      objectiveAddOutcome: async () => ({}),
      objectiveUpdateOutcomeValue: async () => true,
      objectiveAddDependency: async () => true,
      objectiveEvaluateHealth: async () => ({ confidence: 1.0, is_off_trajectory: false }),
      objectiveGenerateRouteMap: async () => ({}),
      objectiveApproveRoute: async () => ({}),
      objectiveModifyRoute: async () => ({}),
      objectiveDeclineRoute: async () => ({}),
      objectiveRollback: async () => ({ success: true, rolledBackActions: 0, skippedActions: 0, errors: [] }),
      objectiveSaveLayout: async () => ({}),
      objectiveSetAutoApprove: async () => true,
      decisionGetAll: async () => [],
      decisionCreate: async () => ({ id: 'new-dec' }),
      savePerfConfig: async (config: any) => {
        localStorage.setItem('arc_mock_perf_config', JSON.stringify(config));
        return { success: true };
      },
      loadPerfConfig: async () => {
        const stored = localStorage.getItem('arc_mock_perf_config');
        return stored ? JSON.parse(stored) : { targetFps: 'unlimited', disableVsync: false };
      },
      // Transcription APIs Mock
      transcriptionCheckModel: async (modelName: string) => {
        if (!(window as any)._mockDownloadedModels) (window as any)._mockDownloadedModels = new Set();
        return (window as any)._mockDownloadedModels.has(modelName);
      },
      transcriptionDownloadModel: async (modelName: string, device?: string) => {
        console.log('Mock download model started for:', modelName, 'on device:', device);
        if (!(window as any)._mockDownloadedModels) (window as any)._mockDownloadedModels = new Set();
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const callbacks = (window as any)._mockDownloadProgressCallbacks || [];
          callbacks.forEach((cb: any) => cb({ modelName, bytes_done: i * 10, total_bytes: 100, filename: `model.safetensors` }));
        }
        (window as any)._mockDownloadedModels.add(modelName);
        return { success: true };
      },
      ...getMockTranscriptionHandlers(),
      
      dialogCreateSession: async (name?: string) => {
        const sessions = getMockSessions();
        const s = {
          id: Date.now(),
          name: name || 'Новый диалог',
          message_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_pinned: 0,
          is_archived: 0,
          summary: null,
          tags: null
        };
        sessions.unshift(s);
        saveMockSessions(sessions);
        return s;
      },
      dialogGetSession: async (id: number) => {
        const sessions = getMockSessions();
        return sessions.find((s: any) => s.id === id) || {
          id,
          name: 'Новый диалог',
          message_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_pinned: 0,
          is_archived: 0,
          summary: null,
          tags: null
        };
      },
      dialogGetMessages: async (id: number) => {
        const allMsgs = getMockMessages();
        return allMsgs[id] ? [...allMsgs[id]] : [];
      },
      dialogListSessions: async (limit?: number, offset?: number, filter?: any) => {
        purgeExpiredMockSessions(getMockSessions(), getMockMessages(), saveMockSessions, saveMockMessages);
        let list = [...getMockSessions()];
        const isTrash = Boolean(filter?.trash || filter?.date === 'trash');
        const isArchived = !isTrash && Boolean(filter?.archived || filter?.date === 'archived');
        if (isTrash) {
          list = list.filter((s: any) => Number(s.is_deleted || 0) === 1);
        } else if (isArchived) {
          list = list.filter((s: any) => Number(s.is_deleted || 0) === 0 && Number(s.is_archived || 0) === 1);
        } else {
          list = list.filter((s: any) => Number(s.is_deleted || 0) === 0 && Number(s.is_archived || 0) === 0);
        }
        return list;
      },
      dialogAddMessage: async (sessionId: number, role: string, content: string, metadata?: any) => {
        const allMsgs = getMockMessages();
        if (!allMsgs[sessionId]) allMsgs[sessionId] = [];
        const msg = {
          id: Date.now(),
          session_id: sessionId,
          role,
          content,
          metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
          created_at: new Date().toISOString()
        };
        allMsgs[sessionId].push(msg);
        saveMockMessages(allMsgs);
        
        const sessions = getMockSessions();
        const s = sessions.find((item: any) => item.id === sessionId);
        if (s) {
          s.message_count = (s.message_count || 0) + 1;
          s.updated_at = new Date().toISOString();
          if (role === 'user' && (!s.name || s.name === 'Новая сессия' || s.name === 'Новый диалог')) {
            s.name = content.trim().slice(0, 50);
          }
          saveMockSessions(sessions);
        }
        return msg;
      },
      dialogUpdateSession: async (id: number, data: any) => {
        const sessions = getMockSessions();
        const s = sessions.find((item: any) => item.id === id);
        if (s) {
          Object.assign(s, data, { updated_at: new Date().toISOString() });
          saveMockSessions(sessions);
        }
        return { success: true };
      },
      dialogDeleteSession: async (id: number) => {
        let sessions = getMockSessions();
        sessions = sessions.filter((s: any) => s.id !== id);
        saveMockSessions(sessions);
  
        const allMsgs = getMockMessages();
        if (allMsgs[id]) {
          delete allMsgs[id];
          saveMockMessages(allMsgs);
        }
        return { success: true };
      },
      dialogDeleteMessage: async (id: number) => {
        const allMsgs = getMockMessages();
        let changed = false;
        for (const k of Object.keys(allMsgs)) {
          const origLen = (allMsgs[Number(k)] || []).length;
          allMsgs[Number(k)] = (allMsgs[Number(k)] || []).filter((m: any) => m.id !== id);
          if (allMsgs[Number(k)].length !== origLen) {
            changed = true;
          }
        }
        if (changed) {
          saveMockMessages(allMsgs);
        }
        return { success: true };
      },
      ...createMockDialogTrashHandlers({
        getSessions: getMockSessions,
        saveSessions: saveMockSessions,
        getMessages: getMockMessages,
        saveMessages: saveMockMessages
      }),
      dialogExportSession: async (sessionId: number) => ({ success: true, filePath: '/mock/path/to/session.md' }),
      dialogGenerateSummary: async (sessionId: number) => {
        const sessions = getMockSessions();
        const s = sessions.find((item: any) => item.id === sessionId);
        const allMsgs = getMockMessages();
        const msgs = allMsgs[sessionId] || [];
        const firstUser = msgs.find((m: any) => m.role === 'user');
        const sum = firstUser ? firstUser.content.slice(0, 95) : 'Диалог с реактором A.R.C.';
        if (s) {
          s.summary = sum;
          saveMockSessions(sessions);
        }
        return { success: true, summary: sum };
      },
      logDialog: async () => ({ success: true }),
      
      filesList: async (dirPath?: string) => {
        return {
          success: true,
          currentPath: dirPath || '.',
          files: [
            { name: 'mock-folder', isDirectory: true, path: (dirPath || '.') + '/mock-folder' },
            { name: 'mock-file.txt', isDirectory: false, path: (dirPath || '.') + '/mock-file.txt' },
            { name: 'config.json', isDirectory: false, path: (dirPath || '.') + '/config.json' }
          ]
        };
      },
      filesRead: async (filePath: string) => {
        return {
          success: true,
          content: 'Это содержимое мок-файла для пути:\n' + filePath
        };
      },
  
      onTranscriptionChunk: (callback: any) => {
        if (!(window as any)._mockChunkCallbacks) {
          (window as any)._mockChunkCallbacks = [];
        }
        (window as any)._mockChunkCallbacks.push(callback);
        return () => {
          (window as any)._mockChunkCallbacks = 
            ((window as any)._mockChunkCallbacks || []).filter((cb: any) => cb !== callback);
        };
      },

      tasksList: async () => {
        try { return JSON.parse(localStorage.getItem('arc_operational_tasks') || '[]'); } catch { return []; }
      },
      tasksSaveAll: async (tasks: any[]) => {
        try { localStorage.setItem('arc_operational_tasks', JSON.stringify(tasks)); return true; } catch { return false; }
      },
      tasksCreate: async (data: any) => {
        try {
          const tasks = JSON.parse(localStorage.getItem('arc_operational_tasks') || '[]');
          const newTask = {
            id: data.id || 'task-' + Math.random().toString(36).substring(2, 9),
            text: data.text || '', description: data.description || '', completed: false, createdAt: Date.now(),
            priority: data.priority || 'medium', category: data.category || 'ops', dueDate: data.dueDate,
            status: 'todo', importance: 'regular', estimatedMinutes: 30, spentMinutes: 0, objectiveId: data.objectiveId
          };
          tasks.unshift(newTask);
          localStorage.setItem('arc_operational_tasks', JSON.stringify(tasks));
          return newTask;
        } catch { return null; }
      },
      tasksComplete: async (id: string) => {
        try {
          const tasks = JSON.parse(localStorage.getItem('arc_operational_tasks') || '[]');
          const t = tasks.find((item: any) => item.id === id);
          if (t) { t.completed = true; t.status = 'done'; t.completedAt = Date.now(); localStorage.setItem('arc_operational_tasks', JSON.stringify(tasks)); return true; }
          return false;
        } catch { return false; }
      },
      tasksDelete: async (id: string) => {
        try {
          const tasks = JSON.parse(localStorage.getItem('arc_operational_tasks') || '[]').filter((item: any) => item.id !== id);
          localStorage.setItem('arc_operational_tasks', JSON.stringify(tasks));
          return true;
        } catch { return false; }
      },
      settingsGetKey: async (keyName: string) => {
        try { return { success: true, value: sessionStorage.getItem(`arc_secure_key_${keyName}`) || localStorage.getItem(`arc_secure_key_${keyName}`) || '', isEncrypted: false }; }
        catch { return { success: true, value: '', isEncrypted: false }; }
      },
      settingsSetKey: async (keyName: string, value: string) => {
        try {
          if (!value) { sessionStorage.removeItem(`arc_secure_key_${keyName}`); localStorage.removeItem(`arc_secure_key_${keyName}`); }
          else sessionStorage.setItem(`arc_secure_key_${keyName}`, value);
          return { success: true, isEncrypted: false };
        } catch { return { success: false, error: 'Mock storage failed' }; }
      },
      settingsIsSafeStorageAvailable: async () => ({ available: false }),
      setSttEngine: async (engine: 'gigaam' | 'legacy') => ({ success: true, engine }),
      onSttEngineReady: (_cb: any) => () => {},
      showToast: async () => ({ success: true }),
      onShowToast: (_cb: any) => () => {},
      onLlmFallbackRequired: (_cb: any) => () => {},
      approveLlmFallback: async () => ({ success: true }),
      rejectLlmFallback: async () => ({ success: true }),
      getActiveModelDownload: async () => null,
      cancelBuiltinDownload: async () => ({ success: true }),
      resetHfCooldown: async () => ({ success: true }),
      onApprovalRequest: (_cb: any) => () => {},
      respondApproval: async () => ({ success: true }),
      getLlmCacheStats: async () => (window as any)._mockLlmCacheStats || { count: 0, sizeBytes: 0, oldestCreatedAt: null },
      clearLlmCache: async () => {
        const prev = (window as any)._mockLlmCacheStats?.count || 0;
        (window as any)._mockLlmCacheStats = { count: 0, sizeBytes: 0, oldestCreatedAt: null };
        return { deleted: prev };
      },
      getStorageInfo: async () => ({ dataDir: 'data', isPortable: true, folders: { database: { path: 'data/database', sizeBytes: 1048576, exists: true }, config: { path: 'data/config', sizeBytes: 4096, exists: true }, models: { path: 'data/models', sizeBytes: 1572864000, exists: true }, macros: { path: 'data/macros', sizeBytes: 1024, exists: true }, cache: { path: 'data/cache', sizeBytes: 204800, exists: true } }, appDataLegacyPath: '%APPDATA%/a.r.c' }),
      openDataFolder: async () => ({ success: true }),
      resetSystem: async () => { localStorage.clear(); sessionStorage.clear(); return { success: true }; },
      ...getMockObjectiveHandlers()
    };
  
    (window as any)._mockDownloadedModels = new Set();
    (window as any)._mockDownloadProgressCallbacks = [];
  }
}
