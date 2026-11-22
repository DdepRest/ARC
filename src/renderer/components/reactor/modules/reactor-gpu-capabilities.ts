import * as THREE from 'three';
import {
  cloneGraphicsConfig,
  type GraphicsConfig,
  type GraphicsTextureResolution,
} from '../../../features/settings/logic/graphics-presets';

export interface GpuCapabilities {
  isWebGL2: boolean;
  maxTextureSize: number;
  maxAnisotropy: number;
  maxSamples: number;
  supportsHalfFloatColorBuffer: boolean;
  supportsDisjointTimerQuery: boolean;
  supportsShadows: boolean;
  vendor: string;
  rendererName: string;
  isSoftwareGl: boolean;
}

const SOFTWARE_GL_PATTERN = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|angle.*warp/i;

export function detectGpuCapabilities(renderer: THREE.WebGLRenderer): GpuCapabilities {
  const gl = renderer.getContext();
  const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);

  let vendor = 'unknown-vendor';
  let rendererName = 'unknown-renderer';

  try {
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo && gl) {
      vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || vendor);
      rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || rendererName);
    } else if (gl) {
      vendor = String(gl.getParameter(gl.VENDOR) || vendor);
      rendererName = String(gl.getParameter(gl.RENDERER) || rendererName);
    }
  } catch {
    // Keep defaults if extension is restricted
  }

  const isSoftwareGl = SOFTWARE_GL_PATTERN.test(`${vendor} ${rendererName}`);

  const maxTextureSize = Math.max(512, renderer.capabilities?.maxTextureSize || 2048);
  const maxAnisotropy = Math.max(1, Math.min(16, renderer.capabilities?.getMaxAnisotropy?.() || 1));
  const rawMaxSamples = isWebGL2 ? (renderer.capabilities?.maxSamples || 0) : 0;
  // Cap hardware MSAA at 4x (optimal fillrate/quality balance on WebGL2 HalfFloat)
  const maxSamples = isSoftwareGl ? 0 : Math.min(4, Math.max(0, rawMaxSamples));

  let supportsHalfFloatColorBuffer = false;
  let supportsDisjointTimerQuery = false;
  try {
    if (gl && isWebGL2) {
      supportsHalfFloatColorBuffer = Boolean(
        gl.getExtension('EXT_color_buffer_half_float') ||
        gl.getExtension('EXT_color_buffer_float')
      );
      supportsDisjointTimerQuery = Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2'));
    } else if (gl) {
      supportsHalfFloatColorBuffer = Boolean(gl.getExtension('EXT_color_buffer_half_float'));
    }
  } catch {
    supportsHalfFloatColorBuffer = false;
    supportsDisjointTimerQuery = false;
  }

  const supportsShadows = !isSoftwareGl && maxTextureSize >= 1024;

  return {
    isWebGL2,
    maxTextureSize,
    maxAnisotropy,
    maxSamples,
    supportsHalfFloatColorBuffer,
    supportsDisjointTimerQuery,
    supportsShadows,
    vendor,
    rendererName,
    isSoftwareGl,
  };
}

function clampTextureRes(requested: GraphicsTextureResolution, maxCap: number): GraphicsTextureResolution {
  const tiers: GraphicsTextureResolution[] = [256, 512, 1024, 2048];
  let best: GraphicsTextureResolution = 256;
  for (const t of tiers) {
    if (t <= requested && t <= maxCap) {
      best = t;
    }
  }
  return best;
}

/**
 * Produces a runtime-safe GraphicsConfig clamped strictly to detected WebGL2/GPU capabilities.
 * Never mutates the input config.
 */
export function sanitizeConfigForCapabilities(
  config: GraphicsConfig,
  caps: GpuCapabilities
): GraphicsConfig {
  const safe = cloneGraphicsConfig(config);

  // MSAA clamping
  if (!caps.isWebGL2 || caps.maxSamples <= 0 || caps.isSoftwareGl) {
    safe.msaaSamples = 0;
  } else if (safe.msaaSamples > caps.maxSamples) {
    safe.msaaSamples = caps.maxSamples >= 4 ? 4 : caps.maxSamples >= 2 ? 2 : 0;
  }

  // Anisotropy clamping
  const allowedAniso: Array<1 | 2 | 4 | 8 | 16> = [1, 2, 4, 8, 16];
  let clampedAniso: 1 | 2 | 4 | 8 | 16 = 1;
  for (const a of allowedAniso) {
    if (a <= safe.anisotropy && a <= caps.maxAnisotropy) clampedAniso = a;
  }
  safe.anisotropy = clampedAniso;

  // Texture resolution clamping
  const maxTexTier = caps.isSoftwareGl ? Math.min(512, caps.maxTextureSize) : caps.maxTextureSize;
  safe.textureResolution = clampTextureRes(safe.textureResolution, maxTexTier);

  // HalfFloat fallback
  if (safe.colorBufferPrecision === 'halfFloat' && !caps.supportsHalfFloatColorBuffer) {
    safe.colorBufferPrecision = 'unsignedByte';
  }

  // Software WebGL protection: avoid heavy fullscreen AO / shadows / DOF stalls
  if (caps.isSoftwareGl || !caps.supportsShadows) {
    safe.shadowQuality = 'off';
  }
  if (caps.isSoftwareGl) {
    safe.aoMode = 'off';
    safe.dofEnabled = false;
    safe.volumetricRays = false;
    if (safe.renderScale > 1.0) safe.renderScale = 1.0;
    if (safe.targetDpr !== 1.0) safe.targetDpr = 1.0;
  }

  return safe;
}
