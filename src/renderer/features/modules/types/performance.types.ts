export type PerformanceMode =
  | 'ACTIVE'
  | 'BACKGROUND'
  | 'GAME_MODE'
  | 'BATTERY_SAVER'
  | 'REMOTE_DESKTOP';

export type QualityLevel = 'FULL' | 'REDUCED' | 'MINIMAL' | 'OFF';

export type TelemetryMode =
  | 'STREAMING_1HZ'
  | 'THROTTLED_02HZ'
  | 'EVENT_DRIVEN';

export interface PerformancePolicy {
  readonly mode: PerformanceMode;
  readonly targetFps: number;
  readonly effectsLevel: QualityLevel;
  readonly blurLevel: QualityLevel;
  readonly telemetryMode: TelemetryMode;
  readonly pollingMode: QualityLevel;
  readonly animationLevel: QualityLevel;
  readonly source: 'AUTO' | 'OPERATOR_OVERRIDE';
}

export const PERFORMANCE_POLICIES: Record<PerformanceMode, Omit<PerformancePolicy, 'mode' | 'source'>> = {
  ACTIVE: {
    targetFps: 60,
    effectsLevel: 'FULL',
    blurLevel: 'FULL',
    telemetryMode: 'STREAMING_1HZ',
    pollingMode: 'FULL',
    animationLevel: 'FULL',
  },
  BACKGROUND: {
    targetFps: 30,
    effectsLevel: 'REDUCED',
    blurLevel: 'REDUCED',
    telemetryMode: 'THROTTLED_02HZ',
    pollingMode: 'REDUCED',
    animationLevel: 'REDUCED',
  },
  GAME_MODE: {
    targetFps: 15,
    effectsLevel: 'OFF',
    blurLevel: 'OFF',
    telemetryMode: 'EVENT_DRIVEN',
    pollingMode: 'MINIMAL',
    animationLevel: 'OFF',
  },
  BATTERY_SAVER: {
    targetFps: 24,
    effectsLevel: 'MINIMAL',
    blurLevel: 'REDUCED',
    telemetryMode: 'THROTTLED_02HZ',
    pollingMode: 'MINIMAL',
    animationLevel: 'MINIMAL',
  },
  REMOTE_DESKTOP: {
    targetFps: 30,
    effectsLevel: 'OFF',
    blurLevel: 'OFF',
    telemetryMode: 'THROTTLED_02HZ',
    pollingMode: 'REDUCED',
    animationLevel: 'OFF',
  },
};
