import * as THREE from 'three';
import type { ReactorMaterials } from './reactor-materials';
import {
  ensureUv2,
  createBeveledArcSector,
  createBeveledTrapezoid,
  createBeveledHexagon,
  createChamferedRingLathe,
  mergeGeometryBatch,
} from './reactor-geometry-primitives';

const TRI_AXIS_ANGLES = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6] as const; // 90°, 210°, 330°
const VERTEX_AXIS_ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6] as const; // 270°, 30°, 150°

/**
 * PHASE A — HYBRID GLASS ENCLOSURE & DEEP MECHANICAL REAR HOUSING
 * 1. Hybrid Transparent Protective Enclosure (`arc-hybrid-glass-enclosure`):
 *    - 3 smoked-glass optical sectors (`arc-hybrid-glass-sectors`, r = 2.48..4.86, z = +0.47, 74° span each)
 *      using `materials.opticGlass` (transmission ~0.42 on HW GPUs outside Eco; central window unobstructed).
 *    - 3 precision retention arches, perimeter seals, satin bevel crests & mounting feet.
 * 2. Deep Mechanical Rear Housing & Rotor/Stator Integration (`arc-deep-rear-housing`):
 *    - Outer structural chassis ring (`r = 3.58..4.96, z = -1.22..-0.78`) with recessed service compartments.
 *    - Stationary inner support ring (`r = 1.96..2.82, z = -1.16..-0.54`) & central shaft/bearing assembly.
 *    - 3 radial load-bearing structural supports (120° intervals), 3 bearing mounts, rotor shroud,
 *      secondary stator carrier, and synchronized red optical bearing/rotor indicators.
 */
