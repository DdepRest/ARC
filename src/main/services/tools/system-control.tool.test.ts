import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemControlTool, WINDOWS_ALLOWED_APPS, LINUX_ALLOWED_APPS, MACOS_ALLOWED_APPS } from './system-control.tool';
import * as childProcess from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn((file, args, options, callback) => {
    callback(null, 'ok', '');
  })
}));

describe('SystemControlTool', () => {
  let tool: SystemControlTool;

  beforeEach(() => {
    tool = new SystemControlTool();
    vi.clearAllMocks();
  });

  it('rejects apps not in allowlist with APP_NOT_ALLOWED', async () => {
    const result = await tool.execute({
      action: 'launch_app',
      app_name: 'malicious_cmd.exe'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('APP_NOT_ALLOWED');
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });

  it('allows whitelisted apps and executes via execFile without shell', async () => {
    const originalPlatform = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = await tool.execute({
        action: 'launch_app',
        app_name: 'gnome-calculator'
      });

      expect(result.success).toBe(true);
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'gnome-calculator',
        [],
        expect.objectContaining({ shell: false }),
        expect.any(Function)
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('passes text safely as argument array in type_text', async () => {
    const originalPlatform = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const textPayload = 'Hello $(rm -rf /) & echo';
      const result = await tool.execute({
        action: 'type_text',
        text: textPayload
      });

      expect(result.success).toBe(true);
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'xdotool',
        ['type', '--delay', '50', textPayload],
        expect.objectContaining({ shell: false }),
        expect.any(Function)
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('passes mouse coordinates as array arguments on Linux', async () => {
    const originalPlatform = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const result = await tool.execute({
        action: 'mouse_click',
        x: 350,
        y: 420,
        click_type: 'right'
      });

      expect(result.success).toBe(true);
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'xdotool',
        ['mousemove', '350', '420'],
        expect.objectContaining({ shell: false }),
        expect.any(Function)
      );
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'xdotool',
        ['click', '3'],
        expect.objectContaining({ shell: false }),
        expect.any(Function)
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});
