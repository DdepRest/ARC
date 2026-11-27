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
import { computeReactorViewportTransform } from './reactor-state-driver';

// Minimal deterministic canvas mock for Vitest node/dom environments
function ensureCanvas2dMock() {
  const makeCtx = (canvasObj: { width: number; height: number; __imageData?: Uint8ClampedArray }) => {
    const base: Record<string, any> = {
      createImageData: (cw: number, ch: number) => ({
        width: cw,
        height: ch,
        data: new Uint8ClampedArray(cw * ch * 4),
      }),
      putImageData: (img: { data: Uint8ClampedArray }) => {
        canvasObj.__imageData = img.data;
      },
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
      canvas: canvasObj,
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
          const obj: any = {
            width: 256,
            height: 256,
            getContext: function () {
              return makeCtx(this);
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
        return makeCtx(this);
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
    const srgbAnodized = linearToSrgb(0.155);
    expect(srgbAnodized).toBeGreaterThan(0.41);
    expect(srgbAnodized).toBeLessThan(0.45);
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
    const sets = [bundle.anodized, bundle.brushedTitanium, bundle.carbon, bundle.ceramic, bundle.copper];

    for (const set of sets) {
      expect(set.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(set.normal.colorSpace).toBe(THREE.NoColorSpace);
      expect(set.roughness.colorSpace).toBe(THREE.NoColorSpace);
      if (set.ao) expect(set.ao.colorSpace).toBe(THREE.NoColorSpace);
      expect(registry.isOwnedTexture(set.albedo)).toBe(true);
    }

    registry.disposeAll();
    expect(registry.getCachedTierCount()).toBe(0);
  });

  it('eliminates roughness double-multiplication and preserves clear material contrast', () => {
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);

    for (const mat of [
      mats.anodizedBlack, mats.brushedTitanium, mats.ringFrameMat,
      mats.darkCarbon, mats.darkCeramic, mats.copperWinding, mats.heatTintedMetal,
    ]) {
      expect(mat.roughnessMap).toBeTruthy();
      expect(mat.roughness).toBe(1.0);
    }

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
    expect(result.internalTurbine.children.length).toBeGreaterThanOrEqual(2);
    expect(result.internalTurbineSecondary.children.length).toBeGreaterThanOrEqual(1);
    expect(scene.getObjectByName('arc-bulkhead-deck-carbon')).toBeUndefined();
    expect(scene.getObjectByName('arc-hybrid-glass-sectors')).toBeUndefined();

    const requiredNames = [
      'arc-reactor-root', 'arc-central-chamber-root', 'arc-chamber-shell', 'arc-chamber-clamps',
      'arc-aperture-inner-rim', 'arc-iris-shutter-blades', 'arc-triangular-core-mesh',
      'arc-inner-wire-triangle', 'arc-chamber-optic-glass', 'arc-outer-transparent-glass-ring',
      'arc-central-letters-logo', 'arc-rear-structural-hub', 'arc-merged-nacelles-anodizedBlack',
      'arc-asymmetric-outer-modules', 'arc-merged-outerMods-heatTintedMetal',
      'arc-merged-trenches-neonTubeMat', 'arc-merged-trenches-secondaryIndicator',
      'arc-inner-plasma-tube-0', 'arc-inner-plasma-tube-1', 'arc-inner-plasma-tube-2',
      'arc-inner-port-diode-0', 'arc-inner-port-diode-1', 'arc-inner-port-diode-2',
      'arc-vertex-light-0', 'arc-vertex-light-1', 'arc-vertex-light-2',
      'arc-clamp-light-0', 'arc-clamp-light-1', 'arc-clamp-light-2',
      'arc-conduit-runner-0', 'arc-conduit-runner-1', 'arc-conduit-runner-2',
      'arc-process-node-0', 'arc-process-node-5', 'arc-node-screen-0', 'arc-node-led-5',
      'arc-hybrid-glass-enclosure', 'arc-deep-rear-housing', 'arc-turbine-rotor-hub',
      'arc-turbine-rotor-indicators', 'arc-turbine-secondary-carrier',
      'arc-bearing-indicators-ring', 'arc-plasma-white-core', 'arc-plasma-outer-envelope',
      'arc-plasma-containment-field', 'arc-core-spill-light',
    ];
    for (const name of requiredNames) {
      expect(scene.getObjectByName(name), `Missing named object: ${name}`).toBeTruthy();
    }

    const bounds = new THREE.Box3().setFromObject(result.reactorGroup);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    expect(size.z).toBeGreaterThanOrEqual(1.8);

    const iris = scene.getObjectByName('arc-aperture-inner-rim') as THREE.Mesh;
    const core = scene.getObjectByName('arc-triangular-core-mesh') as THREE.Mesh;
    const glass = scene.getObjectByName('arc-chamber-optic-glass') as THREE.Mesh;
    expect(iris.visible).toBe(true);
    expect(iris.geometry.getAttribute('position').count).toBeGreaterThan(100);
    expect(core.visible).toBe(true);
    expect(core.geometry.getAttribute('position').count).toBeGreaterThan(20);
    expect(glass.position.z - core.position.z).toBeGreaterThanOrEqual(0.7);

    const tubeMats = [0, 1, 2].map(
      (i) => (scene.getObjectByName(`arc-inner-plasma-tube-${i}`) as THREE.Mesh).material
    );
    expect(new Set(tubeMats).size).toBe(3);

    let instancedCount = 0;
    let totalMeshes = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) instancedCount++;
      if (obj instanceof THREE.Mesh) {
        totalMeshes++;
        const pos = obj.geometry.getAttribute('position');
        const norm = obj.geometry.getAttribute('normal');
        expect(pos.count).toBeGreaterThan(0);
        if (norm) expect(Number.isFinite(norm.getX(0))).toBe(true);
      }
    });
    expect(instancedCount).toBeGreaterThanOrEqual(7);
    expect(totalMeshes).toBeLessThanOrEqual(105);

    const expectedAngles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    for (let i = 0; i < 3; i++) {
      const clamp = scene.getObjectByName(`arc-corner-clamp-${i}`) as THREE.Group;
      expect(clamp).toBeTruthy();
      expect(clamp.position.x).toBeCloseTo(Math.cos(expectedAngles[i]) * 4.46, 2);
      expect(clamp.position.y).toBeCloseTo(Math.sin(expectedAngles[i]) * 4.46, 2);
    }

    const logoGroup = scene.getObjectByName('arc-central-letters-logo') as THREE.Group;
    expect(logoGroup.position.z).toBeCloseTo(0.38, 2);

    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    const hits = raycaster.intersectObject(result.reactorGroup, true);
    const coreHitIndex = hits.findIndex((h) => h.object.name === 'arc-triangular-core-mesh');
    expect(coreHitIndex).toBeGreaterThanOrEqual(0);
    for (const hit of hits.slice(0, coreHitIndex)) {
      const meshMat = (hit.object as THREE.Mesh).material as THREE.Material;
      expect(meshMat.transparent).toBe(true);
    }

    const outerModsGroup = scene.getObjectByName('arc-asymmetric-outer-modules') as THREE.Group;
    expect(outerModsGroup).toBeTruthy();
    const outerCenter = new THREE.Vector3();
    new THREE.Box3().setFromObject(outerModsGroup).getCenter(outerCenter);
    expect(Math.abs(outerCenter.x)).toBeLessThan(0.01);
    for (const a of [Math.PI / 6, (5 * Math.PI) / 6, -Math.PI / 2]) {
      const modRay = new THREE.Raycaster(
        new THREE.Vector3(Math.cos(a) * 5.30, Math.sin(a) * 5.30, 5),
        new THREE.Vector3(0, 0, -1)
      );
      expect(modRay.intersectObject(outerModsGroup, true).length).toBeGreaterThanOrEqual(3);
    }

    expect(DEFAULT_REACTOR_CAMERA.position[0]).toBeGreaterThan(1.0);
    expect(DEFAULT_REACTOR_CAMERA.position[0]).toBeLessThan(4.0);
    expect(DEFAULT_REACTOR_CAMERA.position[1]).toBeGreaterThan(1.0);
    expect(DEFAULT_REACTOR_CAMERA.position[1]).toBeLessThan(3.0);
    expect(DEFAULT_REACTOR_CAMERA.position[2]).toBeGreaterThan(40.0);

    mats.dispose();
    registry.disposeAll();
  });

  it('scales reactor to fit fully inside portrait phone width without clipping while preserving desktop scale', () => {
    const scene = new THREE.Scene();
    const registry = new ReactorTextureRegistry();
    const bundle = registry.getBootstrapBundle(4, true);
    const mats = createReactorMaterials('crimson', bundle);
    const lighting = createReactorLighting(scene, 0xff2222);

    const result = buildReactorGeometry(scene, mats, lighting, 'high');
    result.reactorGroup.updateMatrixWorld(true);

    const extremeVertices: THREE.Vector3[] = [];
    const vTmp = new THREE.Vector3();
    const instMat = new THREE.Matrix4();
    const worldMat = new THREE.Matrix4();
    let maxRealRadiusXY = 0;

    result.reactorGroup.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
      const pos = obj.geometry.getAttribute('position');
      if (!pos) return;
      if (obj instanceof THREE.InstancedMesh) {
        for (let inst = 0; inst < obj.count; inst++) {
          obj.getMatrixAt(inst, instMat);
          worldMat.multiplyMatrices(obj.matrixWorld, instMat);
          for (let i = 0; i < pos.count; i++) {
            vTmp.fromBufferAttribute(pos, i).applyMatrix4(worldMat);
            const rXY = Math.hypot(vTmp.x, vTmp.y);
            if (rXY > maxRealRadiusXY) maxRealRadiusXY = rXY;
            if (rXY > 4.8) extremeVertices.push(vTmp.clone());
          }
        }
      } else {
        for (let i = 0; i < pos.count; i++) {
          vTmp.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
          const rXY = Math.hypot(vTmp.x, vTmp.y);
          if (rXY > maxRealRadiusXY) maxRealRadiusXY = rXY;
          if (rXY > 4.8) extremeVertices.push(vTmp.clone());
        }
      }
    });

    expect(extremeVertices.length).toBeGreaterThan(100);
    expect(maxRealRadiusXY).toBeLessThanOrEqual(5.80);

    for (const [w, h] of [[1920, 1080], [1280, 800]] as const) {
      const desktopTf = computeReactorViewportTransform({
        winW: w, winH: h, camZ: DEFAULT_REACTOR_CAMERA.position[2],
        fov: DEFAULT_REACTOR_CAMERA.fov, aspect: w / h,
        centerProp: { x: w / 2, y: h * 0.47 }, scaleProp: 1.0,
      });
      expect(desktopTf.scale).toBeCloseTo(1.10, 4);
    }

    for (const [w, h] of [[360, 800], [390, 844], [412, 915], [320, 800]] as const) {
      const aspect = w / h;
      const camera = new THREE.PerspectiveCamera(DEFAULT_REACTOR_CAMERA.fov, aspect, 0.5, 500);
      camera.position.set(...DEFAULT_REACTOR_CAMERA.position);
      camera.lookAt(...DEFAULT_REACTOR_CAMERA.target);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();

      const mobileTf = computeReactorViewportTransform({
        winW: w, winH: h, camZ: camera.position.z, fov: camera.fov,
        aspect, centerProp: { x: w / 2, y: h * 0.47 }, scaleProp: 1.0,
      });
      expect(mobileTf.scale).toBeLessThan(0.75);
      expect(mobileTf.scale).toBeGreaterThan(0.35);

      let maxAbsNdcX = 0;
      let maxAbsNdcY = 0;
      for (const v of extremeVertices) {
        vTmp.copy(v).multiplyScalar(mobileTf.scale);
        vTmp.x += mobileTf.x;
        vTmp.y += mobileTf.y;
        vTmp.project(camera);
        maxAbsNdcX = Math.max(maxAbsNdcX, Math.abs(vTmp.x));
        maxAbsNdcY = Math.max(maxAbsNdcY, Math.abs(vTmp.y));
      }

      expect(maxAbsNdcX).toBeLessThanOrEqual(0.92);
      expect(maxAbsNdcX).toBeGreaterThanOrEqual(0.80);
      expect(maxAbsNdcY).toBeLessThan(0.80);
    }

    mats.dispose();
    registry.disposeAll();
  });
});
