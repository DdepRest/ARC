import { EventEmitter } from 'events';

export type EcoState = 'active' | 'idle' | 'hidden';

export class EcoService extends EventEmitter {
  private static instance: EcoService;
  private currentState: EcoState = 'active';
  private targetState: EcoState = 'active';
  private pendingReason: string = 'initial';
  private debounceTimer: NodeJS.Timeout | null = null;
  private static readonly DEBOUNCE_MS = 500;

  private constructor() {
    super();
  }

  public static getInstance(): EcoService {
    if (!EcoService.instance) {
      EcoService.instance = new EcoService();
    }
    return EcoService.instance;
  }

  public getState(): EcoState {
    return this.currentState;
  }

  public setState(state: EcoState, reason: string = 'unspecified'): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.currentState === state) {
      this.targetState = state;
      return;
    }

    this.targetState = state;
    this.pendingReason = reason;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.currentState !== this.targetState) {
        const oldState = this.currentState;
        this.currentState = this.targetState;
        console.log(`[EcoService] Eco state changed: ${oldState} -> ${this.currentState} (reason: ${this.pendingReason})`);
        this.emit('state-change', this.currentState);
      }
    }, EcoService.DEBOUNCE_MS);
  }

  public getIntervalMs(): number {
    switch (this.currentState) {
      case 'hidden':
        return 60000;
      case 'idle':
        return 30000;
      case 'active':
      default:
        return 10000;
    }
  }
}

export const ecoService = EcoService.getInstance();
