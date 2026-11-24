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
  envScene.background = new THREE.Color(0x040507);

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

  // 1. Primary overhead neutral architectural softbox (crisp bevel catch on obsidian black)
  addPanel(16, 7, 0xfaf9f7, 2.05, [-3.5, 11.5, 7.0]);

  // 2. Front-left neutral studio fill strip (reveals dark anodized grain without blue cast)
  addPanel(5.5, 13, 0xe6e8ec, 1.35, [-12.5, 2.5, 8.5]);

  // 3. Front-right neutral-warm accent strip (highlights dark copper & right chamfers)
  addPanel(4.5, 11, 0xf2ece6, 1.15, [13.0, -1.5, 7.5]);

  // 4. Neutral graphite lower bounce panel (keeps undersides legible as dark machinery)
  addPanel(14, 5, 0x585b62, 0.65, [0, -11.5, 5.5]);

  if (!isEco) {
    // 5. Crisp upper-right neutral rim bar for smoked glass Fresnel & dark bevel edge catching
    addPanel(12, 1.6, 0xf7f8fa, isHigh ? 2.6 : 1.85, [5.5, 8.5, -9.5]);

    // 6. Neutral back-left rim bar separating black outer silhouette from deep space
    addPanel(2.2, 11, 0xe8eaee, isHigh ? 1.9 : 1.25, [-10.5, -2.0, -9.0]);
  }

  if (isHigh) {
    // 7. High-tier precision razor specular strip overhead for subtle obsidian chamfer glints
    addPanel(18, 0.9, 0xffffff, 3.0, [0, 13.0, 2.5]);
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
