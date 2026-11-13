import { describe, it, expect } from 'vitest';
import {
  computeLoadDrivenSpeed,
  computeRamGlowPulse,
  computeRunnerSpeedMultiplier,
  checkOverloadState,
  computeRunnerEnergyFlow,
  MAX_RUNNER_SPEED_MULT
} from './reactorMetrics';

describe('reactorMetrics Unit Tests', () => {
  describe('computeLoadDrivenSpeed', () => {
    it('should return base speed when CPU load is 0%', () => {
      expect(computeLoadDrivenSpeed(0, 1.0)).toBe(1.0);
    });

    it('should scale speed linearly to 1.5x at 50% CPU load', () => {
      expect(computeLoadDrivenSpeed(50, 1.0)).toBe(1.5);
    });

    it('should scale speed linearly to 2.0x at 100% CPU load', () => {
      expect(computeLoadDrivenSpeed(100, 1.0)).toBe(2.0);
    });

    it('should clamp values below 0% and above 100% CPU load', () => {
      expect(computeLoadDrivenSpeed(-20, 1.0)).toBe(1.0);
      expect(computeLoadDrivenSpeed(150, 1.0)).toBe(2.0);
    });

    it('should scale with custom base speed correctly', () => {
      expect(computeLoadDrivenSpeed(50, 2.0)).toBe(3.0);
    });
  });

  describe('computeRamGlowPulse', () => {
    it('should return base pulse when RAM memory usage is 0%', () => {
      expect(computeRamGlowPulse(0, 1.0)).toBe(1.0);
    });

    it('should scale glow pulse to 1.4x at 50% RAM usage', () => {
      expect(computeRamGlowPulse(50, 1.0)).toBe(1.4);
    });

    it('should scale glow pulse to 1.8x at 100% RAM usage', () => {
      expect(computeRamGlowPulse(100, 1.0)).toBe(1.8);
    });

    it('should clamp out-of-bounds RAM values', () => {
      expect(computeRamGlowPulse(-10, 1.0)).toBe(1.0);
      expect(computeRamGlowPulse(200, 1.0)).toBe(1.8);
    });
  });

  describe('computeRunnerSpeedMultiplier', () => {
    it('should return 1.0 when RAM pulse multiplier is 1.0 and audio level is 0', () => {
      expect(computeRunnerSpeedMultiplier(1.0, 0)).toBe(1.0);
    });

    it('should smoothly increase runner speed when RAM usage increases (pulse mult = 1.8)', () => {
      // ramFactor = 1.0 + (1.8 - 1.0) * 0.5 = 1.4
      expect(computeRunnerSpeedMultiplier(1.8, 0)).toBeCloseTo(1.4);
    });

    it('should combine RAM pulse mult and audio level smoothly', () => {
      // ramFactor = 1.2 (RAM ~25%), audioFactor = 2.0 (audio 0.5) => 2.4
      expect(computeRunnerSpeedMultiplier(1.4, 0.5)).toBeCloseTo(2.4);
    });

    it(`should cap total speed multiplier at MAX_RUNNER_SPEED_MULT (${MAX_RUNNER_SPEED_MULT}) when both RAM and audio are maxed out`, () => {
      // Uncapped raw value would be 1.5 * 3.0 = 4.5
      const maxSpeed = computeRunnerSpeedMultiplier(2.0, 1.0);
      expect(maxSpeed).toBe(MAX_RUNNER_SPEED_MULT);
    });

    it('should be non-decreasing monotonic when ramPulseMult increases at fixed audioLevel', () => {
      const fixedAudioLevels = [0.0, 0.3, 0.7, 1.0];
      for (const audio of fixedAudioLevels) {
        let prev = computeRunnerSpeedMultiplier(0.8, audio);
        for (let ram = 0.8; ram <= 2.2; ram += 0.1) {
          const curr = computeRunnerSpeedMultiplier(ram, audio);
          expect(curr).toBeGreaterThanOrEqual(prev);
          expect(curr).toBeLessThanOrEqual(MAX_RUNNER_SPEED_MULT);
          prev = curr;
        }
      }
    });

    it('should be non-decreasing monotonic when audioLevel increases at fixed ramPulseMult', () => {
      const fixedRamMults = [0.8, 1.0, 1.4, 1.8, 2.0];
      for (const ram of fixedRamMults) {
        let prev = computeRunnerSpeedMultiplier(ram, 0.0);
        for (let audio = 0.0; audio <= 1.2; audio += 0.1) {
          const curr = computeRunnerSpeedMultiplier(ram, audio);
          expect(curr).toBeGreaterThanOrEqual(prev);
          expect(curr).toBeLessThanOrEqual(MAX_RUNNER_SPEED_MULT);
          prev = curr;
        }
      }
    });

    it('should handle clamp boundary values correctly', () => {
      // Lower boundary clamps
      expect(computeRunnerSpeedMultiplier(0.8, 0.0)).toBeCloseTo(0.9);
      expect(computeRunnerSpeedMultiplier(0.0, 0.0)).toBeCloseTo(0.9); // Clamped to safeRamMult = 0.8 => 0.9
      expect(computeRunnerSpeedMultiplier(1.0, 0.0)).toBe(1.0); // Base value
      // Upper boundary clamps and cap
      expect(computeRunnerSpeedMultiplier(2.0, 0.0)).toBeCloseTo(1.5);
      expect(computeRunnerSpeedMultiplier(2.0, 1.0)).toBe(MAX_RUNNER_SPEED_MULT); // Capped at MAX_RUNNER_SPEED_MULT
    });

    it(`should saturate at MAX_RUNNER_SPEED_MULT (${MAX_RUNNER_SPEED_MULT}) and remain capped without dropping`, () => {
      expect(computeRunnerSpeedMultiplier(1.8, 0.8)).toBe(MAX_RUNNER_SPEED_MULT);
      expect(computeRunnerSpeedMultiplier(2.0, 1.0)).toBe(MAX_RUNNER_SPEED_MULT);
      expect(computeRunnerSpeedMultiplier(2.5, 1.5)).toBe(MAX_RUNNER_SPEED_MULT);
    });

    it('should handle boundary/NaN/Infinity inputs gracefully', () => {
      expect(computeRunnerSpeedMultiplier(NaN, NaN)).toBe(1.0);
      expect(computeRunnerSpeedMultiplier(Infinity, -Infinity)).toBe(1.0);
      expect(computeRunnerSpeedMultiplier(-5, -2)).toBeCloseTo(0.9);
    });
  });

  describe('checkOverloadState & Hysteresis', () => {
    it('should not enter overload mode when load is below 85%', () => {
      expect(checkOverloadState(84, 84, false)).toBe(false);
    });

    it('should enter overload mode when CPU >= 85%', () => {
      expect(checkOverloadState(85, 40, false)).toBe(true);
    });

    it('should enter overload mode when RAM >= 85%', () => {
      expect(checkOverloadState(30, 85, false)).toBe(true);
    });

    it('should maintain overload mode in boundary zone (e.g. 80%) to prevent flickering (hysteresis)', () => {
      // Once entered (currentlyOverloaded = true), 80% should remain true!
      expect(checkOverloadState(80, 80, true)).toBe(true);
      expect(checkOverloadState(76, 50, true)).toBe(true);
    });

    it('should exit overload mode only when BOTH CPU and RAM <= 75%', () => {
      expect(checkOverloadState(75, 75, true)).toBe(false);
      expect(checkOverloadState(70, 70, true)).toBe(false);
      // If one remains > 75%, should remain in overload mode
      expect(checkOverloadState(70, 76, true)).toBe(true);
    });
  });

  describe('computeRunnerEnergyFlow', () => {
    it('should return incoming direction for listening state', () => {
      const res = computeRunnerEnergyFlow('listening', 0, 0);
      expect(res.direction).toBe('incoming');
      expect(res.u).toBeGreaterThanOrEqual(0);
      expect(res.u).toBeLessThanOrEqual(1);
    });

    it('should return circular direction for processing state', () => {
      const res = computeRunnerEnergyFlow('processing', 0.5, 1);
      expect(res.direction).toBe('circular');
      expect(res.u).toBeGreaterThanOrEqual(0);
      expect(res.u).toBeLessThanOrEqual(1);
    });

    it('should return outgoing direction for speaking state', () => {
      const res = computeRunnerEnergyFlow('speaking', 1.0, 2, 0.5);
      expect(res.direction).toBe('outgoing');
      expect(res.u).toBeGreaterThanOrEqual(0);
      expect(res.u).toBeLessThanOrEqual(1);
    });

    it('should return sync direction for success state', () => {
      const res = computeRunnerEnergyFlow('success', 0.25, 0);
      expect(res.direction).toBe('sync');
    });

    it('should default to hover direction for idle or unknown state', () => {
      expect(computeRunnerEnergyFlow('idle', 0, 0).direction).toBe('hover');
      expect(computeRunnerEnergyFlow('unknown_state', 0, 0).direction).toBe('hover');
    });
  });
});
