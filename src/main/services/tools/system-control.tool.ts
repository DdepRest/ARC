import { ToolDefinition, ToolInstance, ToolResult } from '../../../shared/types/tools';
import { execFile } from 'child_process';
import os from 'os';
import si from 'systeminformation';

export const WINDOWS_ALLOWED_APPS = ['calc.exe', 'notepad.exe', 'mspaint.exe', 'explorer.exe'] as const;
export const MACOS_ALLOWED_APPS = ['Calculator', 'TextEdit', 'Safari'] as const;
export const LINUX_ALLOWED_APPS = ['gnome-calculator', 'gedit', 'firefox'] as const;

export class SystemControlTool implements ToolInstance {
  definition: ToolDefinition = {
    name: 'system_control',
    description: 'Control operating system tasks including volume adjustments, battery/uptime info, launching apps, mouse movement, clicking, typing, and capturing screen vision.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The specific operation to perform: "set_volume", "get_system_info", "launch_app", "mouse_click", "mouse_move", "mouse_scroll", "type_text", "key_press", "capture_screen"',
          enum: ['set_volume', 'get_system_info', 'launch_app', 'mouse_click', 'mouse_move', 'mouse_scroll', 'type_text', 'key_press', 'capture_screen']
        },
        volume_level: {
          type: 'string',
          description: 'A percentage (0-100) or direction for volume level, e.g., "50", "+10", "-10", "mute", "unmute".'
        },
        app_name: {
          type: 'string',
          description: 'The app to launch, e.g., "calculator", "notepad", "paint", "browser", "explorer".'
        },
        click_type: {
          type: 'string',
          description: 'Mouse click type: "left", "right", "double", or "middle". Default is "left".'
        },
        x: {
          type: 'number',
          description: 'X coordinate on screen for mouse actions.'
        },
        y: {
          type: 'number',
          description: 'Y coordinate on screen for mouse actions.'
        },
        text: {
          type: 'string',
          description: 'Text string to type out.'
        },
        key: {
          type: 'string',
          description: 'Key or shortcut to press, e.g. "Enter", "Space", "Tab", "Escape", "Ctrl+C".'
        },
        scroll_direction: {
          type: 'string',
          description: 'Scroll direction: "up" or "down".'
        }
      },
      required: ['action']
    }
  };

  async execute(params: {
    action: string;
    volume_level?: string;
    app_name?: string;
    click_type?: string;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    scroll_direction?: string;
  }): Promise<ToolResult> {
    const { action, volume_level, app_name, click_type = 'left', x, y, text, key, scroll_direction = 'down' } = params;
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    try {
      if (action === 'mouse_click' || action === 'mouse_move') {
        const posX = typeof x === 'number' ? Math.round(x) : 500;
        const posY = typeof y === 'number' ? Math.round(y) : 500;

        if (isWin) {
          const btnCode = click_type === 'right' ? '0x0008, 0x0010' : click_type === 'middle' ? '0x0020, 0x0040' : '0x0002, 0x0004';
          const isDb = click_type === 'double' ? '$user32::mouse_event(0x0002,0,0,0,0); $user32::mouse_event(0x0004,0,0,0,0);' : '';
          const psScript = `
            Add-Type -TypeDefinition @"
            using System;
            using System.Runtime.InteropServices;
            public class User32 {
              [DllImport("user32.dll")]
              public static extern bool SetCursorPos(int X, int Y);
              [DllImport("user32.dll")]
              public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
            }
"@
            [User32]::SetCursorPos(${posX}, ${posY})
            ${action === 'mouse_click' ? `[User32]::mouse_event(${btnCode}, 0, 0, 0, 0); ${isDb}` : ''}
          `;
          const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
          await this.runBinary('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded]);
          return {
            success: true,
            data: action === 'mouse_click'
              ? `Mouse ${click_type} click executed at (${posX}, ${posY})`
              : `Mouse moved to (${posX}, ${posY})`,
            toolName: this.definition.name
          };
        }

        if (isMac) {
          const clickCmd = click_type === 'double' ? 'click; click' : click_type === 'right' ? 'right click' : 'click';
          const script = `tell application "System Events" to ${clickCmd} at {${posX}, ${posY}}`;
          await this.runBinary('/usr/bin/osascript', ['-e', script]);
          return { success: true, data: `Mouse ${click_type} click executed at (${posX}, ${posY}) on macOS`, toolName: this.definition.name };
        }

        // Linux (xdotool)
        await this.runBinary('xdotool', ['mousemove', String(posX), String(posY)]);
        if (action === 'mouse_click') {
          const btnNum = click_type === 'right' ? '3' : click_type === 'middle' ? '2' : '1';
          const clickArgs = click_type === 'double'
            ? ['click', '--repeat', '2', '--delay', '100', btnNum]
            : ['click', btnNum];
          await this.runBinary('xdotool', clickArgs);
        }
        return { success: true, data: `Mouse action executed at (${posX}, ${posY}) on Linux`, toolName: this.definition.name };
      }

      if (action === 'mouse_scroll') {
        const steps = 5;
        if (isWin) {
          const delta = scroll_direction === 'up' ? 120 * steps : -120 * steps;
          const psScript = `
            Add-Type -TypeDefinition @"
            using System;
            using System.Runtime.InteropServices;
            public class User32Scroll {
              [DllImport("user32.dll")]
              public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, int dwExtraInfo);
            }
"@
            [User32Scroll]::mouse_event(0x0800, 0, 0, ${delta}, 0)
          `;
          const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
          await this.runBinary('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded]);
          return { success: true, data: `Scrolled ${scroll_direction} on Windows`, toolName: this.definition.name };
        }

        if (isMac) {
          const keyCode = scroll_direction === 'up' ? '126' : '125';
          await this.runBinary('/usr/bin/osascript', ['-e', `tell application "System Events" to key code ${keyCode}`]);
          return { success: true, data: `Scrolled ${scroll_direction} on macOS`, toolName: this.definition.name };
        }

        // Linux
        const btn = scroll_direction === 'up' ? '4' : '5';
        await this.runBinary('xdotool', ['click', '--repeat', String(steps), btn]);
        return { success: true, data: `Scrolled ${scroll_direction} on Linux`, toolName: this.definition.name };
      }

      if (action === 'type_text') {
        if (!text) return { success: false, error: 'Text string is required for type_text', toolName: this.definition.name };

        if (isWin) {
          const psScript = '$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys($args[0])';
          await this.runBinary('powershell.exe', ['-NoProfile', '-Command', psScript, text]);
          return { success: true, data: `Typed text: "${text}"`, toolName: this.definition.name };
        }

        if (isMac) {
          const script = 'on run argv\ntell application "System Events" to keystroke (item 1 of argv)\nend run';
          await this.runBinary('/usr/bin/osascript', ['-e', script, text]);
          return { success: true, data: `Typed text on macOS: "${text}"`, toolName: this.definition.name };
        }

        // Linux
        await this.runBinary('xdotool', ['type', '--delay', '50', text]);
        return { success: true, data: `Typed text on Linux: "${text}"`, toolName: this.definition.name };
      }

      if (action === 'key_press') {
        const rawK = (key || 'Enter').trim();
        const k = rawK.replace(/[^a-zA-Z0-9_+\-]/g, '');
        if (!k) return { success: false, error: 'Invalid key specification', toolName: this.definition.name };

        if (isWin) {
          const winKey = k === 'Enter' ? '{ENTER}' : k === 'Space' ? ' ' : k === 'Tab' ? '{TAB}' : k === 'Escape' ? '{ESC}' : k;
          await this.runBinary('powershell.exe', ['-NoProfile', '-Command', '$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys($args[0])', winKey]);
          return { success: true, data: `Pressed key: ${k}`, toolName: this.definition.name };
        }

        if (isMac) {
          await this.runBinary('/usr/bin/osascript', ['-e', 'tell application "System Events" to key code 36']);
          return { success: true, data: `Pressed key on macOS: ${k}`, toolName: this.definition.name };
        }

        await this.runBinary('xdotool', ['key', k]);
        return { success: true, data: `Pressed key on Linux: ${k}`, toolName: this.definition.name };
      }

      if (action === 'set_volume') {
        const val = parseInt(volume_level || '50', 10);
        const safeVal = isNaN(val) ? 50 : Math.max(0, Math.min(100, val));

        if (isWin) {
          const script = `
            $wsh = New-Object -ComObject WScript.Shell
            1..50 | ForEach-Object { $wsh.SendKeys([char]174) }
            $steps = [Math]::Round(${safeVal} / 2)
            1..$steps | ForEach-Object { $wsh.SendKeys([char]175) }
          `;
          await this.runBinary('powershell.exe', ['-NoProfile', '-Command', script.replace(/\n/g, '; ')]);
          return { success: true, data: `Volume set to approx ${safeVal}%`, toolName: this.definition.name };
        }

        if (isMac) {
          await this.runBinary('/usr/bin/osascript', ['-e', `set volume output volume ${safeVal}`]);
          return { success: true, data: `Volume set to ${safeVal}% on macOS`, toolName: this.definition.name };
        }

        await this.runBinary('amixer', ['-D', 'pulse', 'sset', 'Master', `${safeVal}%`]);
        return { success: true, data: `Volume set to ${safeVal}% on Linux`, toolName: this.definition.name };
      }

      if (action === 'get_system_info') {
        const [battery, time, cpu] = await Promise.all([
          si.battery().catch(() => ({ hasBattery: false, percent: 0, isCharging: false })),
          si.time(),
          si.currentLoad().catch(() => ({ currentLoad: 0 }))
        ]);

        const uptimeHours = (time.uptime / 3600).toFixed(1);
        const batteryInfo = battery.hasBattery
          ? `Battery: ${battery.percent}% (${battery.isCharging ? 'Charging' : 'Discharging'})`
          : 'Battery: Desktop/AC (No battery detected)';

        return {
          success: true,
          data: `OS: ${os.type()} ${os.release()} (${os.arch()})\nUptime: ${uptimeHours} hours\nCPU Load: ${cpu.currentLoad.toFixed(1)}%\n${batteryInfo}`,
          toolName: this.definition.name
        };
      }

      if (action === 'launch_app') {
        const app = (app_name || '').toLowerCase().trim();

        if (isWin) {
          let binary: string | null = null;
          if (app === 'calc.exe' || app.includes('calc')) binary = 'calc.exe';
          else if (app === 'notepad.exe' || app.includes('note') || app.includes('text')) binary = 'notepad.exe';
          else if (app === 'mspaint.exe' || app.includes('paint') || app.includes('draw')) binary = 'mspaint.exe';
          else if (app === 'explorer.exe' || app.includes('explorer') || app.includes('folder') || app.includes('file')) binary = 'explorer.exe';

          if (!binary || !WINDOWS_ALLOWED_APPS.includes(binary as any)) {
            return { success: false, error: 'APP_NOT_ALLOWED', toolName: this.definition.name };
          }

          await this.runBinary(binary, []);
          return { success: true, data: `Launched ${binary} on Windows`, toolName: this.definition.name };
        }

        if (isMac) {
          let macApp: string | null = null;
          if (app.toLowerCase() === 'calculator' || app.includes('calc')) macApp = 'Calculator';
          else if (app.toLowerCase() === 'textedit' || app.includes('note') || app.includes('text')) macApp = 'TextEdit';
          else if (app.toLowerCase() === 'safari' || app.includes('browser') || app.includes('safari')) macApp = 'Safari';

          if (!macApp || !MACOS_ALLOWED_APPS.includes(macApp as any)) {
            return { success: false, error: 'APP_NOT_ALLOWED', toolName: this.definition.name };
          }

          await this.runBinary('/usr/bin/open', ['-a', macApp]);
          return { success: true, data: `Launched ${macApp} on macOS`, toolName: this.definition.name };
        }

        // Linux
        let linuxApp: string | null = null;
        if (app === 'gnome-calculator' || app.includes('calc')) linuxApp = 'gnome-calculator';
        else if (app === 'gedit' || app.includes('note') || app.includes('text')) linuxApp = 'gedit';
        else if (app === 'firefox' || app.includes('browser') || app.includes('firefox')) linuxApp = 'firefox';

        if (!linuxApp || !LINUX_ALLOWED_APPS.includes(linuxApp as any)) {
          return { success: false, error: 'APP_NOT_ALLOWED', toolName: this.definition.name };
        }

        await this.runBinary(linuxApp, []);
        return { success: true, data: `Launched ${linuxApp} on Linux`, toolName: this.definition.name };
      }

      return { success: false, error: `Unknown action: ${action}`, toolName: this.definition.name };
    } catch (err: any) {
      return { success: false, error: err.message || 'System control execution failed', toolName: this.definition.name };
    }
  }

  private runBinary(file: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(file, args, { shell: false, timeout: 5000 }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve((stdout || stderr || '').toString());
      });
    });
  }
}
