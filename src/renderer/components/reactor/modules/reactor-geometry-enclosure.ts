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
  // 1. OUTER METALLIC RETENTION ARCHES & PERIMETER CONTAINMENT FRAMING (FRONT: z = +0.34 .. +0.49)
  //    Preserves the 3 metallic retention arches and mounting brackets while keeping the
  //    upper power bridge, diagonal conduits, and triangular central chamber unobstructed.
  // =========================================================================
  const glassEnclosureGroup = new THREE.Group();
  glassEnclosureGroup.name = 'arc-hybrid-glass-enclosure';

  const sectorHalfSpan = (37 * Math.PI) / 180; // 74° per retention arch sector
  const sealHalfSpan = sectorHalfSpan + 0.015;

  const outerMountFootGeo = createBeveledTrapezoid(0.46, 0.34, 0.32, 0.24, 0.02, 0.02);
  const outerMountClampGeo = createBeveledTrapezoid(0.30, 0.22, 0.20, 0.13, 0.014, 0.014);

  for (let i = 0; i < 3; i++) {
    const centerA = TRI_AXIS_ANGLES[i];
    const a0 = centerA - sectorHalfSpan;
    const a1 = centerA + sectorHalfSpan;

    // A1. Precision-machined Outer Metallic Retention Arch + restrained satin bevel highlight (r = 4.76..5.00)
    const outerArchGeo = createBeveledArcSector(4.76, 5.00, centerA - sealHalfSpan, centerA + sealHalfSpan, 0.09, 0.018, 0.018, 24);
    addPart(glassEnclosureGroup, outerArchGeo, materials.ringFrameMat, gunmetalBatch, 0, 0, 0.44);

    const outerBevelGeo = createBeveledArcSector(4.86, 4.94, a0 + 0.05, a1 - 0.05, 0.036, 0.010, 0.010, 20);
    addPart(glassEnclosureGroup, outerBevelGeo, materials.brushedTitanium, titaniumBatch, 0, 0, 0.49);

    // A2. Mechanical Mounting Brackets & Retention Clamps at Arch Ends (dark gunmetal clamp anchors over obsidian feet)
    for (const side of [-1, 1]) {
      const edgeA = centerA + side * sectorHalfSpan;
      const cosE = Math.cos(edgeA);
      const sinE = Math.sin(edgeA);
      const rotE = edgeA + Math.PI / 2;
      addPart(glassEnclosureGroup, outerMountFootGeo, materials.anodizedBlack, anodizedBatch, cosE * 4.94, sinE * 4.94, 0.34, rotE);
      addPart(glassEnclosureGroup, outerMountClampGeo, materials.ringFrameMat, gunmetalBatch, cosE * 4.92, sinE * 4.92, 0.47, rotE);
    }

    const cosC = Math.cos(centerA);
    const sinC = Math.sin(centerA);
    const rotC = centerA + Math.PI / 2;
    addPart(glassEnclosureGroup, outerMountClampGeo, materials.ringFrameMat, gunmetalBatch, cosC * 4.96, sinC * 4.96, 0.48, rotC);
  }

  outerEnvelope.add(glassEnclosureGroup);

  // =========================================================================
  // 2. DEEP MECHANICAL REAR HOUSING (VISUALLY RECESSED: z = -1.24 .. -0.74)
  // =========================================================================
  const rearHousingGroup = new THREE.Group();
  rearHousingGroup.name = 'arc-deep-rear-housing';

  // A. Outer Structural Chassis Ring (follows circular silhouette, recessed behind containment plane)
  const rearOuterChassisGeo = createChamferedRingLathe(
    [[3.58, -1.22], [4.88, -1.22], [4.96, -0.98], [4.86, -0.82], [4.56, -0.82], [4.46, -1.04], [3.72, -1.04], [3.58, -0.90], [3.58, -1.22]],
    72
  );
  addPart(rearHousingGroup, rearOuterChassisGeo, materials.anodizedBlack, anodizedBatch, 0, 0, 0);

  // B. Recessed Stationary Inner Support Ring & Stator Carrier Housing (satin black so it never draws a competing inner ring)
  const statorCarrierRingGeo = createChamferedRingLathe(
    [[1.96, -1.18], [2.76, -1.18], [2.80, -0.90], [2.76, -0.74], [2.62, -0.74], [2.58, -0.94], [2.12, -0.94], [2.06, -0.78], [1.96, -0.78], [1.96, -1.18]],
    64
  );
  addPart(rearHousingGroup, statorCarrierRingGeo, materials.anodizedBlack, anodizedBatch, 0, 0, 0);

  // C. Deep Central Shaft & Rotor Bearing Housing Assembly + Subdued Gunmetal Inner Race Ring
  const centralBearingCupGeo = createChamferedRingLathe(
    [[1.18, -1.24], [1.94, -1.24], [1.94, -0.96], [1.76, -0.90], [1.36, -0.90], [1.18, -1.02], [1.18, -1.24]],
    48
  );
  addPart(rearHousingGroup, centralBearingCupGeo, materials.anodizedBlack, anodizedBatch, 0, 0, 0);

  const bearingInnerRaceGeo = createChamferedRingLathe(
    [[1.42, -1.02], [1.74, -1.02], [1.76, -0.88], [1.40, -0.88], [1.42, -1.02]],
    48
  );
  addPart(rearHousingGroup, bearingInnerRaceGeo, materials.ringFrameMat, gunmetalBatch, 0, 0, 0);

  // D. Three Major Radial Structural Supports (90°, 210°, 330°) & Recessed Service Compartments
  const mainRadialBeamGeo = createBeveledTrapezoid(0.56, 0.42, 2.26, 0.34, 0.030, 0.030);
  const radialWebInsertGeo = createBeveledTrapezoid(0.26, 0.20, 1.84, 0.12, 0.014, 0.014);
  const bearingMountBlockGeo = createBeveledTrapezoid(0.52, 0.40, 0.80, 0.30, 0.024, 0.024);
  const bearingCapGeo = createBeveledHexagon(0.18, 0.14, 0.016, 0.016);
  const bearingCopperContactGeo = createBeveledTrapezoid(0.14, 0.11, 0.18, 0.06, 0.008, 0.008);
  const indicatorGeo = new THREE.BoxGeometry(0.20, 0.034, 0.032);

  for (let i = 0; i < 3; i++) {
    const a = TRI_AXIS_ANGLES[i];
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const rotA = a + Math.PI / 2;
    addPart(rearHousingGroup, mainRadialBeamGeo, materials.anodizedBlack, anodizedBatch, cosA * 3.66, sinA * 3.66, -1.04, rotA);
    addPart(rearHousingGroup, radialWebInsertGeo, materials.ringFrameMat, gunmetalBatch, cosA * 3.66, sinA * 3.66, -0.89, rotA);

    // Internal Service Compartments recessed between radial supports (r = 3.76..4.42, 38° arc)
    const compCenterA = a + Math.PI / 3;
    const compHalfArc = (19 * Math.PI) / 180;
    const compPocketGeo = createBeveledArcSector(3.76, 4.42, compCenterA - compHalfArc, compCenterA + compHalfArc, 0.15, 0.018, 0.018, 16);
    addPart(rearHousingGroup, compPocketGeo, materials.darkCarbon, carbonBatch, 0, 0, -1.10);

    const isoDamperGeo = createBeveledArcSector(3.86, 4.30, compCenterA - compHalfArc + 0.05, compCenterA + compHalfArc - 0.05, 0.09, 0.014, 0.014, 14);
    addPart(rearHousingGroup, isoDamperGeo, materials.darkCeramic, ceramicBatch, 0, 0, -0.99);
  }

  // 3 Structural Bearing Mounts & Stationary Stator Bridge Clamps at -90°, 30°, 150° + Bearing Status Indicators
  const bearingIndMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const bAngle = VERTEX_AXIS_ANGLES[i];
    const cosB = Math.cos(bAngle);
    const sinB = Math.sin(bAngle);
    const rotB = bAngle + Math.PI / 2;
    addPart(rearHousingGroup, bearingMountBlockGeo, materials.anodizedBlack, anodizedBatch, cosB * 2.66, sinB * 2.66, -0.86, rotB);
    addPart(rearHousingGroup, bearingCapGeo, materials.ringFrameMat, gunmetalBatch, cosB * 2.54, sinB * 2.54, -0.70, bAngle);
    addPart(rearHousingGroup, bearingCopperContactGeo, materials.copperWinding, copperBatch, cosB * 2.74, sinB * 2.74, -0.72, rotB);
    addPart(rearHousingGroup, indicatorGeo, materials.coreDiodeMat, bearingIndMeshes, cosB * 2.54, sinB * 2.54, -0.60, rotB);
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
