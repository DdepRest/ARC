import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { ecoService, type EcoState } from './eco.service';

const execAsync = promisify(exec);

export type Tier = 'heavy' | 'medium' | 'light' | 'survival';
export type Preset = 'turbo' | 'standard' | 'eco' | 'auto';

export class AdaptiveService {
  private currentTier: Tier = 'heavy';
  private manualPreset: Preset = 'auto';
  private processList: string[] = ['steam.exe', 'discord.exe'];
  private monitorTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    this.startMonitoring();
  }

  setManualPreset(preset: Preset) {
    this.manualPreset = preset;
    this.evaluateTier();
  }
  
  getManualPreset(): Preset {
    return this.manualPreset;
  }
  
  getCurrentTier(): Tier {
    return this.currentTier;
  }
  
  addProcess(name: string) {
    if (!this.processList.includes(name)) {
      this.processList.push(name);
    }
  }

  private getMonitoringIntervalMs(): number {
    const ecoState = ecoService.getState();
    if (ecoState === 'hidden') {
      return 300000; // 5 minutes in background / hidden
    }
    if (ecoState === 'idle') {
      return 60000; // 1 minute in idle
    }
    return 30000; // 30 seconds in active
  }

  private scheduleMonitoring() {
    if (this.monitorTimer) {
      clearTimeout(this.monitorTimer);
      this.monitorTimer = null;
    }
    const intervalMs = this.getMonitoringIntervalMs();
    this.monitorTimer = setTimeout(async () => {
      await this.evaluateTier();
      this.scheduleMonitoring();
    }, intervalMs);
  }

  private startMonitoring() {
    this.scheduleMonitoring();
    ecoService.on('state-change', () => {
      this.scheduleMonitoring();
    });
  }

  public setEcoState(state: EcoState) {
    this.scheduleMonitoring();
  }

  private async getGpuUsage(): Promise<number> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits');
        return parseInt(stdout.trim()) || 0;
      }
      return 0; // Fallback for non-NVIDIA or non-Windows
    } catch (e) {
      return 0; // Ignore error if nvidia-smi not available
    }
  }

  private async checkProcesses(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FO CSV /NH');
        const running = stdout.toLowerCase();
        for (const p of this.processList) {
          if (running.includes(p.toLowerCase())) {
            return true; // Heavy process found
          }
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  private async evaluateTier() {
    if (this.manualPreset === 'turbo') {
      this.setTier('heavy');
      return;
    }
    if (this.manualPreset === 'eco') {
      this.setTier('light');
      return;
    }

    // Auto or standard behavior
    const hasHeavyProcess = await this.checkProcesses();
    const gpuUsage = await this.getGpuUsage();
    
    let newTier: Tier = 'heavy';
    
    if (hasHeavyProcess) {
      newTier = 'light';
    } else if (gpuUsage > 70) {
      newTier = 'medium';
    }
    
    this.setTier(newTier);
  }

  private setTier(tier: Tier) {
    if (this.currentTier !== tier) {
      this.currentTier = tier;
      // Also notify f5tts server if needed, though TTS service can query this
    }
  }
}

export const adaptiveService = new AdaptiveService();
