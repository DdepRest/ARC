import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ReactorTextureRegistry,
  linearToSrgb,
} from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import { createReactorLighting } from './reactor-lighting';
import { buildReactorGeometry } from './reactor-geometry';

// Minimal deterministic canvas mock for Vitest node/dom environments
function ensureCanvas2dMock() {
  const makeCtx = (w: number, h: number) => {
    const base: Record<string, any> = {
      createImageData: (cw: number, ch: number) => ({
        width: cw,
        height: ch,
        data: new Uint8ClampedArray(cw * ch * 4),
      }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
      canvas: { width: w, height: h },
    };
    return new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return () => {};
      },
    });
  };

  if (typeof globalThis.document === 'undefined') {
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          const obj = {
            width: 256,
            height: 256,
            getContext: function () {
              return makeCtx(this.width || 256, this.height || 256);
            },
          };
          return obj;
        }
        return {};
      },
    };
    return;
  }

  if (typeof HTMLCanvasElement !== 'undefined') {
    const proto = HTMLCanvasElement.prototype as any;
    if (!proto.__arcMocked) {
      proto.__arcMocked = true;
      proto.getContext = function () {
        return makeCtx(this.width || 256, this.height || 256);
      };
    }
  }
}

describe('Reactor Stage I — PBR Material & Geometry Foundation', () => {
  beforeEach(() => {
    ensureCanvas2dMock();
  });

  it('encodes linear reflectance to sRGB accurately without crushing darks', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 5);
    // Linear 0.155 (anodized titanium) -> sRGB ~0.43 (never crushed to 0.155!)
    const srgbAnodized = linearToSrgb(0.155);
    expect(srgbAnodized).toBeGreaterThan(0.41);
    expect(srgbAnodized).toBeLessThan(0.45);
    // Linear 0.465 (brushed titanium) -> sRGB ~0.71
    const srgbTitanium = linearToSrgb(0.465);
    expect(srgbTitanium).toBeGreaterThan(0.69);
    expect(srgbTitanium).toBeLessThan(0.73);
  });

  it('maintains strict SRGBColorSpace on albedos and NoColorSpace on linear data maps', () => {
    const registry = new ReactorTextureRegistry();
    expect(registry.mapRequestedResolutionToTier(2048)).toBe(2048);
    expect(registry.mapRequestedResolutionToTier(1024)).toBe(1024);
    expect(registry.mapRequestedResolutionToTier(512)).toBe(512);
    expect(registry.mapRequestedResolutionToTier(128)).toBe(256);

    const bundle = registry.getBootstrapBundle(4, true);
    const sets = [
      bundle.anodized,
      bundle.brushedTitanium,
      bundle.carbon,
      bundle.ceramic,
      bundle.copper,
    ];

    for (const set of sets) {
      expect(set.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(set.normal.colorSpace).toBe(THREE.NoColorSpace);
      expect(set.roughness.colorSpace).toBe(THREE.NoColorSpace);
      if (set.ao) {
        expect(set.ao.colorSpace).toBe(THREE.NoColorSpace);
      }
      expect(registry.isOwnedTexture(set.albedo)).toBe(true);
    }

    registry.disposeAll();
    expect(registry.getCachedTierCount()).toBe(0);
  });

  it('eliminates roughness double-multiplication and preserves clear material contrast', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);

    // Every material bound to a roughnessMap must have scalar roughness === 1.0
    const roughnessMapped = [
      mats.anodizedBlack,
      mats.brushedTitanium,
      mats.ringFrameMat,
      mats.darkCarbon,
      mats.darkCeramic,
      mats.copperWinding,
      mats.heatTintedMetal,
    ];
    for (const mat of roughnessMapped) {
      expect(mat.roughnessMap).toBeTruthy();
      expect(mat.roughness).toBe(1.0);
    }

    // Physical class separation
    expect(mats.anodizedBlack.metalness).toBeGreaterThanOrEqual(0.85);
    expect(mats.brushedTitanium.metalness).toBeGreaterThanOrEqual(0.9);
    expect(mats.copperWinding.metalness).toBeGreaterThanOrEqual(0.9);
    expect(mats.darkCeramic.metalness).toBeLessThanOrEqual(0.12);
    expect(mats.darkCarbon.clearcoat).toBeGreaterThan(0.15);
    expect(mats.opticGlass.depthWrite).toBe(false);
    expect(mats.opticGlass.ior).toBeGreaterThanOrEqual(1.5);

    mats.dispose();
    registry.disposeAll();
  });

  it('builds physical multi-layer geometry preserving 100% of state-driver named contracts', () => {
    const scene = new THREE.Scene();
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);
    const lighting = createReactorLighting(scene, 0xff2222);

    const result = buildReactorGeometry(scene, mats, lighting, 'high');
    expect(result.lightRunners).toHaveLength(10);
    expect(lighting.trenchLights).toHaveLength(3);

    // Real spinning turbine assemblies (no empty dummies)
    expect(result.internalTurbine.children.length).toBeGreaterThanOrEqual(2);
    expect(result.internalTurbineSecondary.children.length).toBeGreaterThanOrEqual(1);

    // State-driver critical named contracts
    const requiredNames = [
      'arc-reactor-root',
      'arc-central-chamber-root',
      'arc-chamber-shell',
      'arc-chamber-clamps',
      'arc-aperture-inner-rim',
      'arc-triangular-core-mesh',
      'arc-inner-wire-triangle',
      'arc-central-letters-logo',
      'arc-outer-containment-ring',
      'arc-merged-armor-sectors',
      'arc-inner-plasma-tube-0',
      'arc-inner-plasma-tube-1',
      'arc-inner-plasma-tube-2',
      'arc-inner-port-diode-0',
      'arc-inner-port-diode-1',
      'arc-inner-port-diode-2',
      'arc-vertex-light-0',
      'arc-vertex-light-1',
      'arc-vertex-light-2',
      'arc-clamp-light-0',
      'arc-clamp-light-1',
      'arc-clamp-light-2',
      'arc-conduit-runner-0',
      'arc-conduit-runner-1',
      'arc-conduit-runner-2',
      'arc-process-node-0',
      'arc-process-node-5',
      'arc-node-screen-0',
      'arc-node-led-5',
    ];

    for (const name of requiredNames) {
      expect(scene.getObjectByName(name), `Missing named object: ${name}`).toBeTruthy();
    }

    // Aperture iris & core mesh must be real visible geometry
    const iris = scene.getObjectByName('arc-aperture-inner-rim') as THREE.Mesh;
    const core = scene.getObjectByName('arc-triangular-core-mesh') as THREE.Mesh;
    expect(iris.visible).toBe(true);
    expect(iris.geometry.getAttribute('position').count).toBeGreaterThan(100);
    expect(core.visible).toBe(true);
    expect(core.geometry.getAttribute('position').count).toBeGreaterThan(20);

    // 3-band audio tubes must have distinct cloned material instances
    const tubeMats = [0, 1, 2].map(
      (i) => (scene.getObjectByName(`arc-inner-plasma-tube-${i}`) as THREE.Mesh).material
    );
    expect(new Set(tubeMats).size).toBe(3);

    // InstancedMesh hardware count & valid normals/UVs on structural meshes
    let instancedCount = 0;
    let totalMeshes = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) instancedCount++;
      if (obj instanceof THREE.Mesh) {
        totalMeshes++;
        const pos = obj.geometry.getAttribute('position');
        const norm = obj.geometry.getAttribute('normal');
        expect(pos.count).toBeGreaterThan(0);
        if (norm) {
          expect(Number.isFinite(norm.getX(0))).toBe(true);
        }
      }
    });
    expect(instancedCount).toBeGreaterThanOrEqual(8);
    expect(totalMeshes).toBeLessThanOrEqual(105);

    mats.dispose();
    registry.disposeAll();
  });
});
