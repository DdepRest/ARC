import * as THREE from 'three';
import type { GraphicsConfig } from '../../../features/settings/logic/graphics-presets';
import type { GpuCapabilities } from './reactor-gpu-capabilities';

export interface ReactorLighting {
  hemiLight: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  topSpot: THREE.DirectionalLight;
  rimLight: THREE.PointLight;
  coreLight: THREE.PointLight;
  innerChamberLight: THREE.PointLight;
  trenchLights: THREE.PointLight[];
  applyGraphicsConfig: (
    config: GraphicsConfig,
    renderer: THREE.WebGLRenderer,
    caps?: GpuCapabilities | null
  ) => void;
}

/**
 * Single source of truth for studio lighting colors, grazing positions, and tier intensities.
 * Both `createReactorLighting()` and `applyGraphicsConfig()` read from this table so initial
 * bootstrap intensities and runtime tier switches never diverge.
 */
export const STUDIO_LIGHT_PRESETS = {
  hemi: {
    skyColor: 0xd8dee8,
    groundColor: 0x131720,
    intensity: { eco: 0.38, standard: 0.43, shadowed: 0.45 },
  },
  key: {
    color: 0xfdfaf5,
    position: [-11.5, 13.5, 16.5] as const,
    intensity: { eco: 1.92, standard: 2.22, shadowed: 2.38 },
  },
  fill: {
    color: 0xd8dde6,
    position: [13.0, -10.5, 14.5] as const,
    intensity: { eco: 0.72, standard: 0.82, contact: 0.78, shadowed: 0.86 },
  },
  topSpot: {
    color: 0xf4f6fa,
    position: [1.4, 16.5, 10.8] as const,
    intensity: { eco: 0.56, standard: 0.82, shadowed: 0.90 },
  },
} as const;

/**
 * Studio 4-source industrial lighting rig:
 *  A. Key Light — directional neutral-warm with controlled PCFSoftShadowMap (Cinematic / Showcase)
 *  B. Fill Light — cool technical Hemisphere + low-right DirectionalLight preserving shadow legibility
 *  C. Rim Light — back-edge accent light separating outer silhouette from deep black space
 *  D. Core Light — local dynamic PointLights inside the chamber reacting to AI state & audio
 */
