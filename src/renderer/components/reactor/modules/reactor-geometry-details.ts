import * as THREE from 'three';
import type { ReactorMaterials } from './reactor-materials';
import {
  ensureUv2,
  createBeveledHexagon,
  createBeveledTrapezoid,
  createChamferedRingLathe,
} from './reactor-geometry-primitives';

export { ensureUv2 };

/**
 * Adds precision industrial micro-engineering to the outer reactor envelope
 * using InstancedMesh & sculpted Lathe rings (minimal draw calls, high geometric richness):
 * - Stepped matte ceramic thermal isolation ring (dielectric vs metal break)
 * - Brushed titanium machined inner/outer bearing race lips
 * - 48 instanced precision hex bolts around perimeter flange & armor joints
 * - 36 instanced socket-head cap screws anchoring radial bulkhead struts
 * - 36 instanced copper alloy radiator heat-sink fins tucked inside 12 exhaust cowlings
 * - 12 instanced titanium glass-conduit bridge clamps straddling the outer glass ring
 */
export function buildOuterMicroDetails(
  outerEnvelope: THREE.Group,
  materials: ReactorMaterials,
  ringRadius: number
): void {
  // 1. Stepped Matte Dark Ceramic Thermal Insulator Divider Ring (Lathe)
  const ceramicRingGeo = createChamferedRingLathe(
    [
      [ringRadius - 0.44, -0.34],
      [ringRadius - 0.40, -0.18],
      [ringRadius - 0.28, -0.18],
      [ringRadius - 0.24, -0.34],
    ],
    96
  );
  const ceramicRing = new THREE.Mesh(ceramicRingGeo, materials.darkCeramic);
  ceramicRing.name = 'arc-ceramic-insulator-ring';
  ceramicRing.updateMatrix();
  ceramicRing.matrixAutoUpdate = false;
  outerEnvelope.add(ceramicRing);

  // 2. Stepped Brushed Titanium Bearing Race Lips framing the glass conduit channel
  const outerRaceGeo = createChamferedRingLathe(
    [
      [ringRadius + 0.16, -0.22],
      [ringRadius + 0.19, -0.08],
      [ringRadius + 0.25, -0.08],
      [ringRadius + 0.28, -0.18],
    ],
    96
  );
  const outerRace = new THREE.Mesh(outerRaceGeo, materials.brushedTitanium);
  outerRace.name = 'arc-armor-step-ring';
  outerRace.updateMatrix();
  outerRace.matrixAutoUpdate = false;
  outerEnvelope.add(outerRace);

  // 3. Inner Recessed Ceramic Structural Flange grounding the central chamber hub
  const innerFlangeGeo = createChamferedRingLathe(
    [
      [2.16, -0.34],
      [2.20, -0.20],
      [2.56, -0.20],
      [2.62, -0.34],
    ],
    64
  );
  const innerFlange = new THREE.Mesh(innerFlangeGeo, materials.darkCeramic);
  innerFlange.name = 'arc-inner-flange-ring';
  innerFlange.updateMatrix();
  innerFlange.matrixAutoUpdate = false;
  outerEnvelope.add(innerFlange);

  const dummy = new THREE.Object3D();

  // 4. 48 Instanced Precision Hex Fasteners (24 outer flange + 24 armor sector perimeter)
  const boltGeo = createBeveledHexagon(0.052, 0.055, 0.012, 0.012);
  const boltInst = new THREE.InstancedMesh(boltGeo, materials.brushedTitanium, 48);
  boltInst.name = 'arc-instanced-hex-bolts';

  let boltIdx = 0;
  for (let i = 0; i < 24; i++) {
    const angle = ((Math.PI * 2) / 24) * i + Math.PI / 24;
    const rOuter = ringRadius + 0.34;
    dummy.position.set(Math.cos(angle) * rOuter, Math.sin(angle) * rOuter, -0.12);
    dummy.rotation.set(0, 0, angle);
    dummy.scale.setScalar(1.0);
    dummy.updateMatrix();
    boltInst.setMatrixAt(boltIdx++, dummy.matrix);
  }
  for (let i = 0; i < 24; i++) {
    const angle = ((Math.PI * 2) / 24) * i + Math.PI / 48;
    const rMid = ringRadius - 0.56;
    dummy.position.set(Math.cos(angle) * rMid, Math.sin(angle) * rMid, -0.20);
    dummy.rotation.set(0, 0, angle);
    dummy.scale.setScalar(0.82);
    dummy.updateMatrix();
    boltInst.setMatrixAt(boltIdx++, dummy.matrix);
  }
  boltInst.instanceMatrix.needsUpdate = true;
  boltInst.computeBoundingSphere();
  boltInst.updateMatrix();
  boltInst.matrixAutoUpdate = false;
  outerEnvelope.add(boltInst);

  // 5. 36 Instanced Socket-Head Screws along the 6 radial bulkhead struts
  const screwGeo = new THREE.CylinderGeometry(0.036, 0.042, 0.06, 8);
  screwGeo.rotateX(Math.PI / 2);
  ensureUv2(screwGeo);
  const screwInst = new THREE.InstancedMesh(screwGeo, materials.ringFrameMat, 36);
  screwInst.name = 'arc-instanced-strut-screws';

  let screwIdx = 0;
  const radii = [3.15, 4.05, 4.78];
  for (let s = 0; s < 6; s++) {
    const baseAngle = (Math.PI / 3) * s + Math.PI / 6;
    for (const r of radii) {
      for (let side = -1; side <= 1; side += 2) {
        const perp = baseAngle + Math.PI / 2;
        const x = Math.cos(baseAngle) * r + Math.cos(perp) * side * 0.14;
        const y = Math.sin(baseAngle) * r + Math.sin(perp) * side * 0.14;
        dummy.position.set(x, y, -0.05);
        dummy.rotation.set(0, 0, baseAngle);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        screwInst.setMatrixAt(screwIdx++, dummy.matrix);
      }
    }
  }
  screwInst.instanceMatrix.needsUpdate = true;
  screwInst.computeBoundingSphere();
  screwInst.updateMatrix();
  screwInst.matrixAutoUpdate = false;
  outerEnvelope.add(screwInst);

  // 6. 36 Instanced Copper Alloy Heat-Sink Radiator Fins (3 per exhaust cowling x 12)
  const finGeo = createBeveledTrapezoid(0.28, 0.22, 0.032, 0.20, 0.006, 0.006);
  const finInst = new THREE.InstancedMesh(finGeo, materials.copperWinding, 36);
  finInst.name = 'arc-instanced-copper-fins';

  let finIdx = 0;
  for (let i = 0; i < 12; i++) {
    const nAngle = ((Math.PI * 2) / 12) * i;
    for (let k = -1; k <= 1; k++) {
      const offsetAngle = nAngle + k * 0.026;
      const r = 4.98;
      dummy.position.set(Math.cos(offsetAngle) * r, Math.sin(offsetAngle) * r, -0.22);
      dummy.rotation.set(0, 0, nAngle);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      finInst.setMatrixAt(finIdx++, dummy.matrix);
    }
  }
  finInst.instanceMatrix.needsUpdate = true;
  finInst.computeBoundingSphere();
  finInst.updateMatrix();
  finInst.matrixAutoUpdate = false;
  outerEnvelope.add(finInst);

  // 7. 12 Instanced Brushed Titanium Conduit Bridge Clamps straddling the outer optical glass ring
  const clampGeo = createBeveledTrapezoid(0.46, 0.36, 0.14, 0.11, 0.018, 0.018);
  const clampInst = new THREE.InstancedMesh(clampGeo, materials.brushedTitanium, 12);
  clampInst.name = 'arc-instanced-glass-clamps';

  for (let i = 0; i < 12; i++) {
    const a = ((Math.PI * 2) / 12) * i + Math.PI / 12;
    dummy.position.set(Math.cos(a) * ringRadius, Math.sin(a) * ringRadius, 0.03);
    dummy.rotation.set(0, 0, a);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    clampInst.setMatrixAt(i, dummy.matrix);
  }
  clampInst.instanceMatrix.needsUpdate = true;
  clampInst.computeBoundingSphere();
  clampInst.updateMatrix();
  clampInst.matrixAutoUpdate = false;
  outerEnvelope.add(clampInst);
}

