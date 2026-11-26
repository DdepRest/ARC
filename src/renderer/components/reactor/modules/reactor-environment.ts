import * as THREE from 'three';
import type { GraphicsPmremQuality } from '../../../features/settings/logic/graphics-presets';

export interface ReactorStudioEnvironment {
  applyQuality: (quality: GraphicsPmremQuality) => THREE.Texture;
  getCurrentTexture: () => THREE.Texture | null;
  dispose: () => void;
}

/**
 * Builds an offline procedural studio softbox environment scene designed
 * specifically for dark brushed titanium, anodized black metal, and smoked optical glass.
 */
function buildStudioSoftboxScene(quality: GraphicsPmremQuality): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x040508);

  const isHigh = quality === 'high';
  const isEco = quality === 'eco';
  const masterGain = isHigh ? 1.25 : isEco ? 0.72 : 1.0;

  const addPanel = (
    w: number,
    h: number,
    colorHex: number,
    intensity: number,
    pos: [number, number, number],
    lookAt: [number, number, number] = [0, 0, 0]
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const col = new THREE.Color(colorHex).multiplyScalar(intensity * masterGain);
    const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    envScene.add(mesh);
  };

  // 1. Overhead grazing architectural strip (sculpts upper bridge & bevels without washing flat +Z faces)
  addPanel(13, 4.6, 0xf8f9fb, 1.55, [-2.8, 11.8, 6.4]);

  // 2. Left grazing studio strip (reveals 210° diagonal armor planes & chamfers)
  addPanel(4.4, 12.5, 0xe0e4ec, 1.24, [-12.8, -2.8, 7.0]);

  // 3. Right grazing studio strip (reveals 330° diagonal armor planes & dark copper contacts)
  addPanel(4.2, 11.5, 0xebe6e0, 1.12, [12.8, -2.8, 6.6]);

  // 4. Restrained obsidian ventral bounce panel (prevents underside crush while keeping deep shadows)
  addPanel(13, 4.5, 0x484e58, 0.68, [0, -12.0, 5.5]);

  // 5. Asymmetric oblique-frontal grazing ribbon (>75% of frontal hemisphere remains 0x040508 black)
  addPanel(13, 1.55, 0xe6ebf2, 0.68, [-3.2, 6.8, 13.8]);

  if (!isEco) {
    // 6. Upper-right neutral rim bar for smoked glass Fresnel & dark bevel edge separation
    addPanel(11, 1.45, 0xf4f6fa, isHigh ? 2.05 : 1.52, [6.5, 7.5, -9.5]);

    // 7. Back-left rim bar separating obsidian outer silhouette from deep black space
    addPanel(2.3, 11, 0xe2e6ee, isHigh ? 1.72 : 1.18, [-10.5, -2.5, -9.0]);
  }

  if (isHigh) {
    // 8. High-tier precision razor specular strip overhead for sharp obsidian chamfer glints
    addPanel(14.5, 0.65, 0xffffff, 2.00, [0, 13.2, 2.2]);
  }

  return envScene;
}

function disposeEnvScene(envScene: THREE.Scene): void {
  envScene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
  });
  envScene.clear();
}

/**
 * Manages cached Studio Softbox PMREM RenderTargets keyed by pmremQuality.
 * Never regenerated per frame or on theme color switch.
 */
export function createReactorStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): ReactorStudioEnvironment {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const targetCache = new Map<GraphicsPmremQuality, THREE.WebGLRenderTarget>();
  let currentQuality: GraphicsPmremQuality | null = null;
  let disposed = false;

  const sigmaByQuality: Record<GraphicsPmremQuality, number> = {
    eco: 0.06,
    standard: 0.036,
    high: 0.018,
  };

  const applyQuality = (quality: GraphicsPmremQuality): THREE.Texture => {
    let rt = targetCache.get(quality);
    if (!rt) {
      const studioScene = buildStudioSoftboxScene(quality);
      rt = pmremGenerator.fromScene(studioScene, sigmaByQuality[quality]);
      disposeEnvScene(studioScene);
      targetCache.set(quality, rt);
    }
    currentQuality = quality;
    scene.environment = rt.texture;
    return rt.texture;
  };

  const getCurrentTexture = (): THREE.Texture | null => {
    if (!currentQuality) return null;
    return targetCache.get(currentQuality)?.texture ?? null;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (scene.environment === getCurrentTexture()) {
      scene.environment = null;
    }
    targetCache.forEach((rt) => {
      try { rt.dispose(); } catch {}
    });
    targetCache.clear();
    try { pmremGenerator.dispose(); } catch {}
  };

  return {
    applyQuality,
    getCurrentTexture,
    dispose,
  };
}
