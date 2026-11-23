import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Ensures `uv2` exists on any BufferGeometry so PBR `aoMap` samples properly.
 */
export function ensureUv2(geo: THREE.BufferGeometry | null | undefined): void {
  if (!geo) return;
  const uv = geo.getAttribute('uv');
  if (uv && !geo.getAttribute('uv2')) {
    geo.setAttribute('uv2', uv.clone());
  }
}

/**
 * Generates clean box-projected world-scale UVs for ExtrudeGeometry and custom solids
 * so beveled edges, sidewalls, and front faces all sample PBR maps at uniform physical scale
 * without stretching.
 */
export function applyBoxProjectedUvs(geo: THREE.BufferGeometry, uvScale = 0.35): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  if (!pos || !norm) return geo;

  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(norm.getX(i));
    const ay = Math.abs(norm.getY(i));
    const az = Math.abs(norm.getZ(i));

    let u: number;
    let v: number;
    if (az >= ax && az >= ay) {
      u = x * uvScale;
      v = y * uvScale;
    } else if (ax >= ay && ax >= az) {
      u = z * uvScale;
      v = y * uvScale;
    } else {
      u = x * uvScale;
      v = z * uvScale;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));
  return geo;
}

/**
 * Creates a centered, beveled curved arc sector plate in the XY plane (extruded along Z).
 * Used for segmented anodized titanium armor plates and recessed bulkhead sectors.
 */
export function createBeveledArcSector(
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
  depth: number,
  bevelSize = 0.045,
  bevelThickness = 0.045,
  curveSegments = 20
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(startAngle) * outerR, Math.sin(startAngle) * outerR);
  shape.absarc(0, 0, outerR, startAngle, endAngle, false);
  shape.lineTo(Math.cos(endAngle) * innerR, Math.sin(endAngle) * innerR);
  shape.absarc(0, 0, innerR, endAngle, startAngle, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return applyBoxProjectedUvs(geo, 0.24);
}

/**
 * Creates a centered, beveled tapered trapezoid plate/block in the XY plane (extruded along Z).
 * Ideal for radial load-bearing struts, containment clamp pylons, exhaust cowlings, and bridge arches.
 */
export function createBeveledTrapezoid(
  bottomW: number,
  topW: number,
  height: number,
  depth: number,
  bevelSize = 0.04,
  bevelThickness = 0.04
): THREE.BufferGeometry {
  const hwBot = bottomW * 0.5;
  const hwTop = topW * 0.5;
  const hh = height * 0.5;

  const shape = new THREE.Shape();
  shape.moveTo(-hwBot, -hh);
  shape.lineTo(hwBot, -hh);
  shape.lineTo(hwTop, hh);
  shape.lineTo(-hwTop, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return applyBoxProjectedUvs(geo, 0.35);
}

/**
 * Creates a centered, beveled regular hexagon in the XY plane (extruded along Z).
 */
export function createBeveledHexagon(
  radius: number,
  depth: number,
  bevelSize = 0.03,
  bevelThickness = 0.03
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return applyBoxProjectedUvs(geo, 0.5);
}

/**
 * Builds an equilateral triangle path pointing downwards by default (vertices at -90°, 30°, 150°).
 */
function buildTrianglePoints(radius: number, rotationOffset = -Math.PI / 2): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 3; i++) {
    const a = rotationOffset + ((Math.PI * 2) / 3) * i;
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

/**
 * Creates a hollow beveled equilateral triangular frame (chassis, precision bezel, ceramic liner, or iris).
 */
export function createBeveledTriangleFrame(
  outerR: number,
  innerR: number,
  depth: number,
  bevelSize = 0.035,
  bevelThickness = 0.035,
  rotationOffset = -Math.PI / 2
): THREE.BufferGeometry {
  const outerPts = buildTrianglePoints(outerR, rotationOffset);
  const shape = new THREE.Shape();
  shape.moveTo(outerPts[0].x, outerPts[0].y);
  shape.lineTo(outerPts[1].x, outerPts[1].y);
  shape.lineTo(outerPts[2].x, outerPts[2].y);
  shape.closePath();

  const innerPts = buildTrianglePoints(innerR, rotationOffset);
  const hole = new THREE.Path();
  // Reverse winding for hole
  hole.moveTo(innerPts[0].x, innerPts[0].y);
  hole.lineTo(innerPts[2].x, innerPts[2].y);
  hole.lineTo(innerPts[1].x, innerPts[1].y);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return applyBoxProjectedUvs(geo, 0.35);
}

/**
 * Creates a solid beveled equilateral triangular plate (e.g., recessed cavity floor or optical window).
 */
export function createBeveledTriangleSolid(
  radius: number,
  depth: number,
  bevelSize = 0.025,
  bevelThickness = 0.025,
  rotationOffset = -Math.PI / 2
): THREE.BufferGeometry {
  const pts = buildTrianglePoints(radius, rotationOffset);
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  shape.lineTo(pts[1].x, pts[1].y);
  shape.lineTo(pts[2].x, pts[2].y);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return applyBoxProjectedUvs(geo, 0.4);
}

/**
 * Creates a machined stepped ring via LatheGeometry aligned to the Reactor XY plane (revolved around Z).
 * Profile points are specified as (radius, zHeight).
 */
export function createChamferedRingLathe(
  profilePoints: Array<[number, number]>,
  radialSegments = 72
): THREE.BufferGeometry {
  const pts = profilePoints.map(([r, z]) => new THREE.Vector2(r, z));
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  // Lathe revolves around Y; rotate X by +PI/2 so Y maps to +Z
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return applyBoxProjectedUvs(geo, 0.22);
}

/**
 * Merges a batch of static meshes sharing one material into a single draw call.
 * Handles mixed indexed/non-indexed geometries safely, guarantees uv/uv2,
 * bakes matrixWorld, and strictly disposes all intermediate source geometries.
 */
export function mergeGeometryBatch(
  meshes: THREE.Mesh[],
  material: THREE.Material,
  targetParent: THREE.Object3D,
  name: string
): THREE.Mesh | null {
  if (meshes.length === 0) return null;

  const geos: THREE.BufferGeometry[] = [];
  for (const mesh of meshes) {
    const raw = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    raw.applyMatrix4(mesh.matrixWorld);

    if (!raw.getAttribute('normal')) {
      raw.computeVertexNormals();
    }
    const pos = raw.getAttribute('position');
    if (pos && !raw.getAttribute('uv')) {
      applyBoxProjectedUvs(raw, 0.35);
    } else {
      ensureUv2(raw);
    }

    // Keep only position, normal, uv, uv2 so mergeGeometries never fails on mismatched extras
    for (const attrName of Object.keys(raw.attributes)) {
      if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv' && attrName !== 'uv2') {
        raw.deleteAttribute(attrName);
      }
    }
    geos.push(raw);
  }

  const mergedGeo = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());

  const disposedOriginals = new Set<THREE.BufferGeometry>();
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    if (mesh.geometry && !disposedOriginals.has(mesh.geometry)) {
      disposedOriginals.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  }

  if (!mergedGeo) return null;

  ensureUv2(mergedGeo);
  const mergedMesh = new THREE.Mesh(mergedGeo, material);
  mergedMesh.name = name;
  mergedMesh.updateMatrix();
  mergedMesh.matrixAutoUpdate = false;
  targetParent.add(mergedMesh);
  return mergedMesh;
}
