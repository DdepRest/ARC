import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DiagnosticsService, maskSecrets, sanitizeLogLine } from './diagnostics.service';
import { DatabaseService } from './database';
import { dialog } from 'electron';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getVersion: vi.fn(() => '2.5.0')
  },
  dialog: {
    showSaveDialog: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null)
  }
}));

vi.mock('systeminformation', () => ({
  currentLoad: vi.fn().mockResolvedValue({ currentLoad: 14.5 }),
  graphics: vi.fn().mockResolvedValue({
    controllers: [{ model: 'NVIDIA RTX 4080', vram: 16384 }]
  }),
  cpuTemperature: vi.fn().mockResolvedValue({ main: 48.5 })
}));

vi.mock('./llm/providers/provider-manager', () => ({
  providerManager: {
    getProviders: vi.fn().mockResolvedValue([
      { id: 'openrouter', name: 'OpenRouter', type: 'cloud', enabled: true, model: 'claude-3.5', hasApiKey: true, apiKeyStatus: 'ok', apiKey: 'sk-ant-123456789secret' },
      { id: 'ollama', name: 'Ollama', type: 'local', enabled: false, model: 'llama3.2', hasApiKey: false, apiKeyStatus: 'missing' }
    ])
  }
}));

describe('DiagnosticsService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-diag-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('1. maskSecrets and sanitizeLogLine correctly mask sensitive data', () => {
    const rawSecret = 'Authorization: Bearer mySecretToken12345 and sk-abcdefgh999888 and password: "mySuperPassword"';
    const masked = maskSecrets(rawSecret);

    expect(masked).not.toContain('mySecretToken12345');
    expect(masked).not.toContain('999888');
    expect(masked).not.toContain('mySuperPassword');
    expect(masked).toContain('Bearer mySecr***');
    expect(masked).toContain('sk-abcdefgh***');

    // Home path masking
    const pathText = '/Users/alex/project/file.ts and C:\\Users\\Administrator\\AppData';
    const maskedPath = maskSecrets(pathText);
    expect(maskedPath).not.toContain('/alex/');
    expect(maskedPath).not.toContain('\\Administrator\\');

    // Dialog log stripping
    const logJson = JSON.stringify({
      timestamp: '2026-11-02T10:00:00Z',
      userText: 'Hello private message',
      arcText: 'Secret AI reply',
      sessionId: 42
    });
    const sanitized = sanitizeLogLine(logJson);
    expect(sanitized).not.toContain('Hello private message');
    expect(sanitized).not.toContain('Secret AI reply');
    expect(sanitized).toContain('"userText":"[STRIPPED]"');
    expect(sanitized).toContain('"arcText":"[STRIPPED]"');
  });

  it('2. collectReport produces valid schema matching DiagnosticsReport and excludes userDataPath from app', async () => {
    // Mock DatabaseService
    DatabaseService.db = {
      prepare: vi.fn((sql: string) => ({
        get: () => {
          if (sql.includes('arc_tasks')) return { n: 12 };
          if (sql.includes('sessions')) return { n: 5 };
          if (sql.includes('arc_objectives')) return { n: 3 };
          if (sql.includes('ltm')) return { n: 20 };
          return { n: 0 };
        }
      }))
    };

    // Create a mock launcher-index.json
    fs.writeFileSync(
      path.join(tmpDir, 'launcher-index.json'),
      JSON.stringify({ totalItems: 45, indexedAt: '2026-11-02T08:00:00Z' })
    );

    // Create a mock macros-schedule-state.json with 2 entries
    fs.writeFileSync(
      path.join(tmpDir, 'macros-schedule-state.json'),
      JSON.stringify({
        'macro-1::node-1': { lastRunDate: '2026-11-02', lastRunTs: 1730534400000 },
        'macro-2::node-3': { lastRunDate: '2026-11-02', lastRunTs: 1730538000000 }
      })
    );

    // Create mock log tail
    const logDir = path.join(tmpDir, 'logs', 'dialogs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, 'dialogs.log'),
      'line 1\n{"userText":"private input"}\nline 3\n'
    );

    // Create mock db, models and macros files for folderSizesBytes
    fs.writeFileSync(path.join(tmpDir, 'arc.db'), Buffer.alloc(1024));
    const modelsDir = path.join(tmpDir, 'models');
    fs.mkdirSync(modelsDir, { recursive: true });
    fs.writeFileSync(path.join(modelsDir, 'sample.bin'), Buffer.alloc(2048));
    // Nested subfolder inside models should NOT be summed (non-recursive 4-subfolder limit)
    fs.mkdirSync(path.join(modelsDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(modelsDir, 'nested', 'deep.bin'), Buffer.alloc(4096));
    const macrosDir = path.join(tmpDir, 'macros');
    fs.mkdirSync(macrosDir, { recursive: true });
    fs.writeFileSync(path.join(macrosDir, 'm1.json'), '{"id":"m1"}');

    const report = await DiagnosticsService.collectReport(tmpDir);

    expect(report.schemaVersion).toBe(1);
    expect(report.timestamp).toBeDefined();

    // App info: version + commit present, never stale hardcoded SHA, strictly NO userDataPath
    expect(report.app.version).toBe('2.5.0');
    expect(typeof report.app.commit).toBe('string');
    expect(report.app.commit.length).toBeGreaterThan(0);
    expect(report.app.commit).not.toBe('9048f71');
    expect(['env', 'git', 'file', 'unknown']).toContain(report.app.commitSource);
    expect((report.app as any).userDataPath).toBeUndefined();

    // System info & gpuControllers
    expect(report.system.osRelease).toBeDefined();
    expect(report.system.cpuCores).toBeGreaterThan(0);
    expect(report.system.gpuControllers).toEqual([
      { model: 'NVIDIA RTX 4080', vram: 16384 }
    ]);

    // Dynamic metrics from systeminformation mock
    expect(report.metrics.cpuLoadPercent).toBe(14.5);
    expect(report.metrics.gpuModel).toBe('NVIDIA RTX 4080');
    expect(report.metrics.vramTotalMb).toBe(16384);

    // Storage and DB counts + folderSizesBytes
    expect(report.storage.counts.tasks).toBe(12);
    expect(report.storage.counts.sessions).toBe(5);
    expect(report.storage.counts.objectives).toBe(3);
    expect(report.storage.counts.memories).toBe(20);
    expect(report.storage.launcherIndex.exists).toBe(true);
    expect(report.storage.launcherIndex.totalItems).toBe(45);
    expect(report.storage.folderSizesBytes.database).toBe(1024);
    expect(report.storage.folderSizesBytes.logs).toBeGreaterThan(0);
    expect(report.storage.folderSizesBytes.models).toBe(2048);
    expect(report.storage.folderSizesBytes.macros).toBe(11);

    // Scheduler macrosScheduleEntries
    expect(report.scheduler.macrosScheduleEntries).toBe(2);

    // Providers stripped of raw apiKey
    expect(report.providers.length).toBe(2);
    expect((report.providers[0] as any).apiKey).toBeUndefined();
    expect(report.providers[0].hasApiKey).toBe(true);
    expect(report.providers[0].name).toBe('OpenRouter');

    // Recent log tail
    expect(report.recentLogTail.length).toBe(3);
    expect(report.recentLogTail[1]).toContain('[STRIPPED]');
  });

  it('3. storage.counts, folderSizesBytes and scheduler.macrosScheduleEntries fall back cleanly to 0 if db/files throw or are missing', async () => {
    DatabaseService.db = {
      prepare: vi.fn(() => {
        throw new Error('Table corrupted');
      })
    };

    const report = await DiagnosticsService.collectReport(tmpDir);
    expect(report.storage.counts.tasks).toBe(0);
    expect(report.storage.counts.sessions).toBe(0);
    expect(report.storage.counts.objectives).toBe(0);
    expect(report.storage.counts.memories).toBe(0);
    expect(report.storage.folderSizesBytes).toEqual({
      database: 0,
      logs: 0,
      models: 0,
      macros: 0
    });
    expect(report.scheduler.macrosScheduleEntries).toBe(0);
  });

  it('4. exportDiagnostics returns canceled: true when dialog is canceled by user', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: true,
      filePath: ''
    });

    const result = await DiagnosticsService.exportDiagnostics();
    expect(result.success).toBe(false);
    expect(result.canceled).toBe(true);
  });

  it('5. exportDiagnostics writes valid formatted JSON when save path is chosen', async () => {
    const targetFilePath = path.join(tmpDir, 'exported-diagnostics.json');
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: false,
      filePath: targetFilePath
    });

    const result = await DiagnosticsService.exportDiagnostics();
    expect(result.success).toBe(true);
    expect(result.filePath).toBe(targetFilePath);

    // Verify written file exists and is valid JSON
    expect(fs.existsSync(targetFilePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(targetFilePath, 'utf-8'));
    expect(content.schemaVersion).toBe(1);
    expect(content.app).toBeDefined();
    expect((content.app as any).userDataPath).toBeUndefined();
  });
});
