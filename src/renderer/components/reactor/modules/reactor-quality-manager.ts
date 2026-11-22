import * as THREE from 'three';
import {
  cloneGraphicsConfig,
  SHOWCASE_CONFIG_OVERRIDE,
  type GraphicsConfig,
} from '../../../features/settings/logic/graphics-presets';
import {
  detectGpuCapabilities,
  sanitizeConfigForCapabilities,
  type GpuCapabilities,
} from './reactor-gpu-capabilities';
import { ReactorTextureRegistry } from './reactor-texture-registry';
import { createReactorStudioEnvironment, type ReactorStudioEnvironment } from './reactor-environment';
import type { ReactorMaterials } from './reactor-materials';
import type { ReactorLighting } from './reactor-lighting';
import type { ReactorPostFX } from './reactor-postfx';

export interface AdaptiveRuntimeOverrides {
  renderScale?: number | null;
  disableAo?: boolean;
  bloomResolutionScale?: number | null;
  particleDensityCap?: number | null;
  disableVolumetricRays?: boolean;
  disableExtraLights?: boolean;
}

export interface GraphicsQualityManager {
  readonly capabilities: GpuCapabilities;
  readonly textureRegistry: ReactorTextureRegistry;
  applyBaseConfig: (rawConfig: GraphicsConfig) => void;
  setShowcaseOverride: (active: boolean) => void;
  setAdaptiveOverrides: (overrides: AdaptiveRuntimeOverrides) => void;
  getEffectiveConfig: () => GraphicsConfig;
  getEffectiveRenderScale: () => number;
  dispose: () => void;
}

export function createGraphicsQualityManager(params: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  materials: ReactorMaterials;
  lighting: ReactorLighting;
  postfx: ReactorPostFX;
  textureRegistry: ReactorTextureRegistry;
  initialConfig: GraphicsConfig;
  capabilities?: GpuCapabilities;
  onCapabilitiesDetected?: (caps: GpuCapabilities) => void;
}): GraphicsQualityManager {
  const { renderer, scene, materials, lighting, postfx, textureRegistry } = params;
  const capabilities = params.capabilities ?? detectGpuCapabilities(renderer);
  params.onCapabilitiesDetected?.(capabilities);

  const studioEnv: ReactorStudioEnvironment = createReactorStudioEnvironment(renderer, scene);

  let baseConfig: GraphicsConfig = cloneGraphicsConfig(params.initialConfig);
  let showcaseOverrideActive = false;
  let adaptiveOverrides: AdaptiveRuntimeOverrides = {};
  let effectiveConfig: GraphicsConfig = sanitizeConfigForCapabilities(baseConfig, capabilities);
  let disposed = false;

  const computeEffectiveConfig = (): GraphicsConfig => {
    const source = showcaseOverrideActive ? cloneGraphicsConfig(SHOWCASE_CONFIG_OVERRIDE) : baseConfig;
    const safe = sanitizeConfigForCapabilities(source, capabilities);

    if (adaptiveOverrides.disableAo) {
      safe.aoMode = 'off';
    }
    if (adaptiveOverrides.disableVolumetricRays) {
      safe.volumetricRays = false;
    }
    if (adaptiveOverrides.disableExtraLights && safe.dynamicPointLights === 'full') {
      safe.dynamicPointLights = 'standard';
    }
    if (
      typeof adaptiveOverrides.particleDensityCap === 'number' &&
      safe.particleDensity > adaptiveOverrides.particleDensityCap
    ) {
      safe.particleDensity = adaptiveOverrides.particleDensityCap as GraphicsConfig['particleDensity'];
    }
    return safe;
  };

  const applyAllSubsystems = () => {
    if (disposed) return;
    effectiveConfig = computeEffectiveConfig();

    // 1. Studio Softbox PMREM Environment (cached by pmremQuality)
    studioEnv.applyQuality(effectiveConfig.pmremQuality);

    // 2. Procedural PBR Texture Tier (chunked async upgrade, instant if cached)
    const targetTier = textureRegistry.mapRequestedResolutionToTier(effectiveConfig.textureResolution);
    const aniso = Math.min(effectiveConfig.anisotropy, capabilities.maxAnisotropy);
    textureRegistry.requestTier(targetTier, aniso, effectiveConfig.trilinearFiltering, (bundle) => {
      if (disposed) return;
      materials.applyPbrBundle(bundle);
    });
    textureRegistry.updateFiltering(aniso, effectiveConfig.trilinearFiltering);

    // 3. Materials, Studio Lighting & Shadows, PostFX
    materials.applyGraphicsConfig(effectiveConfig, capabilities);
    lighting.applyGraphicsConfig(effectiveConfig, renderer, capabilities);
    postfx.applyGraphicsConfig(effectiveConfig, capabilities);
    postfx.setAdaptiveOverrides({
      renderScale: adaptiveOverrides.renderScale ?? null,
      disableAo: Boolean(adaptiveOverrides.disableAo),
      bloomResolutionScale: adaptiveOverrides.bloomResolutionScale ?? null,
    });
  };

  applyAllSubsystems();

  const applyBaseConfig = (rawConfig: GraphicsConfig) => {
    baseConfig = cloneGraphicsConfig(rawConfig);
    applyAllSubsystems();
  };

  const setShowcaseOverride = (active: boolean) => {
    if (showcaseOverrideActive === active) return;
    showcaseOverrideActive = active;
    applyAllSubsystems();
  };

  const setAdaptiveOverrides = (overrides: AdaptiveRuntimeOverrides) => {
    adaptiveOverrides = { ...overrides };
    applyAllSubsystems();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    studioEnv.dispose();
  };

  return {
    capabilities,
    textureRegistry,
    applyBaseConfig,
    setShowcaseOverride,
    setAdaptiveOverrides,
    getEffectiveConfig: () => effectiveConfig,
    getEffectiveRenderScale: () => postfx.getEffectiveRenderScale(),
    dispose,
  };
}
