import type { GraphicsPreset } from '../../../features/settings/logic/graphics-presets';

/**
 * Recommend Reactor graphics preset based on detected GPU VRAM in megabytes:
 * - null / undefined / NaN / <= 0 -> 'Medium'
 * - < 4096 -> 'Low'
 * - 4096 .. 8191 -> 'Medium'
 * - >= 8192 -> 'High'
 * Note: 'Ultra' and 'UltraPlus' are never auto-recommended; selected manually by the user.
 */
export function recommendGraphicsPreset(
  vramTotalMb: number | null | undefined
): Exclude<GraphicsPreset, 'Custom'> {
  if (vramTotalMb == null || Number.isNaN(vramTotalMb) || vramTotalMb <= 0) {
    return 'Medium';
  }
  if (vramTotalMb < 4096) {
    return 'Low';
  }
  if (vramTotalMb < 8192) {
    return 'Medium';
  }
  return 'High';
}

/**
 * UltraPlus preset is available only when detected VRAM is at least 12288 MB (12 GB).
 * When VRAM is unknown (null / undefined / NaN / <= 0) or < 12288, returns false.
 */
export function isUltraPlusAvailable(vramTotalMb: number | null | undefined): boolean {
  if (vramTotalMb == null || Number.isNaN(vramTotalMb) || vramTotalMb <= 0) {
    return false;
  }
  return vramTotalMb >= 12288;
}
