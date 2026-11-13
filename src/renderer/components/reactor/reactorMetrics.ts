export interface ReactorVisualTargets {
  coreIntensity: number;
  coreScale: number;
  ringIntensity: number;
  ringSpeed: number;
  particleIntensity: number;
  signalIntensity: number;
  bloomStrength: number;
  frameActivity: number;
}

export interface AudioBands {
  bass: number;
  mid: number;
  treble: number;
  total: number;
}

/**
 * Computes outer rings rotation speed based on CPU load (0..100%).
 * Neutral speed multiplier is 1.0 at cpuLoad = 0.
 * Scales linearly up to 2.0 at cpuLoad = 100.
 * Output is bounded between baseSpeed * 0.5 and baseSpeed * 2.0.
 */
export function computeLoadDrivenSpeed(cpuLoad: number, baseSpeed: number = 1.0): number {
  const clampedCpu = Math.max(0, Math.min(100, Number.isFinite(cpuLoad) ? cpuLoad : 0));
  const speedMultiplier = 1.0 + (clampedCpu / 100) * 1.0;
  const rawSpeed = baseSpeed * speedMultiplier;
  const minSpeed = baseSpeed * 0.5;
  const maxSpeed = baseSpeed * 2.0;
  return Math.max(minSpeed, Math.min(maxSpeed, rawSpeed));
}

/**
 * Computes glow/bloom pulsation multiplier based on RAM memory usage (0..100%).
 * Neutral pulse multiplier is 1.0 at memoryUsage = 0.
 * Scales linearly up to 1.8 at memoryUsage = 100.
 * Output is bounded between basePulse * 0.8 and basePulse * 2.0.
 */
export function computeRamGlowPulse(memoryUsage: number, basePulse: number = 1.0): number {
  const clampedRam = Math.max(0, Math.min(100, Number.isFinite(memoryUsage) ? memoryUsage : 0));
  const pulseMultiplier = 1.0 + (clampedRam / 100) * 0.8;
  const rawPulse = basePulse * pulseMultiplier;
  const minPulse = basePulse * 0.8;
  const maxPulse = basePulse * 2.0;
  return Math.max(minPulse, Math.min(maxPulse, rawPulse));
}

export const MAX_RUNNER_SPEED_MULT = 3.0;

/**
 * Computes speed multiplier for Light Runners based on RAM pulse multiplier and audio level.
 */
export function computeRunnerSpeedMultiplier(
  ramPulseMult: number = 1.0,
  audioLevel: number = 0.0
): number {
  const safeRamMult = Number.isFinite(ramPulseMult) ? Math.max(0.8, Math.min(2.0, ramPulseMult)) : 1.0;
  const safeAudio = Number.isFinite(audioLevel) ? Math.max(0, Math.min(1.0, audioLevel)) : 0.0;

  const ramFactor = 1.0 + (safeRamMult - 1.0) * 0.5;
  const audioFactor = 1.0 + safeAudio * 2.0;

  const rawMultiplier = ramFactor * audioFactor;
  return Math.max(0.5, Math.min(MAX_RUNNER_SPEED_MULT, rawMultiplier));
}

/**
 * Evaluates overload state with hysteresis to avoid flickering:
 * Enters overload mode when cpuLoad >= 85 OR memoryUsage >= 85.
 * Exits overload mode only when cpuLoad <= 75 AND memoryUsage <= 75.
 */
export function checkOverloadState(
  cpuLoad: number,
  memoryUsage: number,
  currentlyOverloaded: boolean = false
): boolean {
  const cpu = Math.max(0, Math.min(100, Number.isFinite(cpuLoad) ? cpuLoad : 0));
  const ram = Math.max(0, Math.min(100, Number.isFinite(memoryUsage) ? memoryUsage : 0));

  if (!currentlyOverloaded) {
    return cpu >= 85 || ram >= 85;
  } else {
    return !(cpu <= 75 && ram <= 75);
  }
}

export type RunnerFlowDirection = 'incoming' | 'circular' | 'outgoing' | 'sync' | 'hover';

export interface RunnerFlowResult {
  direction: RunnerFlowDirection;
  u: number;
}

/**
 * Computes deterministic energy pulse runner flow parameter u (0..1) and direction for a given state.
 */
