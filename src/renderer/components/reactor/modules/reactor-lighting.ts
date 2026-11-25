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
  // Neutral studio hemisphere fill reveals obsidian black forms without blue wash or gray glare
  const hemiLight = new THREE.HemisphereLight(0xd8dce0, 0x0b0c0f, 0.46);
  scene.add(hemiLight);

  // A. Key Light (sole shadow caster, neutral studio white with controlled bevel catch)
  const keyLight = new THREE.DirectionalLight(0xfcfaf6, 1.82);
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

  // B. Neutral studio Fill Light from lower-right (balances lower diagonal modules while preserving dark shadows)
  const fillLight = new THREE.DirectionalLight(0xd4d7dc, 0.78);
  fillLight.position.set(14, -13, 15);
  fillLight.castShadow = false;
  scene.add(fillLight);

  // Restrained overhead edge-catching grazing light for dark titanium bevels (prevents top horizontal glare)
  const topSpot = new THREE.DirectionalLight(0xf2f4f6, 0.48);
  topSpot.position.set(1.5, 18, 11);
  topSpot.castShadow = false;
  scene.add(topSpot);

  // C. Controlled Back-Rim Light separating outer silhouette and internal turbine layers from deep black space
  const rimLight = new THREE.PointLight(initialColorHex, 0.0, 16.0, 2.0);
  rimLight.position.set(0, 0, -4.2);
  rimLight.castShadow = false;
  scene.add(rimLight);

  // D. Local Core Dynamic Lights (compact coreLight radius prevents central hotspot from overlapping A/R/C letters;
  //    innerChamberLight softly grazes internal radial spars, ceramic chord braces, and turbine blades for 3D depth)
  const coreLight = new THREE.PointLight(initialColorHex, 0.0, 4.2, 2.4);
  coreLight.position.z = 0.28;
  coreLight.castShadow = false;

  const innerChamberLight = new THREE.PointLight(initialColorHex, 0.0, 5.6, 2.0);
  innerChamberLight.position.z = -0.26;
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

    // Balance neutral studio key/fill cleanly across shadow tiers
    const shadowBoost = quality === 'soft1024' || quality === 'soft2048' ? 1.06 : 1.0;
    keyLight.intensity = (config.dynamicPointLights === 'eco' ? 1.62 : 1.82) * shadowBoost;
    fillLight.intensity = config.shadowQuality === 'contact' ? 0.64 : 0.72;
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
