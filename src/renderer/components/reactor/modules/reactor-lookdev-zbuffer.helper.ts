import * as THREE from 'three';

export const AUDIT_RES = 512;
const AREA_EPS = 1e-10;

interface DrawSlice {
  start: number;
  count: number;
  material: THREE.Material;
  matId: number;
}

interface ClipVertex {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface OfflineAuditResult {
  pixelCounts: number[];
  totalCoveredPixels: number;
  surfaceAreas: number[];
  totalSurfaceArea: number;
  materialBuffer: Int16Array;
  depthBuffer: Float32Array;
}

function isObjectAndAncestorsVisible(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

/** Three.js-compatible draw-slice resolution honoring drawRange, groups, single vs array materials, and visibility. */
function resolveDrawSlices(mesh: THREE.Mesh, matIds: Map<THREE.Material, number>): DrawSlice[] {
  if (!isObjectAndAncestorsVisible(mesh)) return [];
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return [];
  const totalVerts = geo.index ? geo.index.count : pos.count;
  const rangeStart = Math.max(0, geo.drawRange.start);
  const rangeEnd = Math.min(totalVerts, rangeStart + geo.drawRange.count);
  if (rangeEnd - rangeStart < 3) return [];

  const slices: DrawSlice[] = [];
  if (!Array.isArray(mesh.material)) {
    const mat = mesh.material;
    const matId = mat && mat.visible ? matIds.get(mat) : undefined;
    if (mat && matId !== undefined) {
      slices.push({ start: rangeStart, count: rangeEnd - rangeStart, material: mat, matId });
    }
    return slices;
  }

  // Material-array mesh uses geometry.groups exclusively; ungrouped material arrays draw nothing.
  for (const group of geo.groups) {
    if (group.materialIndex === undefined || group.materialIndex < 0 || group.materialIndex >= mesh.material.length) {
      continue;
    }
    const mat = mesh.material[group.materialIndex];
    const matId = mat && mat.visible ? matIds.get(mat) : undefined;
    if (!mat || matId === undefined) continue;
    const s = Math.max(rangeStart, group.start);
    const e = Math.min(rangeEnd, group.start + group.count);
    if (e - s >= 3) slices.push({ start: s, count: e - s, material: mat, matId });
  }
  return slices;
}

function passesDepthFunc(depthFunc: THREE.DepthModes, zFrag: number, zBuf: number): boolean {
  switch (depthFunc) {
    case THREE.NeverDepth: return false;
    case THREE.AlwaysDepth: return true;
    case THREE.LessDepth: return zFrag < zBuf;
    case THREE.LessEqualDepth: return zFrag <= zBuf;
    case THREE.EqualDepth: return zFrag === zBuf;
    case THREE.GreaterEqualDepth: return zFrag >= zBuf;
    case THREE.GreaterDepth: return zFrag > zBuf;
    case THREE.NotEqualDepth: return zFrag !== zBuf;
    default: throw new Error(`Unsupported depthFunc: ${String(depthFunc)}`);
  }
}

const CLIP_PLANES: ReadonlyArray<(v: ClipVertex) => number> = [
  (v) => v.x + v.w, // Left
  (v) => v.w - v.x, // Right
  (v) => v.y + v.w, // Bottom
  (v) => v.w - v.y, // Top
  (v) => v.z + v.w, // Near
  (v) => v.w - v.z, // Far
];

function clipPolygonFrustum(initial: ClipVertex[]): ClipVertex[] {
  let poly = initial;
  for (const evalPlane of CLIP_PLANES) {
    if (poly.length < 3) return [];
    const out: ClipVertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = evalPlane(a);
      const db = evalPlane(b);
      const aIn = da >= 0;
      const bIn = db >= 0;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        const denom = da - db;
        const t = Math.abs(denom) > 1e-12 ? da / denom : 0;
        out.push({
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y),
          z: a.z + t * (b.z - a.z),
          w: a.w + t * (b.w - a.w),
        });
      }
    }
    poly = out;
  }
  return poly.length >= 3 ? poly : [];
}

function isTopLeftEdge(ax: number, ay: number, bx: number, by: number): boolean {
  return (by === ay && bx > ax) || by < ay;
}

/**
 * Test-only offline software Z-Buffer and world-space geometric surface-area auditor.
 * Reproduces Three.js drawRange, groups, InstancedMesh, 6-plane clipping, top-left coverage,
 * window-space depth (0.5*z_ndc + 0.5), and material depthTest/depthWrite/depthFunc semantics.
 */
