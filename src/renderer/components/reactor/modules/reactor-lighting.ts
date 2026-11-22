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
  // Subtle hemisphere bounce keeps dark anodized titanium legible without washing out black space
  const hemiLight = new THREE.HemisphereLight(0xaec4e8, 0x0b0c10, 0.42);
  scene.add(hemiLight);

  // A. Key Light (sole shadow caster, tight orthographic frustum tailored to r=5.6 reactor)
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.25);
  keyLight.position.set(-10, 14, 18);
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

  // B. Cool architectural Fill Light from lower-right
  const fillLight = new THREE.DirectionalLight(0x7c93b8, 0.85);
  fillLight.position.set(14, -12, 14);
  fillLight.castShadow = false;
  scene.add(fillLight);

  // Overhead edge-catching grazing light for brushed bezels & clamp chamfers
  const topSpot = new THREE.DirectionalLight(0xeef3ff, 0.72);
  topSpot.position.set(2, 20, 9);
  topSpot.castShadow = false;
  scene.add(topSpot);

  // C. Controlled Back-Rim Light separating outer titanium ring from deep space
  const rimLight = new THREE.PointLight(initialColorHex, 0.0, 22.0, 1.9);
  rimLight.position.set(0, 0, -4.8);
  rimLight.castShadow = false;
  scene.add(rimLight);

  // D. Local Core Dynamic Lights (never cast shadows)
  const coreLight = new THREE.PointLight(initialColorHex, 0.0, 8.5, 2.1);
  coreLight.position.z = 0.42;
  coreLight.castShadow = false;

  const innerChamberLight = new THREE.PointLight(initialColorHex, 0.0, 6.2, 2.0);
  innerChamberLight.position.z = -0.15;
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

    if (quality === 'soft1024' || quality === 'soft2048') {
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

    // Balance studio key/fill slightly when shadows are active vs contact/off
    const shadowBoost = quality === 'soft1024' || quality === 'soft2048' ? 1.08 : 1.0;
    keyLight.intensity = (config.dynamicPointLights === 'eco' ? 1.95 : 2.25) * shadowBoost;
    fillLight.intensity = config.shadowQuality === 'contact' ? 0.72 : 0.85;
    topSpot.visible = config.dynamicPointLights !== 'eco';
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
