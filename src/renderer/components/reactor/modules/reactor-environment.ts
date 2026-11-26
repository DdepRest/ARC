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
  envScene.background = new THREE.Color(0x020305);

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

  // 1. Overhead grazing architectural strip (reveals upper bevels without washing flat +Z faces)
  addPanel(12, 3.8, 0xf7f8fa, 1.35, [-3.0, 12.2, 5.2]);

  // 2. Left grazing studio strip (sculpts 210° diagonal armor chamfers)
  addPanel(3.6, 12, 0xdce0e8, 1.08, [-13.5, -2.5, 5.5]);

  // 3. Right grazing studio strip (sculpts 330° diagonal armor chamfers & dark copper contacts)
  addPanel(3.4, 11, 0xe6e4e2, 0.96, [13.5, -2.5, 5.0]);

  // 4. Deep obsidian ventral bounce panel (preserves dark lower shadow floor)
  addPanel(12, 4.0, 0x363a42, 0.55, [0, -12.5, 4.8]);

  // 5. Narrow oblique upper-left razor ribbon (catches 45° chamfers & central optical glass bevel/sheen)
  addPanel(12, 0.95, 0xeef2f8, 0.95, [-4.8, 9.2, 11.5]);

  if (!isEco) {
    // 6. Upper-right neutral rim bar for smoked glass Fresnel & dark bevel edge separation
    addPanel(11, 1.4, 0xf2f4f8, isHigh ? 1.85 : 1.38, [6.5, 7.5, -9.5]);

    // 7. Back-left rim bar separating obsidian outer silhouette from deep black space
    addPanel(2.2, 11, 0xdce0e8, isHigh ? 1.55 : 1.08, [-10.5, -2.5, -9.0]);
  }

  if (isHigh) {
    // 8. High-tier precision razor specular strip overhead for sharp obsidian chamfer glints
    addPanel(14, 0.55, 0xffffff, 1.85, [0, 13.5, 1.8]);
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
