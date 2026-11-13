import { hotkeysService } from './services/hotkeys.service';
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { persistencePlugin } from './bootstrap/plugins';
import { setupElectronApiMock } from './bootstrap/mock-database';
import { setupErrorHandlers } from './bootstrap/error-handler';
import App from './App.vue'
import { useSystemStore } from './stores/system.store'
import { useUIStore } from './stores/ui.store'
import { useSettingsStore } from './features/settings/stores/settings.store'
import { initSysLogs } from './composables/useSysLogs'
import { startAccentConsistencyCheck, logStartupOrder, startGhostTrap } from './utils/arcGhostDetector';
import { THEME_PALETTES } from './assets/styles/theme-palettes.tokens';
import './assets/styles/global.css'
import './style.css'

// Synchronous initial theme palette setup before Vue mount (CSP compliant, no inline scripts)
if (typeof document !== 'undefined') {
  try {
    const defaultPalette = THEME_PALETTES.red;
    const root = document.documentElement;
    root.style.setProperty('--accent', defaultPalette.color);
    root.style.setProperty('--color-accent', defaultPalette.color);
    root.style.setProperty('--color-accent-hover', defaultPalette.hover);
    root.style.setProperty('--color-accent-glow', defaultPalette.bgAlpha);
    root.style.setProperty('--accent-rgb', defaultPalette.rgb);
    root.style.setProperty('--accent-color', defaultPalette.color);
    root.style.setProperty('--accent-text', defaultPalette.text);
    root.style.setProperty('--accent-border', defaultPalette.border);
    root.style.setProperty('--accent-border-hover', defaultPalette.borderHover);
    root.style.setProperty('--accent-bg-alpha', defaultPalette.bgAlpha);
    root.style.setProperty('--accent-bg-alpha-hover', defaultPalette.bgAlphaHover);
    root.style.setProperty('--accent-glow', defaultPalette.glow);
    root.style.setProperty('--accent-glow-strong', defaultPalette.glowStrong);
    root.style.setProperty('--core-glow', defaultPalette.rgb);
  } catch (_) {}
}

// Global disaster recovery & error catcher
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[A.R.C. Uncaught Error]', event.error || event.message);
    const appEl = document.getElementById('app');
    if (appEl && appEl.children.length === 0) {
      appEl.innerHTML = `
        <div style="position:fixed;inset:0;background:#070707;color:#ffffff;font-family:monospace;padding:32px;z-index:999999;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;">
          <div style="max-width:680px;width:100%;background:#101010;border:1px solid var(--status-error);border-radius:12px;padding:24px;">
            <div style="color:var(--status-error);font-size:16px;font-weight:bold;margin-bottom:12px;">A.R.C. STARTUP RECOVERY</div>
            <div style="color:#aaaaaa;font-size:13px;margin-bottom:16px;">An unexpected error prevented the graphical shell from mounting:</div>
            <pre style="background:#000000;color:var(--status-error);padding:12px;border-radius:6px;font-size:11px;overflow:auto;max-height:200px;margin-bottom:16px;">${event.error?.stack || event.message || 'Unknown Error'}</pre>
            <div style="color:#666666;font-size:11px;">Press <strong>F12</strong> to open DevTools, or <strong>Ctrl+R</strong> to reload.</div>
          </div>
        </div>
      `;
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[A.R.C. Unhandled Rejection]', event.reason);
  });
}

const buildCommitHash = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '9048f71';
console.info('A.R.C. build', buildCommitHash);

try {
  initSysLogs();
} catch (e) {
  console.warn('[Bootstrap] initSysLogs warning:', e);
}

// Initialize Window API mock for Web Preview
setupElectronApiMock();

const app = createApp(App)
const pinia = createPinia()

pinia.use(persistencePlugin)
app.use(pinia)

try {
  hotkeysService.init();
} catch (e) {
  console.warn('[Bootstrap] hotkeysService.init warning:', e);
}

// Initialize settings and system monitoring
try {
  const settingsStore = useSettingsStore(pinia);
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__ARC_SETTINGS_STORE__ = settingsStore;
  }
} catch (e) {
  console.warn('[Bootstrap] settingsStore warning:', e);
}

try {
  const systemStore = useSystemStore(pinia)
  systemStore.initialize()
} catch (e) {
  console.warn('[Bootstrap] systemStore warning:', e);
}

// Initialize voice system
try {
  const uiStore = useUIStore(pinia)
  uiStore.initializeVoice()
} catch (e) {
  console.warn('[Bootstrap] uiStore warning:', e);
}

// Initialize Terminal Logging
try {
  setupErrorHandlers(pinia);
} catch (e) {
  console.warn('[Bootstrap] setupErrorHandlers warning:', e);
}

app.mount('#app')

// Initialize Ghost Detector: accent consistency checks, ghost trap & startup sequence log
try {
  startAccentConsistencyCheck();
  startGhostTrap();
  setTimeout(() => {
    logStartupOrder();
  }, 800);
} catch (e) {
  console.warn('[Bootstrap] ghost detector warning:', e);
}
