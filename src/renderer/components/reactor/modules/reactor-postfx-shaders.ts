import type { GpuCapabilities } from './reactor-gpu-capabilities';

/**
 * Subtle linear-HDR Color Grading & Optical Vignette shader (preserved contrast transform).
 * Contrast/dark-toe response is intentionally kept unchanged pending live A/B GPU captures.
 */
export const ColorGradingVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.04 },
    uSaturation: { value: 1.04 },
    uVignette: { value: 0.14 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Subtle filmic saturation & gentle midtone contrast in linear HDR without crushing darks
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = max(vec3(0.0), (col - vec3(0.02)) * uContrast + vec3(0.02));

      // Delicate optical edge vignette (applied gently to preserve transparent backdrop alpha)
      if (uVignette > 0.001) {
        vec2 centered = (vUv - 0.5) * 2.0;
        float distSq = dot(centered, centered);
        float vig = 1.0 - smoothstep(0.55, 1.85, distSq) * uVignette;
        col *= vig;
      }

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

/**
 * ARC-057 GTAO Poisson-denoise candidate configuration:
 * - radius reduced 5 -> 3 to curb 50%-resolution halo bleed on narrow machined bevels
 * - depthPhi strictly kept at 2 (higher depthPhi admits more samples across depth steps)
 * - normalPhi raised 3 -> 4.5 to strengthen normal-based edge rejection on chamfered planes
 */
export const GTAO_DENOISE_CONFIG = {
  lumaPhi: 10,
  depthPhi: 2,
  normalPhi: 4.5,
  radius: 3,
  samples: 8,
} as const;

export interface GtaoPassSettings {
  blendIntensity: number;
  gtaoMaterial: {
    radius: number;
    samples: number;
    distanceExponent: number;
    thickness: number;
    scale: number;
    distanceFallOff: number;
  };
}

export function resolveGtaoPassSettings(isFullGtao: boolean): GtaoPassSettings {
  return {
    blendIntensity: isFullGtao ? 0.52 : 0.30,
    gtaoMaterial: {
      radius: isFullGtao ? 0.56 : 0.44,
      samples: isFullGtao ? 14 : 8,
      distanceExponent: 1.6,
      thickness: 1.15,
      scale: 1.0,
      distanceFallOff: 0.9,
    },
  };
}

/**
 * Pure reference evaluator of GTAO Poisson-denoise bilateral edge weights:
 *   w_depth  = exp(-abs(depthDelta) / max(depthPhi, 1e-4))
 *   w_normal = pow(clamp(normalDot, 0, 1), normalPhi)
 * Used in synthetic depth-discontinuity & normal-step regression tests.
 */
export function evaluateBilateralDenoiseWeight(
  depthDelta: number,
  normalDot: number,
  depthPhi: number,
  normalPhi: number
): number {
  const safeDepthPhi = Math.max(1e-4, depthPhi);
  const wDepth = Math.exp(-Math.abs(depthDelta) / safeDepthPhi);
  const clampedDot = Math.max(0, Math.min(1, normalDot));
  const wNormal = Math.pow(clampedDot, Math.max(0, normalPhi));
  return wDepth * wNormal;
}

export function mapBloomRadius(uiRadius: number): number {
  const clamped = Math.max(0.2, Math.min(0.8, uiRadius));
  return 0.16 + ((clamped - 0.2) / 0.6) * 0.12;
}

/**
 * Avoids stacking post-tonemap FXAA blur on top of hardware 4x MSAA, while preserving
 * FXAA whenever resolved MSAA is < 4x (including Eco MSAA 0 and fallback WebGL GPUs).
 */
export function resolveEffectiveFxaa(fxaaEnabled: boolean, resolvedMsaaSamples: number): boolean {
  return Boolean(fxaaEnabled) && resolvedMsaaSamples < 4;
}

const INTEGRATED_GPU_PATTERN = /intel|uhd|iris|hd graphics|vega\s*\d|radeon\s*\(tm\)\s*graphics|adreno|mali/i;

/**
 * Performance-safe automatic DPR cap.
 * Preserves 1.25 default cap across all GPUs (protecting integrated GPUs and office-minimum hardware).
 * Higher DPR (up to 1.5) is permitted ONLY when live performance headroom is explicitly confirmed
 * on a capable non-integrated hardware WebGL2 GPU.
 */
export function resolveAutoDprCap(
  winDpr: number,
  caps: GpuCapabilities,
  headroomConfirmed = false
): number {
  const safeWinDpr = Math.max(1, winDpr || 1);
  if (
    headroomConfirmed &&
    !caps.isSoftwareGl &&
    caps.isWebGL2 &&
    caps.supportsHalfFloatColorBuffer &&
    !INTEGRATED_GPU_PATTERN.test(caps.rendererName)
  ) {
    return Math.min(safeWinDpr, 1.5);
  }
  return Math.min(safeWinDpr, 1.25);
}