const SHADOW_CASTER_NAMES = new Set<string>([
  'arc-base-plate',
  'arc-outer-containment-ring',
  'arc-merged-armor-sectors',
  'arc-merged-radial-struts-anodized',
  'arc-merged-radial-struts-titanium',
  'arc-armor-step-ring',
  'arc-ceramic-insulator-ring',
  'arc-merged-trenches-anodizedBlack',
  'arc-merged-trenches-darkCarbon',
  'arc-merged-trenches-darkCeramic',
  'arc-merged-trenches-brushedTitanium',
  'arc-merged-trenches-ringFrameMat',
  'arc-merged-clamps-anodizedBlack',
  'arc-merged-clamps-brushedTitanium',
  'arc-merged-clamps-darkCarbon',
  'arc-merged-clamps-darkCeramic',
  'arc-merged-nozzles-heatTintedMetal',
  'arc-merged-nozzles-brushedTitanium',
  'arc-merged-chamber-anodizedBlack',
  'arc-merged-chamber-brushedTitanium',
  'arc-merged-chamber-darkCarbon',
  'arc-merged-chamber-darkCeramic',
  'arc-merged-processNodes-brushedTitanium',
  'arc-merged-processNodes-anodizedBlack',
]);

const SHADOW_RECEIVER_ONLY_NAMES = new Set<string>([
  'arc-bulkhead-deck-carbon',
  'arc-inner-flange-ring',
  'arc-instanced-collars',
  'arc-instanced-collar-slots',
  'arc-instanced-pistons',
  'arc-instanced-hex-bolts',
  'arc-instanced-strut-screws',
  'arc-instanced-copper-fins',
  'arc-instanced-glass-clamps',
  'arc-aperture-inner-rim',
  'arc-turbine-primary-blades',
  'arc-turbine-secondary-stator',
]);

/**
 * Configures selective shadows: ONLY heavy opaque structural meshes cast & receive shadows.
 * Glass, emissive tubes, particles, HUD planes, and runners NEVER cast shadows.
 */
export function applySelectiveShadowFlags(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const isTransparentOrUnlit =
      !mat ||
      mat.transparent ||
      mat instanceof THREE.MeshBasicMaterial ||
      obj.name.includes('neonTube') ||
      obj.name.includes('glass') ||
      obj.name.includes('runner') ||
      obj.name.includes('diode') ||
      obj.name.includes('hud');

    if (isTransparentOrUnlit) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      return;
    }

    if (SHADOW_CASTER_NAMES.has(obj.name)) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    } else if (SHADOW_RECEIVER_ONLY_NAMES.has(obj.name)) {
      obj.castShadow = false;
      obj.receiveShadow = true;
    } else {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
}