export function buildHybridEnclosureAndRearHousing(
  outerEnvelope: THREE.Group,
  internalTurbine: THREE.Group,
  internalTurbineSecondary: THREE.Group,
  materials: ReactorMaterials,
  nacelleBatches: {
    anodized: THREE.Mesh[];
    titanium: THREE.Mesh[];
    ringFrame: THREE.Mesh[];
    carbon: THREE.Mesh[];
    ceramic: THREE.Mesh[];
    copper: THREE.Mesh[];
  }
): void {
  const {
    anodized: anodizedBatch,
    ringFrame: gunmetalBatch,
    titanium: titaniumBatch,
    ceramic: ceramicBatch,
    carbon: carbonBatch,
    copper: copperBatch,
  } = nacelleBatches;

  const addPart = (
    parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
    bucket: THREE.Mesh[], x: number, y: number, z: number, rotZ = 0
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rotZ) m.rotation.z = rotZ;
    parent.add(m);
    bucket.push(m);
    return m;
  };

  // =========================================================================
  // 1. OUTER METALLIC RETENTION ARCHES & PERIMETER CONTAINMENT FRAMING (FRONT: z = +0.34 .. +0.50)
  //    (Outer 74° glass sector sheets selectively removed so the upper power bridge
  //     and diagonal armored conduits remain 100% unobstructed; original central chamber
  //     optical glass viewport and outer 360° glass accelerator ring are preserved.)
  // =========================================================================
  const glassEnclosureGroup = new THREE.Group();
  glassEnclosureGroup.name = 'arc-hybrid-glass-enclosure';

  const sectorHalfSpan = (37 * Math.PI) / 180; // 74° per retention arch sector
  const sealHalfSpan = sectorHalfSpan + 0.015;

  const outerMountFootGeo = createBeveledTrapezoid(0.46, 0.34, 0.32, 0.24, 0.02, 0.02);
  const outerMountClampGeo = createBeveledTrapezoid(0.32, 0.24, 0.22, 0.14, 0.014, 0.014);
  const innerWindowLugGeo = createBeveledTrapezoid(0.30, 0.22, 0.20, 0.12, 0.012, 0.012);

  for (let i = 0; i < 3; i++) {
    const centerA = TRI_AXIS_ANGLES[i];
    const a0 = centerA - sectorHalfSpan;
    const a1 = centerA + sectorHalfSpan;

    // A1. Precision-machined Outer Metallic Retention Arch + Satin Bevel Crest (r = 4.76..5.00)
    const outerArchGeo = createBeveledArcSector(4.76, 5.00, centerA - sealHalfSpan, centerA + sealHalfSpan, 0.09, 0.018, 0.018, 24);
    addPart(glassEnclosureGroup, outerArchGeo, materials.ringFrameMat, gunmetalBatch, 0, 0, 0.45);

    const outerBevelGeo = createBeveledArcSector(4.84, 4.96, a0 + 0.04, a1 - 0.04, 0.045, 0.012, 0.012, 20);
    addPart(glassEnclosureGroup, outerBevelGeo, materials.brushedTitanium, titaniumBatch, 0, 0, 0.50);

    // A2. Thin Inner Window Perimeter Seal Framing the Central Chamber (r = 2.40..2.52)
    const innerSealGeo = createBeveledArcSector(2.40, 2.52, a0 - 0.01, a1 + 0.01, 0.052, 0.012, 0.012, 20);
    addPart(glassEnclosureGroup, innerSealGeo, materials.ringFrameMat, gunmetalBatch, 0, 0, 0.43);

    // A3. Mechanical Mounting Brackets & Retention Clamps at Arch Ends
    for (const side of [-1, 1]) {
      const edgeA = centerA + side * sectorHalfSpan;
      const cosE = Math.cos(edgeA);
      const sinE = Math.sin(edgeA);
      const rotE = edgeA + Math.PI / 2;
      addPart(glassEnclosureGroup, outerMountFootGeo, materials.anodizedBlack, anodizedBatch, cosE * 4.94, sinE * 4.94, 0.34, rotE);
      addPart(glassEnclosureGroup, outerMountClampGeo, materials.brushedTitanium, titaniumBatch, cosE * 4.92, sinE * 4.92, 0.48, rotE);
    }

    const cosC = Math.cos(centerA);
    const sinC = Math.sin(centerA);
    const rotC = centerA + Math.PI / 2;
    addPart(glassEnclosureGroup, outerMountClampGeo, materials.brushedTitanium, titaniumBatch, cosC * 4.96, sinC * 4.96, 0.49, rotC);
    addPart(glassEnclosureGroup, innerWindowLugGeo, materials.brushedTitanium, titaniumBatch, cosC * 2.44, sinC * 2.44, 0.45, rotC);
  }

  outerEnvelope.add(glassEnclosureGroup);

  // =========================================================================
  // 2. DEEP MECHANICAL REAR HOUSING (REAR: z = -1.24 .. -0.54)
  // =========================================================================
  const rearHousingGroup = new THREE.Group();
  rearHousingGroup.name = 'arc-deep-rear-housing';

  // A. Outer Structural Chassis Ring (follows circular silhouette, creates deep recessed mechanical bay)
  const rearOuterChassisGeo = createChamferedRingLathe(
    [[3.58, -1.22], [4.88, -1.22], [4.96, -0.96], [4.86, -0.78], [4.56, -0.78], [4.46, -1.04], [3.72, -1.04], [3.58, -0.88], [3.58, -1.22]],
    72
  );
  addPart(rearHousingGroup, rearOuterChassisGeo, materials.anodizedBlack, anodizedBatch, 0, 0, 0);

  // B. Stationary Inner Support Ring & Stator Carrier Housing (separates stationary stator from rotating rotor)
  const statorCarrierRingGeo = createChamferedRingLathe(
    [[1.96, -1.16], [2.76, -1.16], [2.82, -0.82], [2.78, -0.54], [2.63, -0.54], [2.60, -0.88], [2.12, -0.88], [2.06, -0.68], [1.96, -0.68], [1.96, -1.16]],
    64
  );
  addPart(rearHousingGroup, statorCarrierRingGeo, materials.ringFrameMat, gunmetalBatch, 0, 0, 0);

  // C. Convincing Central Shaft & Rotor Bearing Housing Assembly + Precision Inner Race Ring
  const centralBearingCupGeo = createChamferedRingLathe(
    [[1.18, -1.24], [1.94, -1.24], [1.94, -0.92], [1.76, -0.86], [1.36, -0.86], [1.18, -0.98], [1.18, -1.24]],
    48
  );
  addPart(rearHousingGroup, centralBearingCupGeo, materials.anodizedBlack, anodizedBatch, 0, 0, 0);

  const bearingInnerRaceGeo = createChamferedRingLathe(
    [[1.42, -0.96], [1.74, -0.96], [1.76, -0.82], [1.40, -0.82], [1.42, -0.96]],
    48
  );
  addPart(rearHousingGroup, bearingInnerRaceGeo, materials.brushedTitanium, titaniumBatch, 0, 0, 0);

  // D. Three Major Radial Structural Supports (90°, 210°, 330°) & Service Compartments
  const mainRadialBeamGeo = createBeveledTrapezoid(0.58, 0.44, 2.28, 0.36, 0.032, 0.032);
  const radialWebInsertGeo = createBeveledTrapezoid(0.28, 0.22, 1.88, 0.14, 0.016, 0.016);
  const bearingMountBlockGeo = createBeveledTrapezoid(0.56, 0.42, 0.84, 0.34, 0.026, 0.026);
  const bearingCapGeo = createBeveledHexagon(0.19, 0.16, 0.018, 0.018);
  const bearingCopperContactGeo = createBeveledTrapezoid(0.18, 0.14, 0.24, 0.08, 0.01, 0.01);
  const indicatorGeo = new THREE.BoxGeometry(0.22, 0.038, 0.036);

  for (let i = 0; i < 3; i++) {
    const a = TRI_AXIS_ANGLES[i];
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const rotA = a + Math.PI / 2;
    addPart(rearHousingGroup, mainRadialBeamGeo, materials.anodizedBlack, anodizedBatch, cosA * 3.66, sinA * 3.66, -1.02, rotA);
    addPart(rearHousingGroup, radialWebInsertGeo, materials.ringFrameMat, gunmetalBatch, cosA * 3.66, sinA * 3.66, -0.86, rotA);

    // Internal Service Compartments recessed between radial supports (r = 3.76..4.42, 38° arc)
    const compCenterA = a + Math.PI / 3;
    const compHalfArc = (19 * Math.PI) / 180;
    const compPocketGeo = createBeveledArcSector(3.76, 4.42, compCenterA - compHalfArc, compCenterA + compHalfArc, 0.16, 0.02, 0.02, 16);
    addPart(rearHousingGroup, compPocketGeo, materials.darkCarbon, carbonBatch, 0, 0, -1.08);

    const isoDamperGeo = createBeveledArcSector(3.86, 4.30, compCenterA - compHalfArc + 0.05, compCenterA + compHalfArc - 0.05, 0.10, 0.015, 0.015, 14);
    addPart(rearHousingGroup, isoDamperGeo, materials.darkCeramic, ceramicBatch, 0, 0, -0.96);
  }

  // 3 Structural Bearing Mounts & Stationary Stator Bridge Clamps at -90°, 30°, 150° + Bearing Status Indicators
  const bearingIndMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const bAngle = VERTEX_AXIS_ANGLES[i];
    const cosB = Math.cos(bAngle);
    const sinB = Math.sin(bAngle);
    const rotB = bAngle + Math.PI / 2;
    addPart(rearHousingGroup, bearingMountBlockGeo, materials.ringFrameMat, gunmetalBatch, cosB * 2.66, sinB * 2.66, -0.78, rotB);
    addPart(rearHousingGroup, bearingCapGeo, materials.brushedTitanium, titaniumBatch, cosB * 2.54, sinB * 2.54, -0.58, bAngle);
    addPart(rearHousingGroup, bearingCopperContactGeo, materials.copperWinding, copperBatch, cosB * 2.74, sinB * 2.74, -0.60, rotB);
    addPart(rearHousingGroup, indicatorGeo, materials.coreDiodeMat, bearingIndMeshes, cosB * 2.54, sinB * 2.54, -0.48, rotB);
  }
  rearHousingGroup.updateMatrixWorld(true);
  mergeGeometryBatch(bearingIndMeshes, materials.coreDiodeMat.clone(), rearHousingGroup, 'arc-bearing-indicators-ring');

  outerEnvelope.add(rearHousingGroup);

  // =========================================================================
  // 3. ROTOR / STATOR MECHANICAL INTEGRATION (NO DUPLICATE TURBINES)
  // =========================================================================
  // Merge outer blade shroud and shaft journal spokes into a single rotor hub assembly (`arc-turbine-rotor-hub`)
  const existingHub = internalTurbine.getObjectByName('arc-turbine-rotor-hub') as THREE.Mesh | undefined;
  const rotorHubParts: THREE.Mesh[] = existingHub ? [existingHub] : [];
  const outerBladeShroudGeo = createChamferedRingLathe([[3.58, -0.06], [3.70, -0.06], [3.72, 0.06], [3.60, 0.06], [3.58, -0.06]], 64);
  addPart(internalTurbine, outerBladeShroudGeo, materials.ringFrameMat, rotorHubParts, 0, 0, 0);

  const rotorSpokeGeo = createBeveledTrapezoid(0.20, 0.14, 0.64, 0.09, 0.014, 0.014);
  const rotorIndGeo = new THREE.BoxGeometry(0.18, 0.032, 0.032);
  const rotorIndParts: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = TRI_AXIS_ANGLES[i];
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const rotA = a + Math.PI / 2;
    addPart(internalTurbine, rotorSpokeGeo, materials.ringFrameMat, rotorHubParts, cosA * 1.92, sinA * 1.92, -0.02, rotA);
    addPart(internalTurbine, rotorIndGeo, materials.neonTubeMat, rotorIndParts, cosA * 2.38, sinA * 2.38, 0.11, rotA);
  }
  // Reset local transform temporarily before mergeGeometryBatch so merged coordinates are relative to internalTurbine
  const savedZ = internalTurbine.position.z;
  internalTurbine.position.z = 0;
  internalTurbine.updateMatrixWorld(true);
  mergeGeometryBatch(rotorHubParts, materials.ringFrameMat, internalTurbine, 'arc-turbine-rotor-hub');
  mergeGeometryBatch(rotorIndParts, materials.neonTubeMat, internalTurbine, 'arc-turbine-rotor-indicators');
  internalTurbine.position.z = savedZ;
  internalTurbine.updateMatrixWorld(true);

  const secondaryRingGeo = createChamferedRingLathe([[1.98, -0.05], [2.10, -0.05], [2.12, 0.05], [2.00, 0.05], [1.98, -0.05]], 48);
  ensureUv2(secondaryRingGeo);
  const secondaryCarrier = new THREE.Mesh(secondaryRingGeo, materials.ringFrameMat);
  secondaryCarrier.name = 'arc-turbine-secondary-carrier';
  internalTurbineSecondary.add(secondaryCarrier);
}