export function computeRunnerEnergyFlow(
  state: string,
  elapsedTime: number,
  runnerIndex: number,
  midAudio: number = 0.0
): RunnerFlowResult {
  const safeTime = Number.isFinite(elapsedTime) ? elapsedTime : 0;
  const safeMid = clampAudioLevel(midAudio);
  const offset = (runnerIndex % 3) * 0.333;

  switch (state) {
    case 'listening':
      // INWARD: external nodes -> ports -> heart (u: 1 -> 0)
      return {
        direction: 'incoming',
        u: 1.0 - ((safeTime * 1.0 + offset) % 1.0),
      };
    case 'processing':
      // CIRCULAR: routing between ports A -> R -> C
      return {
        direction: 'circular',
        u: (safeTime * 1.5 + offset) % 1.0,
      };
    case 'speaking':
      // OUTWARD: heart -> ports -> external nodes
      return {
        direction: 'outgoing',
        u: (safeTime * (1.2 + safeMid * 2.0) + offset) % 1.0,
      };
    case 'success':
      // SYNC: synchronous pulse outward
      return {
        direction: 'sync',
        u: (safeTime * 2.0) % 1.0,
      };
    case 'idle':
    default:
      // HOVER: subtle hover near port
      return {
        direction: 'hover',
        u: 0.0,
      };
  }
}

/**
 * Clamps audio level safely within 0.0 .. 1.0.
 */
export function clampAudioLevel(val: number): number {
  if (!Number.isFinite(val)) return 0.0;
  return Math.max(0.0, Math.min(1.0, val));
}

/**
 * Delta-independent exponential smoothing.
 */
export function exponentialSmooth(current: number, target: number, speed: number, delta: number): number {
  if (!Number.isFinite(current)) current = target;
  if (!Number.isFinite(target)) return current;
  const factor = 1 - Math.exp(-Math.max(0, speed) * Math.max(0, delta));
  return current + (target - current) * factor;
}

/**
 * Maps bass audio frequency level to central singularity scale.
 */
export function mapBassToCoreScale(bassLevel: number, baseScale: number = 1.0, isSpeaking: boolean = false): number {
  const safeBass = clampAudioLevel(bassLevel);
  const audioAmp = isSpeaking ? safeBass * 0.18 : safeBass * 0.08;
  return Math.max(0.8, Math.min(1.4, baseScale + audioAmp));
}

/**
 * Maps mid audio frequency level to turbine rotation speed.
 */
export function mapMidToTurbineSpeed(midLevel: number, baseSpeed: number = 1.0): number {
  const safeMid = clampAudioLevel(midLevel);
  return Math.max(0.2, Math.min(3.5, baseSpeed * (1.0 + safeMid * 1.8)));
}

/**
 * Maps treble audio frequency level to plasma filaments and spark discharge.
 */
export function mapTrebleToFilamentIntensity(trebleLevel: number, baseIntensity: number = 1.0): number {
  const safeTreble = clampAudioLevel(trebleLevel);
  return Math.max(0.1, Math.min(3.0, baseIntensity * (1.0 + safeTreble * 2.2)));
}

/**
 * Resolves visual targets based on current state, audio levels, and power/speed modifiers.
 */