export function runOfflineZBufferAudit(
  root: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  orderedMaterials: THREE.Material[],
  resolution = AUDIT_RES
): OfflineAuditResult {
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const matIds = new Map<THREE.Material, number>();
  orderedMaterials.forEach((m, idx) => matIds.set(m, idx));

  const viewProj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const depthBuffer = new Float32Array(resolution * resolution).fill(1.0);
  const materialBuffer = new Int16Array(resolution * resolution).fill(-1);
  const surfaceAreas = new Array<number>(orderedMaterials.length).fill(0);

  const instMat = new THREE.Matrix4();
  const worldMat = new THREE.Matrix4();
  const mvp = new THREE.Matrix4();
  const wA = new THREE.Vector3();
  const wB = new THREE.Vector3();
  const wC = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const cr = new THREE.Vector3();
  const c4 = new THREE.Vector4();

  const toClip = (vx: number, vy: number, vz: number, m: THREE.Matrix4): ClipVertex => {
    c4.set(vx, vy, vz, 1).applyMatrix4(m);
    return { x: c4.x, y: c4.y, z: c4.z, w: c4.w };
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const slices = resolveDrawSlices(obj, matIds);
    if (slices.length === 0) return;

    const geo = obj.geometry;
    const pos = geo.getAttribute('position');
    const idxAttr = geo.index;
    const isInstanced = obj instanceof THREE.InstancedMesh;
    const instanceCount = isInstanced ? obj.count : 1;

    for (let inst = 0; inst < instanceCount; inst++) {
      if (isInstanced) {
        obj.getMatrixAt(inst, instMat);
        worldMat.multiplyMatrices(obj.matrixWorld, instMat);
      } else {
        worldMat.copy(obj.matrixWorld);
      }
      mvp.multiplyMatrices(viewProj, worldMat);

      for (const slice of slices) {
        const mat = slice.material;
        const triCount = Math.floor(slice.count / 3);
        for (let t = 0; t < triCount; t++) {
          const base = slice.start + t * 3;
          const i0 = idxAttr ? idxAttr.getX(base) : base;
          const i1 = idxAttr ? idxAttr.getX(base + 1) : base + 1;
          const i2 = idxAttr ? idxAttr.getX(base + 2) : base + 2;

          // 1. World-space geometric surface area (strictly separate from projected pixels)
          wA.fromBufferAttribute(pos, i0).applyMatrix4(worldMat);
          wB.fromBufferAttribute(pos, i1).applyMatrix4(worldMat);
          wC.fromBufferAttribute(pos, i2).applyMatrix4(worldMat);
          e1.subVectors(wB, wA);
          e2.subVectors(wC, wA);
          const area3d = 0.5 * cr.crossVectors(e1, e2).length();
          if (area3d >= AREA_EPS) surfaceAreas[slice.matId] += area3d;

          // 2. Homogeneous 6-plane Sutherland-Hodgman clipping + fan triangulation
          const clipped = clipPolygonFrustum([
            toClip(pos.getX(i0), pos.getY(i0), pos.getZ(i0), mvp),
            toClip(pos.getX(i1), pos.getY(i1), pos.getZ(i1), mvp),
            toClip(pos.getX(i2), pos.getY(i2), pos.getZ(i2), mvp),
          ]);
          if (clipped.length < 3) continue;

          for (let k = 1; k < clipped.length - 1; k++) {
            const p0 = clipped[0];
            const p1 = clipped[k];
            const p2 = clipped[k + 1];
            if (p0.w <= 1e-8 || p1.w <= 1e-8 || p2.w <= 1e-8) continue;

            let x0 = ((p0.x / p0.w) * 0.5 + 0.5) * resolution;
            let y0 = (0.5 - (p0.y / p0.w) * 0.5) * resolution;
            let z0 = 0.5 * (p0.z / p0.w) + 0.5;
            let x1 = ((p1.x / p1.w) * 0.5 + 0.5) * resolution;
            let y1 = (0.5 - (p1.y / p1.w) * 0.5) * resolution;
            let z1 = 0.5 * (p1.z / p1.w) + 0.5;
            let x2 = ((p2.x / p2.w) * 0.5 + 0.5) * resolution;
            let y2 = (0.5 - (p2.y / p2.w) * 0.5) * resolution;
            let z2 = 0.5 * (p2.z / p2.w) + 0.5;

            const areaScr = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
            if (Math.abs(areaScr) < 1e-10) continue;
            const isFront = areaScr < 0;
            if (mat.side === THREE.FrontSide && !isFront) continue;
            if (mat.side === THREE.BackSide && isFront) continue;

            let areaPos = areaScr;
            if (areaScr < 0) {
              const tx = x1; x1 = x2; x2 = tx;
              const ty = y1; y1 = y2; y2 = ty;
              const tz = z1; z1 = z2; z2 = tz;
              areaPos = -areaScr;
            }

            const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
            const maxX = Math.min(resolution - 1, Math.floor(Math.max(x0, x1, x2)));
            const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
            const maxY = Math.min(resolution - 1, Math.floor(Math.max(y0, y1, y2)));

            const tl0 = isTopLeftEdge(x1, y1, x2, y2);
            const tl1 = isTopLeftEdge(x2, y2, x0, y0);
            const tl2 = isTopLeftEdge(x0, y0, x1, y1);
            const invArea = 1 / areaPos;

            for (let py = minY; py <= maxY; py++) {
              const sy = py + 0.5;
              for (let px = minX; px <= maxX; px++) {
                const sx = px + 0.5;
                const w0 = (x2 - x1) * (sy - y1) - (y2 - y1) * (sx - x1);
                const w1 = (x0 - x2) * (sy - y2) - (y0 - y2) * (sx - x2);
                const w2 = (x1 - x0) * (sy - y0) - (y1 - y0) * (sx - x0);
                if (
                  (w0 > 0 || (w0 === 0 && tl0)) &&
                  (w1 > 0 || (w1 === 0 && tl1)) &&
                  (w2 > 0 || (w2 === 0 && tl2))
                ) {
                  const zWin = Math.fround((w0 * z0 + w1 * z1 + w2 * z2) * invArea);
                  const pIdx = py * resolution + px;
                  if (!mat.depthTest || passesDepthFunc(mat.depthFunc, zWin, depthBuffer[pIdx])) {
                    materialBuffer[pIdx] = slice.matId;
                    if (mat.depthWrite) depthBuffer[pIdx] = zWin;
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  const pixelCounts = new Array<number>(orderedMaterials.length).fill(0);
  let totalCoveredPixels = 0;
  for (let i = 0; i < materialBuffer.length; i++) {
    const id = materialBuffer[i];
    if (id >= 0) {
      pixelCounts[id]++;
      totalCoveredPixels++;
    }
  }
  const totalSurfaceArea = surfaceAreas.reduce((a, b) => a + b, 0);
  return { pixelCounts, totalCoveredPixels, surfaceAreas, totalSurfaceArea, materialBuffer, depthBuffer };
}
