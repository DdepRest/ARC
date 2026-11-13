import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { platform } from 'os';

const WIN_AUDIO_DUCKER_CS = `
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr AudioSessionGuid, uint StreamFlags, out IntPtr SessionControl);
    int GetSimpleAudioVolume(IntPtr AudioSessionGuid, uint StreamFlags, out IntPtr AudioVolume);
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
}

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioSessionEnumerator {
    int GetCount(out int SessionCount);
    int GetSession(int SessionCount, [MarshalAs(UnmanagedType.IUnknown)] out object Session);
}

[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioSessionControl2 {
    int GetState(out int pRetVal);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetProcessId(out uint pRetVal);
    int IsSystemSoundsSession();
    int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
}

[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface ISimpleAudioVolume {
    int SetMasterVolume(float fLevel, ref Guid EventContext);
    int GetMasterVolume(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid EventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
}

public static class ArcAudioDucker {
    private static Dictionary<string, float> savedVolumes = new Dictionary<string, float>();

    private static bool IsArcProcess(uint pid, int selfPid) {
        if (pid == 0 || pid == (uint)selfPid) return true;
        try {
            Process p = Process.GetProcessById((int)pid);
            string name = (p.ProcessName ?? "").ToLowerInvariant();
            if (name.Contains("electron") || name.Contains("a.r.c") || name == "arc" || name.Contains("python") || name.Contains("ffmpeg")) {
                return true;
            }
        } catch { }
        return false;
    }

    public static void Duck(float factor, int selfPid) {
        try {
            float clampedFactor = Math.Max(0.1f, Math.Min(0.95f, factor));
            float multiplier = 1.0f - clampedFactor;
            IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            Guid iidMgr = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            Guid emptyGuid = Guid.Empty;
            int[] roles = new int[] { 1, 0 };
            foreach (int role in roles) {
                IMMDevice device;
                if (enumerator.GetDefaultAudioEndpoint(0, role, out device) != 0 || device == null) continue;
                object objMgr;
                if (device.Activate(ref iidMgr, 23, IntPtr.Zero, out objMgr) != 0 || objMgr == null) continue;
                IAudioSessionManager2 mgr = objMgr as IAudioSessionManager2;
                if (mgr == null) continue;
                IAudioSessionEnumerator sessionEnum;
                if (mgr.GetSessionEnumerator(out sessionEnum) != 0 || sessionEnum == null) continue;
                int count = 0;
                sessionEnum.GetCount(out count);
                for (int i = 0; i < count; i++) {
                    object sessionObj;
                    if (sessionEnum.GetSession(i, out sessionObj) != 0 || sessionObj == null) continue;
                    IAudioSessionControl2 ctl = sessionObj as IAudioSessionControl2;
                    if (ctl == null) continue;
                    uint pid = 0;
                    ctl.GetProcessId(out pid);
                    if (IsArcProcess(pid, selfPid)) continue;
                    ISimpleAudioVolume vol = sessionObj as ISimpleAudioVolume;
                    if (vol == null) continue;
                    string sessionId = null;
                    try { ctl.GetSessionInstanceIdentifier(out sessionId); } catch { }
                    string key = !string.IsNullOrEmpty(sessionId) ? sessionId : ("pid_" + pid.ToString() + "_" + i.ToString());
                    float curVol = 0f;
                    if (vol.GetMasterVolume(out curVol) == 0 && curVol > 0.001f) {
                        if (!savedVolumes.ContainsKey(key)) {
                            savedVolumes[key] = curVol;
                            float newVol = Math.Max(0.0f, Math.Min(curVol, curVol * multiplier));
                            vol.SetMasterVolume(newVol, ref emptyGuid);
                        }
                    }
                }
            }
        } catch { }
    }

    public static void Restore() {
        try {
            if (savedVolumes.Count == 0) return;
            IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            Guid iidMgr = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
            Guid emptyGuid = Guid.Empty;
            int[] roles = new int[] { 1, 0 };
            foreach (int role in roles) {
                IMMDevice device;
                if (enumerator.GetDefaultAudioEndpoint(0, role, out device) != 0 || device == null) continue;
                object objMgr;
                if (device.Activate(ref iidMgr, 23, IntPtr.Zero, out objMgr) != 0 || objMgr == null) continue;
                IAudioSessionManager2 mgr = objMgr as IAudioSessionManager2;
                if (mgr == null) continue;
                IAudioSessionEnumerator sessionEnum;
                if (mgr.GetSessionEnumerator(out sessionEnum) != 0 || sessionEnum == null) continue;
                int count = 0;
                sessionEnum.GetCount(out count);
                for (int i = 0; i < count; i++) {
                    object sessionObj;
                    if (sessionEnum.GetSession(i, out sessionObj) != 0 || sessionObj == null) continue;
                    IAudioSessionControl2 ctl = sessionObj as IAudioSessionControl2;
                    if (ctl == null) continue;
                    uint pid = 0;
                    ctl.GetProcessId(out pid);
                    ISimpleAudioVolume vol = sessionObj as ISimpleAudioVolume;
                    if (vol == null) continue;
                    string sessionId = null;
                    try { ctl.GetSessionInstanceIdentifier(out sessionId); } catch { }
                    string key = !string.IsNullOrEmpty(sessionId) ? sessionId : ("pid_" + pid.ToString() + "_" + i.ToString());
                    float origVol;
                    if (savedVolumes.TryGetValue(key, out origVol)) {
                        vol.SetMasterVolume(origVol, ref emptyGuid);
                    }
                }
            }
            savedVolumes.Clear();
        } catch { }
    }
}
`;