export function computeReactorVisualTargets(
  state: string,
  power: number = 1.0,
  speed: number = 1.0,
  audio: AudioBands = { bass: 0, mid: 0, treble: 0, total: 0 },
  intensityProp?: number
): ReactorVisualTargets {
  const safePower = Number.isFinite(power) ? Math.max(0.2, Math.min(3.0, power)) : 1.0;
  const safeSpeed = Number.isFinite(speed) ? Math.max(0.2, Math.min(3.0, speed)) : 1.0;
  const safeIntensityProp = Number.isFinite(intensityProp) ? Math.max(0.0, Math.min(2.0, intensityProp!)) : 1.0;

  const bass = clampAudioLevel(audio.bass);
  const mid = clampAudioLevel(audio.mid);
  const treble = clampAudioLevel(audio.treble);
  const totalAudio = clampAudioLevel(audio.total);

  let coreIntensity = 0.6;
  let coreScale = 1.0;
  let ringIntensity = 0.5;
  let ringSpeed = 1.0;
  let particleIntensity = 0.4;
  let signalIntensity = 0.3;
  let bloomStrength = 0.35;
  let frameActivity = 0.2;

  switch (state) {
    case 'idle':
      coreIntensity = 0.7 * safePower;
      coreScale = 1.0;
      ringIntensity = 0.4 * safePower;
      ringSpeed = 0.8 * safeSpeed;
      particleIntensity = 0.35;
      signalIntensity = 0.2;
      bloomStrength = 0.35 * safePower;
      frameActivity = 0.2;
      break;

    case 'listening': {
      const listenPulse = totalAudio < 0.05 ? Math.sin(Date.now() / 300) * 0.05 : 0;
      coreIntensity = (0.9 + bass * 0.8 + mid * 0.4 + Math.abs(listenPulse)) * safePower;
      coreScale = 1.0;
      ringIntensity = (0.9 + mid * 0.6) * safePower;
      ringSpeed = (1.5 + mid * 0.8) * safeSpeed;
      particleIntensity = 0.8 + treble * 0.6;
      signalIntensity = 0.8 + bass * 0.6;
      bloomStrength = (0.42 + (bass * 0.6 + mid * 0.3) * 0.4) * safePower;
      frameActivity = 0.9;
      break;
    }

    case 'processing':
    case 'loading_whisper':
    case 'loading_llm':
    case 'route_generation':
      coreIntensity = 1.5 * safePower;
      coreScale = 1.0;
      ringIntensity = 1.2 * safePower;
      ringSpeed = 3.0 * safeSpeed;
      particleIntensity = 1.0;
      signalIntensity = 1.2;
      bloomStrength = 0.6 * safePower;
      frameActivity = 1.5;
      break;

    case 'speaking': {
      const spkPulse = totalAudio < 0.05 ? Math.sin(Date.now() / 150) * 0.15 : 0;
      const spkMid = totalAudio < 0.05 ? 0.3 + Math.sin(Date.now() / 200) * 0.2 : mid;
      
      coreIntensity = (1.0 + totalAudio * 2.5 + Math.abs(spkPulse)) * safePower;
      coreScale = 1.0;
      ringIntensity = (1.2 + spkMid * 1.5) * safePower;
      ringSpeed = (1.5 + spkMid * 1.5) * safeSpeed;
      particleIntensity = (0.7 + treble * 0.8);
      signalIntensity = (0.7 + spkMid * 0.8);
      bloomStrength = (0.4 + (totalAudio + Math.abs(spkPulse)) * 0.5) * safePower;
      frameActivity = 1.0;
      break;
    }

    case 'success':
      coreIntensity = 1.2 * safePower;
      coreScale = 1.0;
      ringIntensity = 1.0 * safePower;
      ringSpeed = 0.6 * safeSpeed;
      particleIntensity = 0.7;
      signalIntensity = 0.9;
      bloomStrength = 0.5 * safePower;
      frameActivity = 0.8;
      break;

    case 'alert':
    case 'rollback_in_progress':
      coreIntensity = 1.2 * safePower;
      coreScale = 1.0;
      ringIntensity = 1.1 * safePower;
      ringSpeed = 1.5 * safeSpeed;
      particleIntensity = 0.9;
      signalIntensity = 0.9;
      bloomStrength = 0.52 * safePower;
      frameActivity = 1.1;
      break;

    default:
      coreIntensity = 0.6 * safePower;
      coreScale = 1.0;
      ringIntensity = 0.7 * safePower;
      ringSpeed = 1.0 * safeSpeed;
      particleIntensity = 0.5;
      signalIntensity = 0.4;
      bloomStrength = 0.45 * safePower;
      frameActivity = 0.4;
      break;
  }

  // Multiply with intensityProp
  coreIntensity *= safeIntensityProp;
  ringIntensity *= safeIntensityProp;
  particleIntensity *= safeIntensityProp;
  signalIntensity *= safeIntensityProp;

  return {
    coreIntensity,
    coreScale,
    ringIntensity,
    ringSpeed,
    particleIntensity,
    signalIntensity,
    bloomStrength,
    frameActivity,
  };
}

/**
 * Returns particle and item counts for quality profiles.
 */
export function getQualityParticleCount(quality: string) {
  switch (quality) {
    case 'Low':
      return {
        sparkCount: 8,
        dustCount: 25,
        quantumBitsCount: 16,
        motesCount: 14,
        radialDetail: 32,
      };
    case 'Medium':
      return {
        sparkCount: 16,
        dustCount: 60,
        quantumBitsCount: 36,
        motesCount: 30,
        radialDetail: 64,
      };
    case 'High':
    default:
      return {
        sparkCount: 28,
        dustCount: 100,
        quantumBitsCount: 60,
        motesCount: 50,
        radialDetail: 128,
      };
  }
}

