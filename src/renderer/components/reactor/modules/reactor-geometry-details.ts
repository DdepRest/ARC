import * as THREE from 'three';
import type { ReactorMaterials } from './reactor-materials';

/**
 * Ensures `uv2` attribute exists on BufferGeometry so Three.js PBR `aoMap`
 * samples correctly across procedural primitives and merged structural meshes.
 */
export function ensureUv2(geo: THREE.BufferGeometry | null | undefined): void {
  if (!geo) return;
  const uv = geo.getAttribute('uv');
  if (uv && !geo.getAttribute('uv2')) {
    geo.setAttribute('uv2', uv.clone());
  }
}

/**
 * Adds precision industrial micro-detailing to the outer reactor envelope
 * using InstancedMesh & static meshes (only +4 draw calls total):
 * - Matte dark ceramic insulator divider ring (dielectric vs metallic contrast)
 * - Outer stepped obsidian armor lip
 * - 24 instanced brushed titanium hex fasteners around perimeter flange
 * - 24 instanced copper cooling heat-sink ribs flanking nozzle ports
 */
export function buildOuterMicroDetails(
  outerEnvelope: THREE.Group,
  materials: ReactorMaterials,
  ringRadius: number
): void {
  // 1. Matte dark ceramic thermal insulator divider ring
  const ceramicRingGeo = new THREE.TorusGeometry(ringRadius - 0.34, 0.045, 14, 96);
  ensureUv2(ceramicRingGeo);
  const ceramicRing = new THREE.Mesh(ceramicRingGeo, materials.darkCeramic);
  ceramicRing.name = 'arc-ceramic-insulator-ring';
  ceramicRing.position.z = -0.22;
  ceramicRing.updateMatrix();
  ceramicRing.matrixAutoUpdate = false;
  outerEnvelope.add(ceramicRing);

  // 2. Stepped chamfered obsidian armor lip framing the outer perimeter
  const armorLipGeo = new THREE.TorusGeometry(ringRadius + 0.29, 0.065, 12, 96);
  ensureUv2(armorLipGeo);
  const armorLip = new THREE.Mesh(armorLipGeo, materials.anodizedBlack);
  armorLip.name = 'arc-armor-step-ring';
  armorLip.position.z = -0.26;
  armorLip.updateMatrix();
  armorLip.matrixAutoUpdate = false;
  outerEnvelope.add(armorLip);

  // 3. Inner recessed ceramic structural flange grounding the core chassis
  const innerFlangeGeo = new THREE.RingGeometry(2.38, 2.72, 48);
  ensureUv2(innerFlangeGeo);
  const innerFlange = new THREE.Mesh(innerFlangeGeo, materials.darkCeramic);
  innerFlange.name = 'arc-inner-flange-ring';
  innerFlange.position.z = -0.18;
  innerFlange.updateMatrix();
  innerFlange.matrixAutoUpdate = false;
  outerEnvelope.add(innerFlange);

  // 4. 24 Instanced precision hex bolts around the outer perimeter flange
  const boltGeo = new THREE.CylinderGeometry(0.048, 0.056, 0.09, 6);
  ensureUv2(boltGeo);
  const boltInst = new THREE.InstancedMesh(boltGeo, materials.brushedTitanium, 24);
  boltInst.name = 'arc-instanced-hex-bolts';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < 24; i++) {
    const angle = ((Math.PI * 2) / 24) * i + Math.PI / 24;
    const r = ringRadius + 0.28;
    dummy.position.set(Math.cos(angle) * r, Math.sin(angle) * r, -0.17);
    dummy.rotation.set(Math.PI / 2, angle, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    boltInst.setMatrixAt(i, dummy.matrix);
  }
  boltInst.instanceMatrix.needsUpdate = true;
  boltInst.computeBoundingSphere();
  boltInst.updateMatrix();
  boltInst.matrixAutoUpdate = false;
  outerEnvelope.add(boltInst);

  // 5. 24 Instanced copper alloy heat-sink cooling fins tucked into nozzle ports
  const finGeo = new THREE.BoxGeometry(0.24, 0.036, 0.22);
  ensureUv2(finGeo);
  const finInst = new THREE.InstancedMesh(finGeo, materials.copperWinding, 24);
  finInst.name = 'arc-instanced-copper-fins';

  let finIdx = 0;
  for (let i = 0; i < 12; i++) {
    const nAngle = ((Math.PI * 2) / 12) * i;
    for (let side = -1; side <= 1; side += 2) {
      const offsetAngle = nAngle + side * 0.042;
      const r = 5.02;
      dummy.position.set(Math.cos(offsetAngle) * r, Math.sin(offsetAngle) * r, -0.3);
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
}

const SHADOW_CASTER_NAMES = new Set<string>([
  'arc-base-plate',
  'arc-armor-step-ring',
  'arc-ceramic-insulator-ring',
  'arc-merged-trenches-anodizedBlack',
  'arc-merged-trenches-darkCarbon',
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
]);

const SHADOW_RECEIVER_ONLY_NAMES = new Set<string>([
  'arc-inner-flange-ring',
  'arc-instanced-collars',
  'arc-instanced-collar-slots',
  'arc-instanced-pistons',
  'arc-instanced-hex-bolts',
  'arc-instanced-copper-fins',
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