export class SystemMediaController {
  private static winPsProc: ChildProcessWithoutNullStreams | null = null;
  private static isSystemDucked = false;
  private static savedSystemVolume: number | null = null;

  private static ensureWinAudioSession(): ChildProcessWithoutNullStreams | null {
    if (platform() !== 'win32') return null;
    if (this.winPsProc && !this.winPsProc.killed && this.winPsProc.exitCode === null) {
      return this.winPsProc;
    }
    try {
      const proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'], {
        windowsHide: true,
        stdio: 'pipe'
      });
      proc.on('error', (err) => {
        console.warn('SystemMediaController: PowerShell audio ducker error:', err);
        this.winPsProc = null;
      });
      proc.on('exit', () => {
        this.winPsProc = null;
      });
      const b64Cs = Buffer.from(WIN_AUDIO_DUCKER_CS, 'utf8').toString('base64');
      proc.stdin.write(
        `$cs = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64Cs}')); Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue\n`
      );
      this.winPsProc = proc;
      return proc;
    } catch (e) {
      console.warn('SystemMediaController: Failed to start PowerShell audio session:', e);
      return null;
    }
  }

  static warmUp(): void {
    if (platform() === 'win32') {
      this.ensureWinAudioSession();
    }
  }

  static sendKey(action: 'playpause' | 'next' | 'prev') {
    const os = platform();

    if (os === 'win32') {
      const vk = {
        'playpause': '0xB3',
        'next': '0xB0',
        'prev': '0xB1'
      }[action];

      const psScript = `
$code = "using System.Runtime.InteropServices; public class Keyboard { [DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo); }"
Add-Type -TypeDefinition $code
[Keyboard]::keybd_event(${vk}, 0, 0, 0)
[Keyboard]::keybd_event(${vk}, 0, 2, 0)
      `.trim();

      const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
      console.log(`SystemMediaController: Sending key for action ${action} on platform ${os}`);
      exec(`powershell -NoProfile -EncodedCommand ${base64Script}`, (err) => {
        if (err) console.error('Failed to send media key (Windows):', err);
        else console.log('SystemMediaController: Command executed successfully');
      });
    } else if (os === 'darwin') {
      console.log(`SystemMediaController: Sending key for action ${action} on platform ${os}`);
      const key = {
        'playpause': '100',
        'next': '101',
        'prev': '98'
      }[action];
      exec(`osascript -e 'tell application "System Events" to key code ${key}'`, (err) => {
        if (err) console.error('Failed to send media key (macOS):', err);
        else console.log('SystemMediaController: Command executed successfully');
      });
    } else if (os === 'linux') {
      console.log(`SystemMediaController: Sending key for action ${action} on platform ${os}`);
      const key = {
        'playpause': 'XF86AudioPlay',
        'next': 'XF86AudioNext',
        'prev': 'XF86AudioPrev'
      }[action];
      exec(`xdotool key ${key}`, (err) => {
        if (err) {
          console.log('xdotool failed, trying playerctl...');
          const playerctlCmd = {
            'playpause': 'play-pause',
            'next': 'next',
            'prev': 'previous'
          }[action];
          exec(`playerctl ${playerctlCmd}`, (err2) => {
            if (err2) console.error('Failed to send media key (Linux):', err2);
            else console.log('SystemMediaController: Command executed successfully');
          });
        } else {
          console.log('SystemMediaController: Command executed successfully');
        }
      });
    }
  }

  static duckSystemAudio(factor: number = 0.7, enable: boolean = true) {
    const os = platform();
    const clampedFactor = Math.max(0.1, Math.min(0.95, factor));
    if (enable === this.isSystemDucked) return;
    this.isSystemDucked = enable;
    console.log(`SystemMediaController: Duck system audio: enable=${enable}, factor=${clampedFactor} on platform ${os}`);

    if (os === 'win32') {
      const proc = this.ensureWinAudioSession();
      if (proc && proc.stdin.writable) {
        if (enable) {
          const factorStr = clampedFactor.toFixed(2);
          proc.stdin.write(`[ArcAudioDucker]::Duck([float]${factorStr}, ${process.pid})\n`);
        } else {
          proc.stdin.write(`[ArcAudioDucker]::Restore()\n`);
        }
      }
    } else if (os === 'darwin') {
      if (enable) {
        exec(`osascript -e 'output volume of (get volume settings)'`, (err, stdout) => {
          const cur = parseInt((stdout || '').trim(), 10);
          if (!err && !isNaN(cur) && cur > 0) {
            this.savedSystemVolume = cur;
            const ducked = Math.max(1, Math.round(cur * (1 - clampedFactor)));
            exec(`osascript -e 'set volume output volume ${ducked}'`, () => {});
          }
        });
      } else if (this.savedSystemVolume !== null) {
        const restoreVol = this.savedSystemVolume;
        this.savedSystemVolume = null;
        exec(`osascript -e 'set volume output volume ${restoreVol}'`, () => {});
      }
    } else if (os === 'linux') {
      if (enable) {
        exec(`amixer -D pulse sget Master`, (err, stdout) => {
          const match = (stdout || '').match(/\[(\d+)%\]/);
          const cur = match ? parseInt(match[1], 10) : NaN;
          if (!err && !isNaN(cur) && cur > 0) {
            this.savedSystemVolume = cur;
            const ducked = Math.max(1, Math.round(cur * (1 - clampedFactor)));
            exec(`amixer -D pulse sset Master ${ducked}%`, () => {});
          }
        });
      } else if (this.savedSystemVolume !== null) {
        const restoreVol = this.savedSystemVolume;
        this.savedSystemVolume = null;
        exec(`amixer -D pulse sset Master ${restoreVol}%`, () => {});
      }
    }
  }
}
