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
  envScene.background = new THREE.Color(0x080a0e);

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

  // 1. Primary overhead neutral architectural softbox (restrained so top horizontal module matches lower diagonals)
  addPanel(14, 6.2, 0xfaf9f7, 1.75, [-2.5, 11.5, 7.0]);

  // 2. Lower-left neutral studio fill strip (illuminates 210° lower-left diagonal module & dark anodized grain)
  addPanel(5.8, 13, 0xe6e8ec, 1.38, [-12.0, -3.5, 8.5]);

  // 3. Lower-right neutral-warm accent strip (illuminates 330° lower-right diagonal module & dark copper chamfers)
  addPanel(5.2, 12, 0xf2ece6, 1.26, [12.0, -3.5, 8.0]);

  // 4. Neutral graphite lower bounce panel (balances ventral 270° and diagonal undersides)
  addPanel(14, 5.5, 0x62666e, 0.86, [0, -11.5, 6.2]);

  // 5. Narrow off-axis front-upper neutral specular strip (catches +Z bevels on chamber crown & 210°/330° conduits without flattening)
  addPanel(10, 2.8, 0xdce0e8, 0.42, [-1.8, 5.2, 15.5]);

  if (!isEco) {
    // 6. Crisp upper-right neutral rim bar for smoked glass Fresnel & dark bevel edge catching
    addPanel(11, 1.5, 0xf7f8fa, isHigh ? 2.25 : 1.68, [6.5, 7.5, -9.5]);

    // 7. Neutral back-left rim bar separating black outer silhouette from deep space
    addPanel(2.4, 11, 0xe8eaee, isHigh ? 1.95 : 1.32, [-10.5, -2.5, -9.0]);
  }

  if (isHigh) {
    // 8. High-tier precision razor specular strip overhead for subtle obsidian chamfer glints
    addPanel(15, 0.8, 0xffffff, 2.2, [0, 13.0, 2.5]);
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
