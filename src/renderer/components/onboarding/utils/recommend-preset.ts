import type { GraphicsPreset } from '../../../features/settings/logic/graphics-presets';

/**
 * Recommend permanent Reactor graphics preset based on detected GPU VRAM (MB):
 * - null / undefined / NaN / <= 0 -> 'Balanced'
 * - < 4096 -> 'Eco'
 * - 4096 .. 8191 -> 'Balanced'
 * - >= 8192 -> 'Cinematic'
 *
 * All 3 permanent profiles remain selectable by the user regardless of VRAM.
 */
export function recommendGraphicsPreset(
  vramTotalMb: number | null | undefined
): GraphicsPreset {
  if (vramTotalMb == null || Number.isNaN(vramTotalMb) || vramTotalMb <= 0) {
    return 'Balanced';
  }
  if (vramTotalMb < 4096) {
    return 'Eco';
  }
  if (vramTotalMb < 8192) {
    return 'Balanced';
  }
  return 'Cinematic';
}
