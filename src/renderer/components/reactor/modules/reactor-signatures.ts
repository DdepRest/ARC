import * as THREE from 'three';
import type { ReactorState } from '../../../../shared/types/ui';

export type PulsePattern = 'regular' | 'irregular' | 'audio_reactive';


export interface DustDriftVector {
  x: number;
  y: number;
  z: number;
  pullTowardsCenter: boolean;
}

export interface ZoneFocusMultipliers {
  core: number;
  lattice: number;
  trench: number;
  rings: number;
  particles: number;
}

export interface ReactorSignatureVector {
  glowIntensity: number;
  runnerSpeed: number;
  runnerDirection: number; // 1 = outward, -1 = inward
  particleEmission: number;
  dustDriftVector: DustDriftVector;
  turbineRPM: number;
  pulseRate: number; // in Hz
  pulsePattern: PulsePattern;
  dataNodesActivity: number; // 0..1
  bloomBias: number;
  coreJitter: number; // 0..1
  apertureOpen: number; // 0..1
  zoneFocus: ZoneFocusMultipliers;
}

export const STATE_SIGNATURES: Record<string, ReactorSignatureVector> = {
  idle: {
    glowIntensity: 0.5,
    zoneFocus: { core: 0.4, lattice: 0.10, trench: 0.3, rings: 0.3, particles: 0.5 },
    runnerSpeed: 0.25,
    runnerDirection: 1,
    particleEmission: 0.25,
    dustDriftVector: { x: 0.02, y: 0.03, z: 0.01, pullTowardsCenter: false },
    turbineRPM: 0.35,
    pulseRate: 0.1, // Breathing ~0.1 Hz
    pulsePattern: 'regular',
    dataNodesActivity: 0.05,
    bloomBias: 0.8,
    coreJitter: 0.0,
    apertureOpen: 0.4,
  },
  listening: {
    glowIntensity: 0.8,
    zoneFocus: { core: 0.8, lattice: 1.0, trench: 0.4, rings: 0.25, particles: 0.3 },
    runnerSpeed: 0.8,
    runnerDirection: -1, // INWARD conduit flow
    particleEmission: 0.45,
    dustDriftVector: { x: 0.0, y: 0.0, z: -0.25, pullTowardsCenter: true }, // Inward gravitational pull
    turbineRPM: 0.6,
    pulseRate: 0.8,
    pulsePattern: 'regular',
    dataNodesActivity: 0.15,
    bloomBias: 1.15,
    coreJitter: 0.0,
    apertureOpen: 0.85, // Lenses opened wide
  },
  processing: {
    glowIntensity: 1.2,
    zoneFocus: { core: 1.0, lattice: 0.20, trench: 1.2, rings: 1.0, particles: 0.8 },
    runnerSpeed: 2.2,
    runnerDirection: 1,
    particleEmission: 0.95,
    dustDriftVector: { x: 0.15, y: 0.2, z: 0.05, pullTowardsCenter: false },
    turbineRPM: 3.0, // MAX RPM
    pulseRate: 1.8,
    pulsePattern: 'irregular', // Search rhythm
    dataNodesActivity: 1.0, // Neuro-firing active
    bloomBias: 1.5,
    coreJitter: 0.0,
    apertureOpen: 1.0,
  },
  speaking: {
    glowIntensity: 1.0,
    zoneFocus: { core: 0.9, lattice: 0.15, trench: 0.8, rings: 1.0, particles: 1.8 },
    runnerSpeed: 1.2, // Accelerated by mid frequencies
    runnerDirection: 1, // OUTWARD energy propagation
    particleEmission: 1.25,
    dustDriftVector: { x: 0.05, y: 0.08, z: 0.15, pullTowardsCenter: false },
    turbineRPM: 1.0,
    pulseRate: 1.0,
    pulsePattern: 'audio_reactive', // Strictly driven by speech spectrum
    dataNodesActivity: 0.3,
    bloomBias: 1.25,
    coreJitter: 0.0,
    apertureOpen: 1.3,
  },
  alert: {
    glowIntensity: 1.6,
    zoneFocus: { core: 1.5, lattice: 1.0, trench: 1.5, rings: 1.5, particles: 1.0 },
    runnerSpeed: 0.1,
    runnerDirection: 1,
    particleEmission: 0.08,
    dustDriftVector: { x: 0.08, y: -0.05, z: 0.0, pullTowardsCenter: false },
    turbineRPM: 0.15,
    pulseRate: 6.0,
    pulsePattern: 'irregular',
    dataNodesActivity: 0.0,
    bloomBias: 1.8,
    coreJitter: 0.85, // High frequency micro jitter
    apertureOpen: 0.2,
  },
  error: {
    glowIntensity: 1.6,
    zoneFocus: { core: 1.5, lattice: 1.0, trench: 1.5, rings: 1.5, particles: 1.0 },
    runnerSpeed: 0.1,
    runnerDirection: 1,
    particleEmission: 0.08,
    dustDriftVector: { x: 0.08, y: -0.05, z: 0.0, pullTowardsCenter: false },
    turbineRPM: 0.15,
    pulseRate: 6.0,
    pulsePattern: 'irregular',
    dataNodesActivity: 0.0,
    bloomBias: 1.8,
    coreJitter: 0.85,
    apertureOpen: 0.2,
  },
  success: {
    glowIntensity: 2.0,
    zoneFocus: { core: 1.2, lattice: 0.5, trench: 1.0, rings: 1.2, particles: 0.8 },
    runnerSpeed: 1.5,
    runnerDirection: 1,
    particleEmission: 0.8,
    dustDriftVector: { x: 0.0, y: 0.05, z: 0.05, pullTowardsCenter: false },
    turbineRPM: 1.0,
    pulseRate: 0.5,
    pulsePattern: 'regular',
    dataNodesActivity: 0.8,
    bloomBias: 1.6,
    coreJitter: 0.0,
    apertureOpen: 1.0,
  }
};

