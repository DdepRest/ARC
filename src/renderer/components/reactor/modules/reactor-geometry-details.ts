import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { ReactorMaterials } from './reactor-materials';
import type { LightRunner } from './reactor-geometry';
import {
  ensureUv2,
  createBeveledHexagon,
  createBeveledTrapezoid,
} from './reactor-geometry-primitives';

export { ensureUv2 };

export function addOuterLightRunners(
  parentGroup: THREE.Object3D,
  materials: ReactorMaterials,
  lightRunners: LightRunner[],
  radius: number,
  count: number,
  thickness: number,
  zOffset = 0
): void {
  const arcLengths = [0.44, 0.68, 0.92, 0.54, 1.04, 0.48, 0.74, 1.08, 0.60, 0.82];
  for (let i = 0; i < count; i++) {
    const arcLen = arcLengths[i % arcLengths.length];
    const group = new THREE.Group();
    group.name = `arc-light-runner-${i}`;

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: materials.currentColor.getHex(),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: materials.currentColor.getHex(),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const coreGeo = new THREE.TorusGeometry(radius, thickness * 0.25, 12, 48, arcLen);
    const capStartGeo = new THREE.SphereGeometry(thickness * 0.32, 10, 10);
    capStartGeo.translate(radius, 0, 0);
    const mergedCoreGeo = BufferGeometryUtils.mergeGeometries([coreGeo, capStartGeo], false) || coreGeo;
    if (mergedCoreGeo !== coreGeo) coreGeo.dispose();
    capStartGeo.dispose();
    const coreMesh = new THREE.Mesh(mergedCoreGeo, coreMat);
    coreMesh.matrixAutoUpdate = false;
    group.add(coreMesh);

    const auraGeo = new THREE.TorusGeometry(radius, thickness * 0.56, 12, 48, arcLen);
    const capEndGeo = new THREE.SphereGeometry(thickness * 0.16, 10, 10);
    capEndGeo.translate(Math.cos(arcLen) * radius, Math.sin(arcLen) * radius, 0);
    const mergedAuraGeo = BufferGeometryUtils.mergeGeometries([auraGeo, capEndGeo], false) || auraGeo;
    if (mergedAuraGeo !== auraGeo) auraGeo.dispose();
    capEndGeo.dispose();
    const auraMesh = new THREE.Mesh(mergedAuraGeo, glowMat);
    auraMesh.matrixAutoUpdate = false;
    group.add(auraMesh);

    group.position.z = zOffset;
    group.rotation.z = (i / count) * Math.PI * 2 + (i % 3) * 0.35;

    const dir = i % 2 === 0 ? 1 : -1;
    const isInitialActive = i % 3 === 0 || i === 5;
    group.visible = isInitialActive;
    group.userData = {
      baseSpeed: dir * (0.22 + ((i * 7) % 5) * 0.05),
      direction: dir,
      state: isInitialActive ? 'active' : 'dormant',
      timer: isInitialActive ? 1.8 + (i % 4) * 1.2 : 0.4 + (i % 3) * 0.7,
      maxLife: 2.4 + (i % 4) * 1.1,
      opacity: isInitialActive ? 0.72 : 0.0,
      pulseFreq: 3.0 + (i % 4) * 1.4,
      pulseOffset: i * 0.9,
    };

    parentGroup.add(group);
    lightRunners.push({ group, coreMat, glowMat });
  }
}

/**
 * Adds strictly functional, disciplined mechanical joints via InstancedMesh (only +3 draw calls):
 * - 18 hex structural anchor bolts locking the 3 segmented containment nacelle decks
 * - 12 titanium accelerator tunnel collar clamps securing the 3 segmented optical bay tunnels
 * - 18 structural I-beam spar anchor studs connecting radial spars to hub & nacelles
 */
