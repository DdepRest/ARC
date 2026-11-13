export interface ProviderHealthState {
  healthy: boolean;
  lastFailAt: number;
  failCount: number;
  consecutiveFails: number;
  inCooldownUntil: number;
  inQuarantineUntil: number;
}

class ProviderHealthManager {
  private states = new Map<string, ProviderHealthState>();

  getHealth(id: string): ProviderHealthState {
    const state = this.states.get(id);
    if (!state) return { healthy: true, lastFailAt: 0, failCount: 0, consecutiveFails: 0, inCooldownUntil: 0, inQuarantineUntil: 0 };
    
    const now = Date.now();
    // Auto-recover quarantine
    if (state.inQuarantineUntil > 0 && now > state.inQuarantineUntil) {
      console.log(`[Router] Provider ${id} released from quarantine`);
      state.inQuarantineUntil = 0;
      state.consecutiveFails = 0;
      state.healthy = true;
    }

    // Auto-recover cooldown
    if (state.inCooldownUntil > 0 && now > state.inCooldownUntil) {
      state.healthy = true;
      state.inCooldownUntil = 0;
    }
    return state;
  }

  isQuarantined(id: string): boolean {
    const health = this.getHealth(id);
    return health.inQuarantineUntil > Date.now();
  }

  markFailure(id: string, is429: boolean, isNetwork: boolean, status?: number) {
    let state = this.states.get(id);
    if (!state) state = { healthy: true, lastFailAt: 0, failCount: 0, consecutiveFails: 0, inCooldownUntil: 0, inQuarantineUntil: 0 };
    
    state.failCount++;
    state.lastFailAt = Date.now();
    state.healthy = false;
    
    if (is429) {
      state.inCooldownUntil = Date.now() + 60000; // 60s
    } else if (isNetwork) {
      state.inCooldownUntil = Date.now() + 30000; // 30s
    }

    // 404 (model not found), 400 (bad request), 401 (unauthorized), 403 (forbidden) are config/key errors, not infrastructure outages.
    // Do NOT quarantine the entire provider for invalid keys or model name issues.
    if (status === 404 || status === 400 || status === 401 || status === 403) {
      this.states.set(id, state);
      return;
    }

    state.consecutiveFails++;

    // 3 consecutive failures -> 10 minutes quarantine
    if (state.consecutiveFails >= 3 && state.inQuarantineUntil <= Date.now()) {
      state.inQuarantineUntil = Date.now() + 10 * 60 * 1000; // 10 minutes
      console.log(`[Router] Provider ${id} quarantined for 10m after 3 failures`);
    }
    
    this.states.set(id, state);
  }

  reset(id: string) {
    const existing = this.states.get(id);
    const wasUnhealthy = existing && (!existing.healthy || existing.inCooldownUntil > Date.now() || existing.inQuarantineUntil > Date.now());
    this.markSuccess(id);
    if (wasUnhealthy) {
      console.log(`[Router] Provider ${id} health manually reset`);
    }
  }

  resetAll() {
    this.states.clear();
  }

  markSuccess(id: string) {
    this.states.set(id, {
      healthy: true,
      lastFailAt: 0,
      failCount: 0,
      consecutiveFails: 0,
      inCooldownUntil: 0,
      inQuarantineUntil: 0
    });
  }
}

export const providerHealthManager = new ProviderHealthManager();

