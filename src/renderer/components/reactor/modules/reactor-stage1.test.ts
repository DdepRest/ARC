import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ReactorTextureRegistry,
  linearToSrgb,
} from './reactor-texture-registry';
import { createReactorMaterials } from './reactor-materials';
import { createReactorLighting } from './reactor-lighting';
import { buildReactorGeometry } from './reactor-geometry';
import { DEFAULT_REACTOR_CAMERA } from './reactor-stage1-diagnostics';

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

    // Verify solid circular rear disc is completely removed (open-frame exoskeleton)
    expect(scene.getObjectByName('arc-bulkhead-deck-carbon')).toBeUndefined();

    // State-driver critical named contracts + Stage I.1 open-frame industrial modules
    const requiredNames = [
      'arc-reactor-root',
      'arc-central-chamber-root',
      'arc-chamber-shell',
      'arc-chamber-clamps',
      'arc-aperture-inner-rim',
      'arc-iris-shutter-blades',
      'arc-triangular-core-mesh',
      'arc-inner-wire-triangle',
      'arc-chamber-optic-glass',
      'arc-central-letters-logo',
      'arc-rear-structural-hub',
      'arc-merged-nacelles-anodizedBlack',
      'arc-asymmetric-outer-modules',
      'arc-merged-outerMods-heatTintedMetal',
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

    // Verify genuine physical 3D depth across the reactor and central chamber
    const bounds = new THREE.Box3().setFromObject(result.reactorGroup);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    expect(size.z).toBeGreaterThanOrEqual(1.8);

    // Aperture iris & core mesh must be real visible geometry, separated cleanly from glass viewport
    const iris = scene.getObjectByName('arc-aperture-inner-rim') as THREE.Mesh;
    const core = scene.getObjectByName('arc-triangular-core-mesh') as THREE.Mesh;
    const glass = scene.getObjectByName('arc-chamber-optic-glass') as THREE.Mesh;
    expect(iris.visible).toBe(true);
    expect(iris.geometry.getAttribute('position').count).toBeGreaterThan(100);
    expect(core.visible).toBe(true);
    expect(core.geometry.getAttribute('position').count).toBeGreaterThan(20);
    expect(glass.position.z - core.position.z).toBeGreaterThanOrEqual(0.7);

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
    expect(instancedCount).toBeGreaterThanOrEqual(7);
    expect(totalMeshes).toBeLessThanOrEqual(105);

    // Verify 120-degree vertex alignment on corner clamps (-90°, 30°, 150° at r = 4.46)
    const expectedAngles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    for (let i = 0; i < 3; i++) {
      const clamp = scene.getObjectByName(`arc-corner-clamp-${i}`) as THREE.Group;
      expect(clamp).toBeTruthy();
      expect(clamp.position.x).toBeCloseTo(Math.cos(expectedAngles[i]) * 4.46, 2);
      expect(clamp.position.y).toBeCloseTo(Math.sin(expectedAngles[i]) * 4.46, 2);
    }

    // Verify A.R.C. central logo is integrated into the central chamber bezel (z = 0.38)
    const logoGroup = scene.getObjectByName('arc-central-letters-logo') as THREE.Group;
    expect(logoGroup.position.z).toBeCloseTo(0.38, 2);

    // P0: Verify central emissive core is NOT occluded along the Z-axis by any opaque backing mesh
    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, -1)
    );
    const hits = raycaster.intersectObject(result.reactorGroup, true);
    const coreHitIndex = hits.findIndex((h) => h.object.name === 'arc-triangular-core-mesh');
    expect(coreHitIndex).toBeGreaterThanOrEqual(0);
    // Any hit before the core must be transparent (opticGlass or logo decal plane), never opaque ceramic/carbon/anodized
    const hitsBeforeCore = hits.slice(0, coreHitIndex);
    for (const hit of hitsBeforeCore) {
      const meshMat = (hit.object as THREE.Mesh).material as THREE.Material;
      expect(
        meshMat.transparent,
        `Opaque mesh "${hit.object.name || hit.object.uuid}" occluded arc-triangular-core-mesh at z=${hit.point.z}`
      ).toBe(true);
    }

    // P1: Verify the 3 outer modules at 30°, 150°, 270° (r = 5.30) are balanced and present at exact 120° intervals
    const outerModsGroup = scene.getObjectByName('arc-asymmetric-outer-modules') as THREE.Group;
    expect(outerModsGroup).toBeTruthy();
    const outerBounds = new THREE.Box3().setFromObject(outerModsGroup);
    const outerCenter = new THREE.Vector3();
    outerBounds.getCenter(outerCenter);
    expect(Math.abs(outerCenter.x)).toBeLessThan(0.01);
    const moduleAngles = [Math.PI / 6, (5 * Math.PI) / 6, -Math.PI / 2];
    const moduleHitCounts = moduleAngles.map((a) => {
      const modRay = new THREE.Raycaster(
        new THREE.Vector3(Math.cos(a) * 5.30, Math.sin(a) * 5.30, 5),
        new THREE.Vector3(0, 0, -1)
      );
      return modRay.intersectObject(outerModsGroup, true).length;
    });
    for (const count of moduleHitCounts) {
      expect(count).toBeGreaterThanOrEqual(3);
    }

    // Verify DEFAULT_REACTOR_CAMERA retains slight perspective angle without excessive offset skew
    expect(DEFAULT_REACTOR_CAMERA.position[0]).toBeGreaterThan(1.0);
    expect(DEFAULT_REACTOR_CAMERA.position[0]).toBeLessThan(4.0);
    expect(DEFAULT_REACTOR_CAMERA.position[1]).toBeGreaterThan(1.0);
    expect(DEFAULT_REACTOR_CAMERA.position[1]).toBeLessThan(3.0);
    expect(DEFAULT_REACTOR_CAMERA.position[2]).toBeGreaterThan(40.0);

    mats.dispose();
    registry.disposeAll();
  });
});
