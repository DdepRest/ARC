import { useSettingsStore } from '../features/settings/stores/settings.store';
import { useUIStore } from '../stores/ui.store';
import { useChatStore } from '../features/chat/stores/chat.store';
import { useSessionsStore } from '../features/chat/stores/sessions.store';

export interface Hotkey {
  id: string;
  label: string;
  category: 'global' | 'chat' | 'navigation' | 'media';
  defaultKeys: string[];
  keys: string[];
  action: (e?: KeyboardEvent) => void;
}

class HotkeysService {
  private hotkeys: Map<string, Hotkey> = new Map();
  private isListening = false;

  constructor() {}

  public init() {
    this.registerDefaults();
    this.loadCustomKeys();
    
    if (!this.isListening) {
      window.addEventListener('keydown', this.handleKeyDown.bind(this));
      this.isListening = true;
    }
  }

  private registerDefaults() {
    this.register({
      id: 'global.search',
      label: 'Открыть поиск',
      category: 'global',
      defaultKeys: ['Control+k', 'Meta+k'],
      keys: [],
      action: (e) => {
        e?.preventDefault();
        window.dispatchEvent(new CustomEvent('open-spotlight'));
      }
    });

    this.register({
      id: 'global.settings',
      label: 'Открыть настройки',
      category: 'global',
      defaultKeys: ['Control+,', 'Meta+,'],
      keys: [],
      action: (e) => {
        e?.preventDefault();
        useUIStore().setActiveTab('settings');
      }
    });

    this.register({
      id: 'global.new_chat',
      label: 'Новый диалог',
      category: 'global',
      defaultKeys: ['Control+n', 'Meta+n'],
      keys: [],
      action: async (e) => {
        e?.preventDefault();
        useUIStore().setActiveTab('chat');
        const session = await useSessionsStore().createSession();
        useSessionsStore().switchSession(session.id);
        useChatStore().clearMessages();
      }
    });

    
    this.register({
      id: 'global.search_sessions',
      label: 'Поиск по истории (Ctrl+Shift+F)',
      category: 'global',
      defaultKeys: ['Control+Shift+F', 'Meta+Shift+F'],
      keys: [],
      action: (e) => {
        e?.preventDefault();
        useUIStore().setActiveTab('chat');
        // We can just focus the search input, but for now just changing tab is good
        // The user can press Tab or we can add a specific state.
        const searchInput = document.querySelector('input[placeholder*="Поиск по истории"]');
        if (searchInput) (searchInput as HTMLInputElement).focus();
      }
    });

    this.register({
      id: 'chat.stop_generation',
      label: 'Остановить генерацию (Ctrl+Shift+X)',
      category: 'chat',
      defaultKeys: ['Control+Shift+X', 'Meta+Shift+X'],
      keys: [],
      action: (e) => {
        e?.preventDefault();
        (window as any).api.aiAbortRequest();
      }
    });

    
    this.register({
      id: 'global.escape',
      label: 'Закрыть панель (Esc)',
      category: 'global',
      defaultKeys: ['Escape'],
      keys: [],
      action: (_e) => {
        // Handled directly by components (e.g. SpotlightSearch, modals)
      }
    });

    // Navigation
    this.register({
      id: 'nav.core',
      label: 'Перейти в Core',
      category: 'navigation',
      defaultKeys: ['Control+1', 'Meta+1'],
      keys: [],
      action: (e) => { e?.preventDefault(); useUIStore().setActiveTab('core'); }
    });
    
    this.register({
      id: 'nav.chat',
      label: 'Перейти в Chat',
      category: 'navigation',
      defaultKeys: ['Control+2', 'Meta+2'],
      keys: [],
      action: (e) => { e?.preventDefault(); useUIStore().setActiveTab('chat'); }
    });

    this.register({
      id: 'nav.settings',
      label: 'Перейти в Settings',
      category: 'navigation',
      defaultKeys: ['Control+3', 'Meta+3'],
      keys: [],
      action: (e) => { e?.preventDefault(); useUIStore().setActiveTab('settings'); }
    });

    this.register({
      id: 'nav.objectives',
      label: 'Перейти в Objectives',
      category: 'navigation',
      defaultKeys: ['Control+4', 'Meta+4'],
      keys: [],
      action: (e) => { e?.preventDefault(); useUIStore().setActiveTab('objectives'); }
    });
  }

  public register(hotkey: Hotkey) {
    if (!hotkey.keys || hotkey.keys.length === 0) {
      hotkey.keys = [...hotkey.defaultKeys];
    }
    this.hotkeys.set(hotkey.id, hotkey);
  }

  public getAll(): Hotkey[] {
    return Array.from(this.hotkeys.values());
  }

  public update(id: string, newKeys: string[]) {
    const hk = this.hotkeys.get(id);
    if (hk) {
      hk.keys = newKeys;
      this.saveCustomKeys();
    }
  }

  public reset(id: string) {
    const hk = this.hotkeys.get(id);
    if (hk) {
      hk.keys = [...hk.defaultKeys];
      this.saveCustomKeys();
    }
  }

  private loadCustomKeys() {
    try {
      const custom = JSON.parse(localStorage.getItem('arc_hotkeys') || '{}');
      for (const [id, keys] of Object.entries(custom)) {
        const hk = this.hotkeys.get(id);
        if (hk) {
          hk.keys = keys as string[];
        }
      }
    } catch (e) { console.warn('Ignored error in catch', e); }
  }

  private saveCustomKeys() {
    const custom: Record<string, string[]> = {};
    for (const [id, hk] of this.hotkeys.entries()) {
      if (JSON.stringify(hk.keys) !== JSON.stringify(hk.defaultKeys)) {
        custom[id] = hk.keys;
      }
    }
    localStorage.setItem('arc_hotkeys', JSON.stringify(custom));
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    
    // Build key string like "Control+Shift+A"
    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.metaKey) parts.push('Meta');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    
    if (!['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) {
      parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    }
    
    const combo = parts.join('+');
    
    for (const hk of this.hotkeys.values()) {
      // Basic match
      if (hk.keys.map(k => k.toLowerCase()).includes(combo.toLowerCase())) {
        hk.action(e);
        return;
      }
    }
  }
}

export const hotkeysService = new HotkeysService();
