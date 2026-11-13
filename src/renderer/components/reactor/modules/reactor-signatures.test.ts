import { describe, it, expect } from 'vitest';
import {
  STATE_SIGNATURES,
  resolveSignatureForState,
  createDefaultSignature,
  lerpSignature,
} from './reactor-signatures';

describe('Reactor State Signatures', () => {
  it('should have correct signature definitions for all core states', () => {
    expect(STATE_SIGNATURES.idle).toBeDefined();
    expect(STATE_SIGNATURES.listening).toBeDefined();
    expect(STATE_SIGNATURES.processing).toBeDefined();
    expect(STATE_SIGNATURES.speaking).toBeDefined();
    expect(STATE_SIGNATURES.alert).toBeDefined();

    // Listening must flow inward (-1) and pull dust towards center
    expect(STATE_SIGNATURES.listening.runnerDirection).toBe(-1);
    expect(STATE_SIGNATURES.listening.dustDriftVector.pullTowardsCenter).toBe(true);

    // Processing must have max turbine RPM (3.0) and irregular search rhythm
    expect(STATE_SIGNATURES.processing.turbineRPM).toBe(3.0);
    expect(STATE_SIGNATURES.processing.pulsePattern).toBe('irregular');

    // Speaking must have audio reactive pattern and outward flow
    expect(STATE_SIGNATURES.speaking.runnerDirection).toBe(1);
    expect(STATE_SIGNATURES.speaking.pulsePattern).toBe('audio_reactive');

    // Alert / Error must have high core jitter
    expect(STATE_SIGNATURES.alert.coreJitter).toBeGreaterThan(0.5);
  });

  it('should resolve signature correctly for state aliases', () => {
    expect(resolveSignatureForState('idle').glowIntensity).toBe(STATE_SIGNATURES.idle.glowIntensity);
    expect(resolveSignatureForState('listening').glowIntensity).toBe(STATE_SIGNATURES.listening.glowIntensity);
    expect(resolveSignatureForState('processing').glowIntensity).toBe(STATE_SIGNATURES.processing.glowIntensity);
    expect(resolveSignatureForState('route_generation').glowIntensity).toBe(STATE_SIGNATURES.processing.glowIntensity);
    expect(resolveSignatureForState('speaking').glowIntensity).toBe(STATE_SIGNATURES.speaking.glowIntensity);
    expect(resolveSignatureForState('alert').glowIntensity).toBe(STATE_SIGNATURES.alert.glowIntensity);
    expect(resolveSignatureForState('error').glowIntensity).toBe(STATE_SIGNATURES.alert.glowIntensity);
    expect(resolveSignatureForState('success').glowIntensity).toBe(STATE_SIGNATURES.success.glowIntensity);
  });

  it('should smoothly interpolate vector using exponential lerp', () => {
    const current = createDefaultSignature();
    const target = STATE_SIGNATURES.processing;

    expect(current.turbineRPM).toBeCloseTo(0.35, 2);
    // Step 0.1s
    lerpSignature(current, target, 0.1, false);
    expect(current.turbineRPM).toBeGreaterThan(0.35);
    expect(current.turbineRPM).toBeLessThan(3.0);

    // After many steps, reaches target
    for (let i = 0; i < 20; i++) {
      lerpSignature(current, target, 0.1, false);
    }
    expect(current.turbineRPM).toBeCloseTo(3.0, 1);
  });

  it('should interpolate near-instantaneously (≤ 100ms) for error state', () => {
    const current = createDefaultSignature();
    const errorTarget = STATE_SIGNATURES.alert;

    // Single 0.08s step with isInstant=true
    lerpSignature(current, errorTarget, 0.08, true);
    // With tau=0.02, 1 - exp(-0.08/0.02) = 1 - exp(-4) = 0.9817 (98% completion in 80ms)
    expect(current.coreJitter).toBeGreaterThan(0.8);
  });

  it('should enforce hue-invariance across all states (Theme Matrix Test)', () => {
    // Ensuring that no color or hue values exist in any signature.
    // The theme color is solely dictated by reactor-theme.ts, and signatures
    // ONLY contain scalar brightness/kinematics.
    for (const stateKey in STATE_SIGNATURES) {
      const sig = STATE_SIGNATURES[stateKey as keyof typeof STATE_SIGNATURES];
      expect((sig as any).paletteColorHex).toBeUndefined();
      expect((sig as any).hex).toBeUndefined();
      expect((sig as any).color).toBeUndefined();
      expect((sig as any).hue).toBeUndefined();
    }
  });

  it('should verify pairwise vectors are distinct by >= 2x on >= 2 channels with zoneFocus & patterns', () => {
    const coreStates = ['idle', 'listening', 'processing', 'speaking', 'alert'] as const;

    for (let i = 0; i < coreStates.length; i++) {
      for (let j = i + 1; j < coreStates.length; j++) {
        const s1 = STATE_SIGNATURES[coreStates[i]];
        const s2 = STATE_SIGNATURES[coreStates[j]];

        const scalarPairs: [number, number][] = [
          [s1.glowIntensity, s2.glowIntensity],
          [s1.runnerSpeed, s2.runnerSpeed],
          [s1.particleEmission, s2.particleEmission],
          [s1.turbineRPM, s2.turbineRPM],
          [s1.pulseRate, s2.pulseRate],
          [s1.bloomBias, s2.bloomBias],
          [s1.apertureOpen, s2.apertureOpen],
          [s1.zoneFocus.core, s2.zoneFocus.core],
          [s1.zoneFocus.lattice, s2.zoneFocus.lattice],
          [s1.zoneFocus.trench, s2.zoneFocus.trench],
          [s1.zoneFocus.rings, s2.zoneFocus.rings],
          [s1.zoneFocus.particles, s2.zoneFocus.particles],
        ];

        const twoXDiffChannels = scalarPairs.filter(([v1, v2]) => {
          const min = Math.min(v1, v2);
          const max = Math.max(v1, v2);
          return min > 0 ? (max / min >= 1.99) : max >= 0.5;
        });

        expect(twoXDiffChannels.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
