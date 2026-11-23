import * as THREE from 'three';
import type { ReactorMaterials } from './reactor-materials';
import type { ReactorLighting } from './reactor-lighting';
import type { ReactorPostFX } from './reactor-postfx';
import type { ReactorTextureRegistry } from './reactor-texture-registry';

export type Stage1ViewPreset = 'default' | 'front' | 'oblique' | 'chamber' | 'materials';

export const DEFAULT_REACTOR_CAMERA = {
  fov: 24,
  position: [8.6, 5.8, 40.2] as const,
  target: [0, 0, 0] as const,
};

export interface Stage1DiagnosticsDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  materials: ReactorMaterials;
  lighting: ReactorLighting;
  postfx: ReactorPostFX;
  textureRegistry: ReactorTextureRegistry;
}

export interface Stage1DiagnosticsController {
  applyPostUpdateAndRender: () => void;
  dispose: () => void;
}

export function attachStage1Diagnostics(deps: Stage1DiagnosticsDeps): Stage1DiagnosticsController {
  const { scene, camera, renderer, materials, postfx, textureRegistry } = deps;

  let activeView: Stage1ViewPreset = 'default';
  let bloomOverride: boolean | null = null;
  let neutralStudioEnabled = false;
  let swatchesVisible = false;

  let studioRig: THREE.Group | null = null;
  let swatchStrip: THREE.Group | null = null;
  let savedBackground: THREE.Color | THREE.Texture | null = null;

  const savedLightIntensities = new Map<THREE.Light, number>();
  const savedEmissives = new Map<THREE.MeshStandardMaterial, number>();

  const ensureStudioRig = () => {
    if (studioRig) return studioRig;
    const rig = new THREE.Group();
    rig.name = 'arc-stage1-neutral-studio-rig';

    const key = new THREE.DirectionalLight(0xfffaf2, 2.75);
    key.position.set(18, 22, 26);
    rig.add(key);

    const fill = new THREE.DirectionalLight(0xeef4ff, 1.45);
    fill.position.set(-22, 8, 18);
    rig.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 1.85);
    rim.position.set(-6, -20, 14);
    rig.add(rim);

    const hemi = new THREE.HemisphereLight(0xf6f8fc, 0x262a34, 0.85);
    rig.add(hemi);

    studioRig = rig;
    return rig;
  };

  const ensureSwatchStrip = () => {
    if (swatchStrip) return swatchStrip;
    const strip = new THREE.Group();
    strip.name = 'arc-stage1-material-swatches';
    const sphereGeo = new THREE.SphereGeometry(0.42, 32, 24);
    const uv = sphereGeo.getAttribute('uv');
    if (uv && !sphereGeo.getAttribute('uv2')) {
      sphereGeo.setAttribute('uv2', uv.clone());
    }

    const swatchMats: Array<[string, THREE.Material]> = [
      ['swatch-anodized', materials.anodizedBlack],
      ['swatch-titanium', materials.brushedTitanium],
      ['swatch-ceramic', materials.darkCeramic],
      ['swatch-carbon', materials.darkCarbon],
      ['swatch-copper', materials.copperWinding],
      ['swatch-glass', materials.opticGlass],
    ];

    swatchMats.forEach(([name, mat], i) => {
      const m = new THREE.Mesh(sphereGeo, mat);
      m.name = name;
      m.position.set((i - 2.5) * 1.15, -6.75, 0.6);
      strip.add(m);
    });

    swatchStrip = strip;
    return strip;
  };

  const applyCameraPreset = () => {
    if (activeView === 'default') {
      camera.fov = DEFAULT_REACTOR_CAMERA.fov;
      camera.position.set(...DEFAULT_REACTOR_CAMERA.position);
      camera.lookAt(...DEFAULT_REACTOR_CAMERA.target);
    } else if (activeView === 'front') {
      camera.fov = 24;
      camera.position.set(0, 0, 41.5);
      camera.lookAt(0, 0, 0);
    } else if (activeView === 'oblique') {
      camera.fov = 24;
      camera.position.set(18.5, 11.2, 34.0);
      camera.lookAt(0, 0, -0.2);
    } else if (activeView === 'chamber') {
      camera.fov = 22;
      camera.position.set(3.4, 2.5, 15.8);
      camera.lookAt(0, 0, -0.15);
    } else if (activeView === 'materials') {
      camera.fov = 22;
      camera.position.set(7.4, 5.8, 16.5);
      camera.lookAt(3.8, 2.6, -0.15);
    }
    camera.updateProjectionMatrix();
  };

  const applyNeutralLightingState = () => {
    if (!neutralStudioEnabled) return;

    scene.traverse((obj) => {
      if (obj instanceof THREE.Light && !obj.parent?.name.startsWith('arc-stage1-neutral-studio')) {
        if (!savedLightIntensities.has(obj)) {
          savedLightIntensities.set(obj, obj.intensity);
        }
        obj.intensity = 0;
      }
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material;
        if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0) {
          if (!savedEmissives.has(mat)) {
            savedEmissives.set(mat, mat.emissiveIntensity);
          }
          mat.emissiveIntensity = 0;
        }
      }
    });

    const rig = ensureStudioRig();
    if (!rig.parent) scene.add(rig);

    if (swatchesVisible) {
      const strip = ensureSwatchStrip();
      if (!strip.parent) scene.add(strip);
    } else if (swatchStrip?.parent) {
      scene.remove(swatchStrip);
    }
  };

  const restoreNeutralLightingState = () => {
    savedLightIntensities.forEach((intensity, light) => {
      light.intensity = intensity;
    });
    savedLightIntensities.clear();

    savedEmissives.forEach((val, mat) => {
      mat.emissiveIntensity = val;
    });
    savedEmissives.clear();

    if (studioRig?.parent) scene.remove(studioRig);
    if (swatchStrip?.parent) scene.remove(swatchStrip);
    if (savedBackground !== null) {
      scene.background = savedBackground;
      savedBackground = null;
    }
  };

  const applyPostUpdateAndRender = () => {
    const needsOverride = activeView !== 'default' || bloomOverride !== null || neutralStudioEnabled;
    if (!needsOverride) return;

    applyCameraPreset();
    if (neutralStudioEnabled) {
      applyNeutralLightingState();
    }

    if (bloomOverride !== null) {
      postfx.bloomPass.enabled = bloomOverride;
      if (!bloomOverride) {
        postfx.bloomPass.strength = 0;
      }
    } else if (neutralStudioEnabled) {
      postfx.bloomPass.enabled = false;
      postfx.bloomPass.strength = 0;
    }

    postfx.composer.render();
  };

  /**
   * Measures REAL WebGL draw calls and rendered triangles directly from `renderer.info.render`
   * (temporarily disabling autoReset around a clean primary scene pass and full composer pass).
   */
  const getSceneStats = () => {
    const prevAutoReset = renderer.info.autoReset;
    const prevTarget = renderer.getRenderTarget();

    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.setRenderTarget(postfx.composer.renderTarget1 ?? null);
    renderer.render(scene, camera);
    const sceneRenderCalls = renderer.info.render.calls;
    const sceneRenderTriangles = renderer.info.render.triangles;
    const sceneRenderPoints = renderer.info.render.points;
    const sceneRenderLines = renderer.info.render.lines;

    renderer.setRenderTarget(prevTarget);
    renderer.info.reset();
    postfx.composer.render();
    const composerTotalCalls = renderer.info.render.calls;
    const composerTotalTriangles = renderer.info.render.triangles;
    renderer.info.autoReset = prevAutoReset;

    let totalMeshes = 0;
    let instancedMeshes = 0;
    let totalInstances = 0;
    let pointLights = 0;

    scene.traverse((obj) => {
      if (obj instanceof THREE.PointLight) pointLights++;
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshes++;
        totalInstances += obj.count;
        totalMeshes++;
      } else if (obj instanceof THREE.Mesh) {
        totalMeshes++;
      }
    });

    const pbrAudit = (
      [
        ['anodizedBlack', materials.anodizedBlack],
        ['brushedTitanium', materials.brushedTitanium],
        ['darkCeramic', materials.darkCeramic],
        ['darkCarbon', materials.darkCarbon],
        ['copperWinding', materials.copperWinding],
        ['heatTintedMetal', materials.heatTintedMetal],
        ['opticGlass', materials.opticGlass],
      ] as Array<[string, THREE.MeshStandardMaterial]>
    ).map(([name, m]) => ({
      name,
      metalness: m.metalness,
      roughness: m.roughness,
      hasMap: Boolean(m.map),
      mapColorSpace: m.map?.colorSpace ?? null,
      hasNormalMap: Boolean(m.normalMap),
      hasRoughnessMap: Boolean(m.roughnessMap),
      roughnessColorSpace: m.roughnessMap?.colorSpace ?? null,
      hasAoMap: Boolean(m.aoMap),
    }));

    return {
      rendererRender: {
        sceneCalls: sceneRenderCalls,
        sceneTriangles: sceneRenderTriangles,
        scenePoints: sceneRenderPoints,
        sceneLines: sceneRenderLines,
        composerTotalCalls,
        composerTotalTriangles,
      },
      totalMeshes,
      instancedMeshes,
      totalInstances,
      pointLights,
      rendererMemory: {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      textureStats: textureRegistry.getTextureStats(),
      pbrAudit,
    };
  };

  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    (window as any).__reactorStage1Debug = {
      setView: (preset: Stage1ViewPreset) => {
        activeView = preset;
        applyCameraPreset();
        applyPostUpdateAndRender();
        return activeView;
      },
      setBloomOverride: (enabled: boolean | null) => {
        bloomOverride = enabled;
        applyPostUpdateAndRender();
        return bloomOverride;
      },
      setNeutralStudioMode: (enabled: boolean, showSwatches = true) => {
        neutralStudioEnabled = enabled;
        swatchesVisible = showSwatches;
        if (enabled) {
          if (savedBackground === null) {
            savedBackground = scene.background;
          }
          scene.background = new THREE.Color(0x16181d);
          applyNeutralLightingState();
          applyPostUpdateAndRender();
        } else {
          restoreNeutralLightingState();
          postfx.composer.render();
        }
        return { neutralStudioEnabled, swatchesVisible };
      },
      getSceneStats,
      reset: () => {
        activeView = 'default';
        bloomOverride = null;
        neutralStudioEnabled = false;
        swatchesVisible = false;
        restoreNeutralLightingState();
        applyCameraPreset();
        postfx.composer.render();
      },
    };
  }

  const dispose = () => {
    restoreNeutralLightingState();
    if (swatchStrip) {
      const disposedGeos = new Set<THREE.BufferGeometry>();
      swatchStrip.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
      });
      swatchStrip = null;
    }
    studioRig = null;
    if (typeof window !== 'undefined') {
      delete (window as any).__reactorStage1Debug;
    }
  };

  return { applyPostUpdateAndRender, dispose };
}