export function buildOuterMicroDetails(
  outerEnvelope: THREE.Group,
  materials: ReactorMaterials,
  ringRadius: number
): void {
  const dummy = new THREE.Object3D();

  // 1. 12 Functional Hex Anchor Bolts placed symmetrically on the 3 nacelle decks (4 each)
  const boltGeo = createBeveledHexagon(0.048, 0.055, 0.011, 0.011);
  const boltInst = new THREE.InstancedMesh(boltGeo, materials.anodizedBlack, 12);
  boltInst.name = 'arc-instanced-hex-bolts';

  const nacelleAngles = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6];
  const boltOffsets = [-0.36, -0.16, 0.16, 0.36];
  let boltIdx = 0;
  for (const centerA of nacelleAngles) {
    for (const off of boltOffsets) {
      const a = centerA + off;
      const r = 5.06;
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.09);
      dummy.rotation.set(0, 0, a);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      boltInst.setMatrixAt(boltIdx++, dummy.matrix);
    }
  }
  boltInst.instanceMatrix.needsUpdate = true;
  boltInst.computeBoundingSphere();
  boltInst.updateMatrix();
  boltInst.matrixAutoUpdate = false;
  outerEnvelope.add(boltInst);

  // 2. 6 Dark-Metal Accelerator Tunnel Bridge Clamps securing the continuous 360° optical ring (2 per bay)
  const clampGeo = createBeveledTrapezoid(0.28, 0.22, 0.11, 0.13, 0.015, 0.015);
  const clampInst = new THREE.InstancedMesh(clampGeo, materials.ringFrameMat, 6);
  clampInst.name = 'arc-instanced-glass-clamps';

  const bayAngles = [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2];
  const bayClampOffsets = [-0.30, 0.30];
  let clampIdx = 0;
  for (const bayA of bayAngles) {
    for (const off of bayClampOffsets) {
      const a = bayA + off;
      dummy.position.set(Math.cos(a) * ringRadius, Math.sin(a) * ringRadius, 0.13);
      dummy.rotation.set(0, 0, a);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      clampInst.setMatrixAt(clampIdx++, dummy.matrix);
    }
  }
  clampInst.instanceMatrix.needsUpdate = true;
  clampInst.computeBoundingSphere();
  clampInst.updateMatrix();
  clampInst.matrixAutoUpdate = false;
  outerEnvelope.add(clampInst);

  // 3. 12 Structural I-Beam Spar Anchor Studs (2 per radial spar)
  const studGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.10, 8);
  studGeo.rotateX(Math.PI / 2);
  ensureUv2(studGeo);
  const studInst = new THREE.InstancedMesh(studGeo, materials.anodizedBlack, 12);
  studInst.name = 'arc-instanced-strut-screws';

  let studIdx = 0;
  const studRadii = [2.62, 4.30];
  for (let s = 0; s < 6; s++) {
    const a = (Math.PI / 3) * s + Math.PI / 6;
    for (const r of studRadii) {
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.44);
      dummy.rotation.set(0, 0, a);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      studInst.setMatrixAt(studIdx++, dummy.matrix);
    }
  }
  studInst.instanceMatrix.needsUpdate = true;
  studInst.computeBoundingSphere();
  studInst.updateMatrix();
  studInst.matrixAutoUpdate = false;
  outerEnvelope.add(studInst);
}

const SHADOW_CASTER_NAMES = new Set<string>([
  'arc-rear-structural-hub',
  'arc-outer-carrier-rail',
  'arc-merged-nacelles-anodizedBlack',
  'arc-merged-nacelles-brushedTitanium',
  'arc-merged-nacelles-ringFrameMat',
  'arc-merged-nacelles-darkCarbon',
  'arc-merged-nacelles-darkCeramic',
  'arc-merged-nacelles-copperWinding',
  'arc-merged-outerMods-anodizedBlack',
  'arc-merged-outerMods-brushedTitanium',
  'arc-merged-outerMods-ringFrameMat',
  'arc-merged-outerMods-darkCarbon',
  'arc-merged-outerMods-darkCeramic',
  'arc-merged-outerMods-heatTintedMetal',
  'arc-merged-outerMods-copperWinding',
  'arc-merged-trenches-anodizedBlack',
  'arc-merged-trenches-darkCarbon',
  'arc-merged-trenches-darkCeramic',
  'arc-merged-trenches-brushedTitanium',
  'arc-merged-trenches-ringFrameMat',
  'arc-merged-trenches-copperWinding',
  'arc-merged-clamps-anodizedBlack',
  'arc-merged-clamps-brushedTitanium',
  'arc-merged-clamps-ringFrameMat',
  'arc-merged-clamps-darkCarbon',
  'arc-merged-clamps-darkCeramic',
  'arc-merged-clamps-copperWinding',
  'arc-merged-chamber-anodizedBlack',
  'arc-merged-chamber-brushedTitanium',
  'arc-merged-chamber-ringFrameMat',
  'arc-merged-chamber-darkCarbon',
  'arc-merged-chamber-darkCeramic',
  'arc-merged-chamber-copperWinding',
  'arc-merged-processNodes-brushedTitanium',
  'arc-merged-processNodes-anodizedBlack',
  'arc-merged-processNodes-darkCeramic',
]);

const SHADOW_RECEIVER_ONLY_NAMES = new Set<string>([
  'arc-instanced-collars',
  'arc-instanced-collar-slots',
  'arc-instanced-pistons',
  'arc-instanced-hex-bolts',
  'arc-instanced-strut-screws',
  'arc-instanced-glass-clamps',
  'arc-aperture-inner-rim',
  'arc-turbine-primary-blades',
  'arc-turbine-secondary-stator',
  'arc-turbine-rotor-hub',
  'arc-turbine-secondary-carrier',
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