export function createReactorLighting(
  scene: THREE.Scene,
  initialColorHex: number
): ReactorLighting {
  // Restrained neutral hemisphere lifts recessed ceramic cavities out of pure #000000 while keeping deep shadow contrast
  const hemiLight = new THREE.HemisphereLight(
    STUDIO_LIGHT_PRESETS.hemi.skyColor,
    STUDIO_LIGHT_PRESETS.hemi.groundColor,
    STUDIO_LIGHT_PRESETS.hemi.intensity.standard
  );
  scene.add(hemiLight);

  // A. Key Light (sole shadow caster, neutral-warm studio grazing angle to expose machined armor bevels)
  const keyLight = new THREE.DirectionalLight(
    STUDIO_LIGHT_PRESETS.key.color,
    STUDIO_LIGHT_PRESETS.key.intensity.standard
  );
  keyLight.position.set(...STUDIO_LIGHT_PRESETS.key.position);
  keyLight.castShadow = false;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 6;
  keyLight.shadow.camera.far = 42;
  keyLight.shadow.camera.left = -7.2;
  keyLight.shadow.camera.right = 7.2;
  keyLight.shadow.camera.top = 7.2;
  keyLight.shadow.camera.bottom = -7.2;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 2.5;
  scene.add(keyLight);

  // B. Neutral studio Fill Light from lower-right grazing angle (reveals diagonal conduit rails & chamber steps)
  const fillLight = new THREE.DirectionalLight(
    STUDIO_LIGHT_PRESETS.fill.color,
    STUDIO_LIGHT_PRESETS.fill.intensity.standard
  );
  fillLight.position.set(...STUDIO_LIGHT_PRESETS.fill.position);
  fillLight.castShadow = false;
  scene.add(fillLight);

  // Overhead bevel-grazing light exposing the upper armored power bridge spine & central chamber crown
  const topSpot = new THREE.DirectionalLight(
    STUDIO_LIGHT_PRESETS.topSpot.color,
    STUDIO_LIGHT_PRESETS.topSpot.intensity.standard
  );
  topSpot.position.set(...STUDIO_LIGHT_PRESETS.topSpot.position);
  topSpot.castShadow = false;
  scene.add(topSpot);

  // C. Controlled Back-Rim Light separating outer silhouette and internal turbine layers from deep black space
  const rimLight = new THREE.PointLight(initialColorHex, 0.0, 15.5, 2.0);
  rimLight.position.set(0, 0, -4.2);
  rimLight.castShadow = false;
  scene.add(rimLight);

  // D. Local Core & Chamber Dynamic Lights (primary plasma core glow + localized red illumination on chamber, channels & glass edges)
  const coreLight = new THREE.PointLight(initialColorHex, 0.0, 4.4, 2.2);
  coreLight.position.z = 0.24;
  coreLight.castShadow = false;

  const innerChamberLight = new THREE.PointLight(initialColorHex, 0.0, 6.2, 1.9);
  innerChamberLight.position.z = -0.18;
  innerChamberLight.castShadow = false;

  const trenchLights: THREE.PointLight[] = [];

  let currentShadowMapSize = 0;

  const applyGraphicsConfig = (
    config: GraphicsConfig,
    renderer: THREE.WebGLRenderer,
    caps?: GpuCapabilities | null
  ) => {
    const canShadow = !caps?.isSoftwareGl && (caps?.supportsShadows ?? true);
    const quality = canShadow ? config.shadowQuality : 'off';
    const isShadowed = quality === 'soft1024' || quality === 'soft2048';
    const isEco = config.dynamicPointLights === 'eco';

    if (isShadowed) {
      const requestedSize = quality === 'soft2048' ? 2048 : 1024;
      const safeSize = Math.min(requestedSize, caps?.maxTextureSize ?? 2048);

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      keyLight.castShadow = true;
      keyLight.shadow.radius = quality === 'soft2048' ? 2.0 : 2.8;

      if (currentShadowMapSize !== safeSize) {
        currentShadowMapSize = safeSize;
        if (keyLight.shadow.map) {
          keyLight.shadow.map.dispose();
          keyLight.shadow.map = null;
        }
        keyLight.shadow.mapSize.set(safeSize, safeSize);
      }
      renderer.shadowMap.needsUpdate = true;
    } else {
      keyLight.castShadow = false;
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
      }
      if (keyLight.shadow.map) {
        keyLight.shadow.map.dispose();
        keyLight.shadow.map = null;
        currentShadowMapSize = 0;
      }
    }

    // Balance neutral studio key/fill/hemi/topSpot deterministically from STUDIO_LIGHT_PRESETS
    hemiLight.intensity = isEco
      ? STUDIO_LIGHT_PRESETS.hemi.intensity.eco
      : isShadowed
        ? STUDIO_LIGHT_PRESETS.hemi.intensity.shadowed
        : STUDIO_LIGHT_PRESETS.hemi.intensity.standard;

    keyLight.intensity = isEco
      ? STUDIO_LIGHT_PRESETS.key.intensity.eco
      : isShadowed
        ? STUDIO_LIGHT_PRESETS.key.intensity.shadowed
        : STUDIO_LIGHT_PRESETS.key.intensity.standard;

    fillLight.intensity = isEco
      ? STUDIO_LIGHT_PRESETS.fill.intensity.eco
      : isShadowed
        ? STUDIO_LIGHT_PRESETS.fill.intensity.shadowed
        : config.shadowQuality === 'contact'
          ? STUDIO_LIGHT_PRESETS.fill.intensity.contact
          : STUDIO_LIGHT_PRESETS.fill.intensity.standard;

    topSpot.visible = true;
    topSpot.intensity = isEco
      ? STUDIO_LIGHT_PRESETS.topSpot.intensity.eco
      : isShadowed
        ? STUDIO_LIGHT_PRESETS.topSpot.intensity.shadowed
        : STUDIO_LIGHT_PRESETS.topSpot.intensity.standard;
  };

  return {
    hemiLight,
    keyLight,
    fillLight,
    topSpot,
    rimLight,
    coreLight,
    innerChamberLight,
    trenchLights,
    applyGraphicsConfig,
  };
}
