import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_REACTOR_CAMERA } from './reactor-stage1-diagnostics';
import { createReactorMaterials } from './reactor-materials';
import { createReactorLighting } from './reactor-lighting';
import { buildReactorGeometry } from './reactor-geometry';
import { AUDIT_RES, runOfflineZBufferAudit } from './reactor-lookdev-zbuffer.helper';

function ensureCanvasStub(): void {
  if (typeof globalThis.document !== 'undefined') return;
  const ctx = new Proxy(
    {
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
    },
    { get: (t, p) => (p in t ? (t as any)[p] : () => {}) }
  );
  (globalThis as any).document = {
    createElement: () => ({ width: 256, height: 256, getContext: () => ctx }),
  };
}

function makeTestCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(90, 1.0, 1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  return cam;
}

describe('ARC-055 — Offline 512x512 Software Z-Buffer & Structural Visibility Audit', () => {
  beforeEach(() => ensureCanvasStub());

  it('1. passes all 10 deterministic synthetic rasterization & depth-semantics unit tests (Section 6.5)', () => {
    const cam = makeTestCamera();
    const mA = new THREE.MeshStandardMaterial();
    const mB = new THREE.MeshStandardMaterial();
    const res = 64;

    // Case 1: Adjacent triangles sharing an edge — zero double coverage or cracks
    const s1 = new THREE.Scene();
    s1.add(new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mA));
    const r1 = runOfflineZBufferAudit(s1, cam, [mA], res);
    expect(r1.pixelCounts[0]).toBe(r1.totalCoveredPixels);
    expect(r1.totalCoveredPixels).toBeGreaterThan(600);
    for (let y = 26; y <= 38; y++) {
      for (let x = 26; x <= 38; x++) expect(r1.materialBuffer[y * res + x]).toBe(0);
    }

    // Case 2: Overlapping triangles at different depths — nearer material wins
    const s2 = new THREE.Scene();
    const farMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mA);
    farMesh.position.z = -1;
    const nearMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mB);
    nearMesh.position.z = 1;
    s2.add(nearMesh, farMesh);
    const r2 = runOfflineZBufferAudit(s2, cam, [mA, mB], res);
    expect(r2.pixelCounts[0]).toBe(0);
    expect(r2.pixelCounts[1]).toBe(r2.totalCoveredPixels);

    // Case 3: Equal-depth overlapping triangles — Three.js LessEqualDepth allows later draw to pass
    const s3 = new THREE.Scene();
    expect(mA.depthFunc).toBe(THREE.LessEqualDepth);
    s3.add(new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mA), new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mB));
    const r3 = runOfflineZBufferAudit(s3, cam, [mA, mB], res);
    expect(r3.pixelCounts[0]).toBe(0);
    expect(r3.pixelCounts[1]).toBeGreaterThan(600);

    // Case 4: Triangle crossing the near clipping plane (camera z=5, near=1 -> plane z=4)
    const s4 = new THREE.Scene();
    const g4 = new THREE.BufferGeometry();
    g4.setAttribute('position', new THREE.Float32BufferAttribute([-2, -2, 3, 2, -2, 3, 0, 2, 6], 3));
    s4.add(new THREE.Mesh(g4, mA));
    const r4 = runOfflineZBufferAudit(s4, cam, [mA], res);
    expect(r4.totalCoveredPixels).toBeGreaterThan(100);

    // Case 5: Hidden parent with visible child — zero structural coverage
    const s5 = new THREE.Scene();
    const hiddenParent = new THREE.Group();
    hiddenParent.visible = false;
    const visChild = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mA);
    visChild.visible = true;
    hiddenParent.add(visChild);
    s5.add(hiddenParent);
    const r5 = runOfflineZBufferAudit(s5, cam, [mA], res);
    expect(r5.totalCoveredPixels).toBe(0);
    expect(r5.totalSurfaceArea).toBe(0);

    // Case 6: InstancedMesh with multiple transforms
    const s6 = new THREE.Scene();
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), mA, 2);
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 0, 0));
    inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, 0));
    s6.add(inst);
    const r6 = runOfflineZBufferAudit(s6, cam, [mA], res);
    expect(r6.totalSurfaceArea).toBeCloseTo(8, 4);
    expect(r6.totalCoveredPixels).toBeGreaterThan(200);

    // Case 7: Multi-material geometry with non-zero materialIndex
    const s7 = new THREE.Scene();
    const g7 = new THREE.PlaneGeometry(4, 4);
    g7.clearGroups();
    g7.addGroup(0, 3, 0);
    g7.addGroup(3, 3, 1);
    s7.add(new THREE.Mesh(g7, [mA, mB]));
    const r7 = runOfflineZBufferAudit(s7, cam, [mA, mB], res);
    expect(r7.pixelCounts[0]).toBeGreaterThan(200);
    expect(r7.pixelCounts[1]).toBeGreaterThan(200);
    expect(r7.pixelCounts[0] + r7.pixelCounts[1]).toBe(r7.totalCoveredPixels);

    // Case 8: Material-array geometry without groups draws nothing
    const s8 = new THREE.Scene();
    const g8 = new THREE.PlaneGeometry(4, 4);
    g8.clearGroups();
    s8.add(new THREE.Mesh(g8, [mA, mB]));
    const r8 = runOfflineZBufferAudit(s8, cam, [mA, mB], res);
    expect(r8.totalCoveredPixels).toBe(0);

    // Case 9: drawRange excluding part of a geometry
    const s9 = new THREE.Scene();
    const g9 = new THREE.PlaneGeometry(4, 4);
    g9.setDrawRange(0, 3);
    s9.add(new THREE.Mesh(g9, mA));
    const r9 = runOfflineZBufferAudit(s9, cam, [mA], res);
    expect(r9.totalSurfaceArea).toBeCloseTo(8, 4);
    expect(r9.totalCoveredPixels).toBeLessThan(r1.totalCoveredPixels);

    // Case 10: depthTest=false and depthWrite=false behavior
    const mNoWrite = new THREE.MeshStandardMaterial({ depthWrite: false });
    const mNoTest = new THREE.MeshStandardMaterial({ depthTest: false });
    const s10 = new THREE.Scene();
    // Smaller front plane (projected half-size 1/4=0.25) fully inside midOpaque (2/5=0.40)
    const frontNoWrite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mNoWrite);
    frontNoWrite.position.z = 1;
    const midOpaque = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mA);
    midOpaque.position.z = 0;
    const farNoTest = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mNoTest);
    farNoTest.position.z = -1;
    s10.add(frontNoWrite, midOpaque, farNoTest);
    const r10 = runOfflineZBufferAudit(s10, cam, [mNoWrite, mA, mNoTest], res);
    expect(r10.pixelCounts[0]).toBe(0); // Overwritten by midOpaque because depthWrite=false left depth=1.0
    expect(r10.pixelCounts[1]).toBeGreaterThan(300);
    expect(r10.pixelCounts[2]).toBeGreaterThanOrEqual(100); // Passes despite z=-1 because depthTest=false
  });

  it('2. reconciles full-reactor 512x512 structural visibility, 3D surface area, and brushedTitanium non-expansion', () => {
    const scene = new THREE.Scene();
    const mats = createReactorMaterials('crimson', null);
    const lighting = createReactorLighting(scene, 0xff2222);
    buildReactorGeometry(scene, mats, lighting, 'high');

    const structuralMats = [
      mats.darkCarbon,
      mats.darkCeramic,
      mats.anodizedBlack,
      mats.heatTintedMetal,
      mats.ringFrameMat,
      mats.brushedTitanium,
      mats.copperWinding,
    ];
    const names = [
      'darkCarbon',
      'darkCeramic',
      'anodizedBlack',
      'heatTintedMetal',
      'ringFrameMat',
      'brushedTitanium',
      'copperWinding',
    ];

    // Explicitly verify all 7 structural opaque materials use standard opaque depth semantics
    for (const m of structuralMats) {
      expect(m.transparent).toBe(false);
      expect(m.depthTest).toBe(true);
      expect(m.depthWrite).toBe(true);
      expect(m.depthFunc).toBe(THREE.LessEqualDepth);
    }

    const camera = new THREE.PerspectiveCamera(DEFAULT_REACTOR_CAMERA.fov, 1.0, 0.5, 500);
    camera.position.set(...DEFAULT_REACTOR_CAMERA.position);
    camera.lookAt(...DEFAULT_REACTOR_CAMERA.target);

    const audit = runOfflineZBufferAudit(scene, camera, structuralMats, AUDIT_RES);
    const byName = Object.fromEntries(
      names.map((n, i) => [n, { area: Number(audit.surfaceAreas[i].toFixed(2)), px: audit.pixelCounts[i] }])
    );

    // Exact structural pixel reconciliation (Section 7.1)
    const pixelSum = audit.pixelCounts.reduce((a, b) => a + b, 0);
    expect(pixelSum).toBe(audit.totalCoveredPixels);
    expect(audit.totalCoveredPixels).toBeGreaterThan(70000);

    // Verify ARC-055 structural material assignments + ARC-056 central emitter cradle widening (innerR 0.42->0.62) & jaw clearance delta
    expect(byName.anodizedBlack.area).toBeCloseTo(466.68, 1);
    expect(byName.ringFrameMat.area).toBeGreaterThan(187.5);
    expect(byName.ringFrameMat.area).toBeLessThan(188.5);
    expect(byName.anodizedBlack.px).toBeGreaterThan(38000);
    expect(byName.ringFrameMat.px).toBeGreaterThan(20444);

    // Verify Brushed Titanium did NOT expand beyond approved baseline assignments
    expect(byName.brushedTitanium.area).toBeCloseTo(17.34, 1);
    expect(byName.brushedTitanium.px).toBeLessThanOrEqual(4149);
    expect(audit.totalSurfaceArea).toBeGreaterThan(840.0);
    expect(audit.totalSurfaceArea).toBeLessThan(842.0);

    mats.dispose();
  });
});
