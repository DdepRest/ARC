import * as THREE from 'three';
import type { ReactorMaterials } from './reactor-materials';
import type { ReactorLighting } from './reactor-lighting';
import type { ReactorPostFX } from './reactor-postfx';
import type { ReactorTextureRegistry } from './reactor-texture-registry';

export type Stage1ViewPreset = 'default' | 'chamber' | 'materials' | 'oblique';

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
  const { scene, camera, renderer, materials, lighting, postfx, textureRegistry } = deps;

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

    const key = new THREE.DirectionalLight(0xfffaf2, 2.8);
    key.position.set(16, 22, 26);
    rig.add(key);

    const fill = new THREE.DirectionalLight(0xeef4ff, 1.45);
    fill.position.set(-22, 8, 18);
    rig.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 1.9);
    rim.position.set(0, -18, 16);
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
      m.position.set((i - 2.5) * 1.15, -6.55, 0.6);
      strip.add(m);
    });

    swatchStrip = strip;
    return strip;
  };

  const applyCameraPreset = () => {
    if (activeView === 'default') {
      camera.fov = 12;
      camera.position.set(0, 0, 81.5);
      camera.lookAt(0, 0, 0);
    } else if (activeView === 'chamber') {
      camera.fov = 12;
      camera.position.set(0, 0, 31.0);
      camera.lookAt(0, 0, 0);
    } else if (activeView === 'materials') {
      camera.fov = 12;
      camera.position.set(2.9, 2.7, 29.0);
      camera.lookAt(2.4, 2.2, 0);
    } else if (activeView === 'oblique') {
      camera.fov = 14;
      camera.position.set(21.0, -25.0, 58.0);
      camera.lookAt(0, 0, 0);
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

  const getSceneStats = () => {
    let totalMeshes = 0;
    let visibleMeshes = 0;
    let instancedMeshes = 0;
    let totalInstances = 0;
    let sprites = 0;
    let triangles = 0;
    let vertices = 0;
    let pointLights = 0;
    const namedObjects: string[] = [];

    scene.traverse((obj) => {
      if (obj.name) namedObjects.push(obj.name);
      if (obj instanceof THREE.PointLight) pointLights++;
      if (obj instanceof THREE.Sprite && obj.visible) sprites++;
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshes++;
        totalInstances += obj.count;
        totalMeshes++;
        if (obj.visible) visibleMeshes++;
        const pos = obj.geometry.getAttribute('position');
        const idx = obj.geometry.index;
        const tris = idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
        triangles += Math.round(tris * obj.count);
        vertices += pos ? pos.count * obj.count : 0;
      } else if (obj instanceof THREE.Mesh) {
        totalMeshes++;
        if (obj.visible) visibleMeshes++;
        const pos = obj.geometry.getAttribute('position');
        const idx = obj.geometry.index;
        const tris = idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
        triangles += Math.round(tris);
        vertices += pos ? pos.count : 0;
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
      totalMeshes,
      visibleMeshes,
      instancedMeshes,
      totalInstances,
      sprites,
      estimatedDrawCalls: visibleMeshes + sprites,
      triangles,
      vertices,
      pointLights,
      rendererMemory: {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      textureStats: textureRegistry.getTextureStats(),
      pbrAudit,
      namedObjectCount: namedObjects.length,
    };
  };

  if (typeof window !== 'undefined') {
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
