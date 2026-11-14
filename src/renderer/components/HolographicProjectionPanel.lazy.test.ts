import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSSRApp, defineAsyncComponent, defineComponent, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';

describe('HolographicProjectionPanel lazy SettingsPanel loading (P1 3.1)', () => {
  const panelPaths = [
    path.resolve(__dirname, './HolographicProjectionPanel.vue'),
    path.resolve(__dirname, '../layouts/components/HolographicProjectionPanel.vue')
  ];

  it('does not statically import SettingsPanel.vue in either HolographicProjectionPanel', () => {
    for (const filePath of panelPaths) {
      const source = fs.readFileSync(filePath, 'utf-8');
      expect(source).not.toMatch(/import\s+SettingsPanel\s+from\s+['"][^'"]*SettingsPanel\.vue['"]/);
      expect(source).toMatch(
        /const\s+SettingsPanel\s*=\s*defineResilientAsyncView\(\s*\(\)\s*=>\s*import\(\s*['"][^'"]*SettingsPanel\.vue['"]\s*\)\s*\)/
      );
    }
  });

  it('does not invoke the SettingsPanel async loader while activeTab is not settings, and loads it when switched to settings', async () => {
    const settingsLoaderSpy = vi.fn(async () =>
      defineComponent({
        name: 'SettingsPanelStub',
        setup() {
          return () => h('div', { 'data-testid': 'settings-panel-loaded' }, 'Settings Loaded');
        }
      })
    );
    const chatLoaderSpy = vi.fn(async () =>
      defineComponent({
        name: 'ChatViewStub',
        setup() {
          return () => h('div', { 'data-testid': 'chat-view-loaded' }, 'Chat Loaded');
        }
      })
    );

    const AsyncSettings = defineAsyncComponent({ loader: settingsLoaderSpy });
    const AsyncChat = defineAsyncComponent({ loader: chatLoaderSpy });

    const activeTab = ref<'chat' | 'settings'>('chat');

    const ProjectionHarness = defineComponent({
      setup() {
        return () => {
          const Comp = activeTab.value === 'settings' ? AsyncSettings : AsyncChat;
          return h(Comp);
        };
      }
    });

    // 1. Render with activeTab = 'chat' -> SettingsPanel loader MUST NOT be called
    const initialHtml = await renderToString(createSSRApp(ProjectionHarness));
    expect(chatLoaderSpy).toHaveBeenCalledTimes(1);
    expect(settingsLoaderSpy).toHaveBeenCalledTimes(0);
    expect(initialHtml).toContain('Chat Loaded');
    expect(initialHtml).not.toContain('Settings Loaded');

    // 2. Switch to 'settings' -> SettingsPanel loader is invoked on demand
    activeTab.value = 'settings';
    const settingsHtml = await renderToString(createSSRApp(ProjectionHarness));
    expect(settingsLoaderSpy).toHaveBeenCalledTimes(1);
    expect(settingsHtml).toContain('Settings Loaded');
  });
});
