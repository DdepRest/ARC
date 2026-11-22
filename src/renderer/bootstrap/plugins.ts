import { PiniaPluginContext } from 'pinia';

export function toPlainObject(val: any, seen = new WeakSet()): any {
  if (val === null || typeof val !== 'object') {
    if (typeof val === 'function' || typeof val === 'symbol') {
      return undefined;
    }
    return val;
  }

  // Handle circular references
  if (seen.has(val)) {
    return undefined;
  }
  seen.add(val);

  // Skip Vue internal reactivity structures and Pinia internals
  if (
    'dep' in val ||
    'deps' in val ||
    'effect' in val ||
    val.__v_skip ||
    val._isVue ||
    val._p ||
    (val.$id && val.$state)
  ) {
    return undefined;
  }

  // Skip DOM nodes or Window objects if any
  if (typeof window !== 'undefined' && (val === window || (typeof Node !== 'undefined' && val instanceof Node))) {
    return undefined;
  }

  // Handle Vue refs / computed properties
  if (val.__v_isRef || val.__v_isReadonly) {
    try {
      return toPlainObject(val.value, seen);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(val)) {
    return val
      .map(item => toPlainObject(item, seen))
      .filter(item => item !== undefined);
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(val)) {
    if (key.startsWith('$') || key.startsWith('_')) {
      continue;
    }
    try {
      const propDesc = Object.getOwnPropertyDescriptor(val, key);
      // Skip getters that might throw or return complex reactive systems if not plain values
      if (propDesc && propDesc.get && !propDesc.set) {
        // Readonly accessor, check value safely
        const propVal = val[key];
        if (propVal && typeof propVal === 'object' && ('dep' in propVal || 'effect' in propVal || propVal.__v_isRef)) {
          continue;
        }
      }
      const plainVal = toPlainObject(val[key], seen);
      if (plainVal !== undefined) {
        result[key] = plainVal;
      }
    } catch (e) {
      // Ignore non-serializable property access
    
        console.warn('[A.R.C] Handled silent error:', e);
    }
  }

  return result;
}


export function safeStringify(obj: any): string {
  try {
    const plain = toPlainObject(obj);
    return JSON.stringify(plain);
  } catch (e) {
    console.error('Failed to stringify state safely:', e);
    return '';
  }
}


export function persistencePlugin({ store }: PiniaPluginContext) {
  // Ephemeral/runtime stores that should not be persisted to localStorage (they cause UI freeze on every frame/timer tick)
  // Chat store messages and active session are persisted directly via SQLite IPC and lightweight dedicated cache keys
  const EPHEMERAL_STORES = ['performance', 'ui', 'system', 'eco', 'chat'];
  if (EPHEMERAL_STORES.includes(store.$id)) {
    try {
      localStorage.removeItem(`arc_state_${store.$id}`);
    } catch {
      // ignore
    }
    return;
  }

  const storedState = localStorage.getItem(`arc_state_${store.$id}`);
  if (storedState) {
    try {
      const parsed = JSON.parse(storedState);
      if (parsed && typeof parsed === 'object') {
        if (store.$id === 'settings') {
          if (!localStorage.getItem('arc_settings_v6_keywords_default_enabled')) {
            parsed.sttKeywordsEnabled = true;
            localStorage.setItem('arc_settings_v6_keywords_default_enabled', 'true');
          }
          if (!localStorage.getItem('arc_settings_v5_dsp_migrated')) {
            parsed.voiceDspEnabled = false;
            localStorage.setItem('arc_settings_v5_dsp_migrated', 'true');
          }
          // S2-05: Ensure cloud TTS fallback never silently enables on migration from older settings
          if (parsed.allowCloudTtsFallback !== true) {
            parsed.allowCloudTtsFallback = false;
          }
          // P1.3-R Phase C.3: Remove persisted theme color from storage; canonical theme is always red
          delete parsed.reactorColorTheme;
          if (!localStorage.getItem('arc_theme_v3_no_persist')) {
            delete parsed.reactorColorTheme;
            localStorage.setItem('arc_theme_v3_no_persist', 'true');
          }
          // Enforce Minimal Monolith compact mode for all widgets
          parsed.widgetModes = {
            'tech-hud': 'compact',
            'timeline': 'compact',
            'smart-router': 'compact',
            'profiler': 'compact',
            'music': 'compact',
            'fps': 'compact'
          };
          parsed.widgetCompact = {
            'tech-hud': true,
            'timeline': true,
            'smart-router': true,
            'profiler': true,
            'music': true,
            'fps': true
          };
          parsed.widgetPreset = 'standard';
          // In browser (no window.api), use 'native' instead of 'sherpa'
          if (!(window as any).api) {
             if (parsed.sttProvider === 'sherpa') {
               parsed.sttProvider = 'native';
             }
          } else {
             // In Electron (window.api exists), migrate legacy/accidental 'native' setting to 'sherpa'
             if (parsed.sttProvider === 'native' || !parsed.sttProvider) {
               parsed.sttProvider = 'sherpa';
             }
          }
          if (parsed.builtinLLMModel === 'onnx-community/Qwen2.5-1.5B-Instruct') {
             parsed.builtinLLMModel = 'qwen1.5-0.5b-chat-q4_k_m.gguf';
          } else if (parsed.builtinLLMModel === 'Xenova/Qwen1.5-0.5B-Chat' || parsed.builtinLLMModel === 'Qwen1.5-0.5B-Chat') {
             parsed.builtinLLMModel = 'qwen1.5-0.5b-chat-q4_k_m.gguf';
          } else if (parsed.builtinLLMModel === 'Xenova/Qwen1.5-1.8B-Chat' || parsed.builtinLLMModel === 'Qwen1.5-1.8B-Chat') {
             parsed.builtinLLMModel = 'qwen1.5-1.8b-chat-q4_k_m.gguf';
          } else if (parsed.builtinLLMModel && !parsed.builtinLLMModel.endsWith('.gguf')) {
             parsed.builtinLLMModel = 'qwen1.5-0.5b-chat-q4_k_m.gguf';
          }

          if (parsed.sttProvider === 'sherpa' || (typeof window !== 'undefined' && (window as any).api)) {
            if (!localStorage.getItem('arc_stt_whisper_small_default_v1')) {
              parsed.sttModel = 'whisper-small';
              localStorage.setItem('arc_stt_whisper_small_default_v1', 'true');
            } else if (parsed.sttModel === 'tiny' || parsed.sttModel === 'Xenova/whisper-tiny' || parsed.sttModel === 'large-v3-turbo-ru') {
              parsed.sttModel = 'whisper-small';
            }
            if (!parsed.sttProvider) {
              parsed.sttProvider = 'sherpa';
            }
          }
        }
        if (store.$id === 'skills' && !localStorage.getItem('arc_skills_default_enabled_v1')) {
          if (parsed.skills && Array.isArray(parsed.skills)) {
            parsed.skills.forEach((s: any) => {
              s.enabled = true;
            });
          }
          localStorage.setItem('arc_skills_default_enabled_v1', 'true');
        }

        // Only patch valid top-level state keys that are in the store
        const sanitizedPatch: Record<string, any> = {};
        for (const key of Object.keys(parsed)) {
          if (key.startsWith('$') || key.startsWith('_')) continue;
          if (key in store.$state) {
            sanitizedPatch[key] = parsed[key];
          }
        }
        if (store.$id === 'terminal') {
          delete sanitizedPatch.logs;
        }
        if (store.$id === 'settings') {
          delete sanitizedPatch.reactorColorTheme;
        }

        const slowDelay = Number((globalThis as any).ARC_SLOW_SETTINGS || (typeof localStorage !== 'undefined' ? localStorage.getItem('ARC_SLOW_SETTINGS') : 0) || 0);
        if (store.$id === 'settings' && slowDelay > 0) {
          console.info(`[DEV] ARC_SLOW_SETTINGS active: delaying settings snapshot application by ${slowDelay}ms`);
          setTimeout(() => {
            if (Object.keys(sanitizedPatch).length > 0) {
              store.$patch(sanitizedPatch);
            }
          }, slowDelay);
        } else {
          if (Object.keys(sanitizedPatch).length > 0) {
            store.$patch(sanitizedPatch);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to parse persisted state for store ${store.$id}:`, e);
    }
  }

  let timeoutId: any;
  store.$subscribe((mutation, state) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      try {
        let stateToSave = state;
        
        // Exclude ephemeral state from 'chat' store
        if (store.$id === 'chat') {
          stateToSave = { ...state };
          delete (stateToSave as any).isStreaming;
          delete (stateToSave as any).currentResponse;
          delete (stateToSave as any).isSearching;
        }

        // Exclude ephemeral console logs from 'terminal' store
        if (store.$id === 'terminal') {
          stateToSave = { ...state, logs: [] };
        }

        // Phase C.3: Exclude reactorColorTheme from persistent storage
        if (store.$id === 'settings') {
          stateToSave = { ...state };
          delete (stateToSave as any).reactorColorTheme;
        }

        const json = safeStringify(stateToSave);
        if (json) {
          localStorage.setItem(`arc_state_${store.$id}`, json);
        }
      } catch (e) {
        console.error(`Failed to persist state for store ${store.$id}:`, e);
      }
    }, 500);
  });
}