export function resolveSignatureForState(state: string | ReactorState): ReactorSignatureVector {
  const normalized = (state || 'idle').toLowerCase();
  if (normalized === 'listening') return STATE_SIGNATURES.listening;
  if (
    normalized === 'processing' ||
    normalized === 'route_generation' ||
    normalized === 'loading_llm' ||
    normalized === 'loading_whisper' ||
    normalized === 'rollback_in_progress'
  ) {
    return STATE_SIGNATURES.processing;
  }
  if (normalized === 'speaking') return STATE_SIGNATURES.speaking;
  if (normalized === 'alert' || normalized === 'error') return STATE_SIGNATURES.alert;
  if (normalized === 'success') return STATE_SIGNATURES.success;
  return STATE_SIGNATURES.idle;
}

export function createDefaultSignature(): ReactorSignatureVector {
  return {
    glowIntensity: STATE_SIGNATURES.idle.glowIntensity,
    runnerSpeed: STATE_SIGNATURES.idle.runnerSpeed,
    runnerDirection: STATE_SIGNATURES.idle.runnerDirection,
    particleEmission: STATE_SIGNATURES.idle.particleEmission,
    dustDriftVector: { ...STATE_SIGNATURES.idle.dustDriftVector },
    turbineRPM: STATE_SIGNATURES.idle.turbineRPM,
    pulseRate: STATE_SIGNATURES.idle.pulseRate,
    pulsePattern: STATE_SIGNATURES.idle.pulsePattern,
    dataNodesActivity: STATE_SIGNATURES.idle.dataNodesActivity,
    bloomBias: STATE_SIGNATURES.idle.bloomBias,
    coreJitter: STATE_SIGNATURES.idle.coreJitter,
    apertureOpen: STATE_SIGNATURES.idle.apertureOpen,
    zoneFocus: { ...STATE_SIGNATURES.idle.zoneFocus },
  };
}

/**
 * Exponential lerp for smooth continuous vector interpolation:
 * current = lerp(current, target, 1 - exp(-dt / tau))
 * Normal tau ≈ 0.15s (crossfade ~0.45s).
 * Instant (e.g. ERROR) tau ≈ 0.02s (≤ 60-100ms).
 */
export function lerpSignature(
  current: ReactorSignatureVector,
  target: ReactorSignatureVector,
  dt: number,
  isInstant: boolean = false
): void {
  const tau = isInstant ? 0.02 : 0.15;
  const factor = 1.0 - Math.exp(-Math.max(0, dt) / tau);

  // Scalar lerp
  current.glowIntensity += (target.glowIntensity - current.glowIntensity) * factor;
  current.runnerSpeed += (target.runnerSpeed - current.runnerSpeed) * factor;
  current.runnerDirection += (target.runnerDirection - current.runnerDirection) * factor;
  current.particleEmission += (target.particleEmission - current.particleEmission) * factor;
  current.turbineRPM += (target.turbineRPM - current.turbineRPM) * factor;
  current.pulseRate += (target.pulseRate - current.pulseRate) * factor;
  current.dataNodesActivity += (target.dataNodesActivity - current.dataNodesActivity) * factor;
  current.bloomBias += (target.bloomBias - current.bloomBias) * factor;
  current.coreJitter += (target.coreJitter - current.coreJitter) * factor;
  current.apertureOpen += (target.apertureOpen - current.apertureOpen) * factor;

  current.zoneFocus.core += (target.zoneFocus.core - current.zoneFocus.core) * factor;
  current.zoneFocus.lattice += (target.zoneFocus.lattice - current.zoneFocus.lattice) * factor;
  current.zoneFocus.trench += (target.zoneFocus.trench - current.zoneFocus.trench) * factor;
  current.zoneFocus.rings += (target.zoneFocus.rings - current.zoneFocus.rings) * factor;
  current.zoneFocus.particles += (target.zoneFocus.particles - current.zoneFocus.particles) * factor;

  // Dust drift vector
  current.dustDriftVector.x += (target.dustDriftVector.x - current.dustDriftVector.x) * factor;
  current.dustDriftVector.y += (target.dustDriftVector.y - current.dustDriftVector.y) * factor;
  current.dustDriftVector.z += (target.dustDriftVector.z - current.dustDriftVector.z) * factor;
  current.dustDriftVector.pullTowardsCenter = target.dustDriftVector.pullTowardsCenter;

  // Pulse pattern snaps to target
  current.pulsePattern = target.pulsePattern;
}

