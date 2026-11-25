import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import {
  buildTrenches,
  buildCornerClamps,
  buildFiberOpticsAndDataModules,
} from "./reactor-geometry-sub";
import { buildAsymmetricOuterModules } from "./reactor-geometry-modules";
import { buildCoreDecorations } from "./reactor-geometry-core-decor";
import {
  addOuterLightRunners,
  buildOuterMicroDetails,
  applySelectiveShadowFlags,
} from "./reactor-geometry-details";
import {
  createBeveledArcSector,
  createBeveledTrapezoid,
  createChamferedRingLathe,
  mergeGeometryBatch,
} from "./reactor-geometry-primitives";

export interface LightRunner {
  group: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshStandardMaterial;
}

export interface ReactorGeometryResult {
  reactorGroup: THREE.Group;
  internalTurbine: THREE.Group;
  internalTurbineSecondary: THREE.Group;
  plasmaFilaments: THREE.Group;
  confinementRings: THREE.Group;
  lightRunners: LightRunner[];
}

export function buildReactorGeometry(
  scene: THREE.Scene,
  materials: ReactorMaterials,
  lighting: ReactorLighting,
  graphicsQuality: string
): ReactorGeometryResult {
  const reactorGroup = new THREE.Group();
  reactorGroup.name = "arc-reactor-root";
  scene.add(reactorGroup);

  const lightRunners: LightRunner[] = [];

  // ==========================================
  // REFINED OPEN-FRAME EXOSKELETON & TRI-SYMMETRIC CONTAINMENT NACELLES
  // (Sleeker proportions, Obsidian Black body, continuous 360° optical raceway)
  // ==========================================
  const outerEnvelope = new THREE.Group();
  outerEnvelope.name = "arc-outer-envelope";
  const ringRadius = 5.08;

  // 1. Recessed Open Rear Structural Hub Collar (compactly bridges central chamber to radial spars & turbine)
  const rearHubGeo = createChamferedRingLathe(
    [
      [1.82, -0.38],
      [2.46, -0.38],
      [2.52, -0.16],
      [2.44, 0.12],
      [1.88, 0.12],
      [1.82, -0.10],
      [1.82, -0.38],
    ],
    64
  );
  const rearHub = new THREE.Mesh(rearHubGeo, materials.anodizedBlack);
  rearHub.name = "arc-rear-structural-hub";
  rearHub.position.z = -0.98;
  rearHub.updateMatrix();
  rearHub.matrixAutoUpdate = false;
  outerEnvelope.add(rearHub);

  // 2. Continuous Recessed Dark-Gunmetal Structural Carrier Rail (mechanically unites optical ring, 3 nacelles & 3 outer nodes)
  const carrierRailGeo = createChamferedRingLathe(
    [
      [4.92, -0.32],
      [5.24, -0.32],
      [5.26, -0.18],
      [5.18, -0.13],
      [4.98, -0.13],
      [4.90, -0.18],
      [4.92, -0.32],
    ],
    96
  );
  const carrierRail = new THREE.Mesh(carrierRailGeo, materials.ringFrameMat);
  carrierRail.name = "arc-outer-carrier-rail";
  carrierRail.updateMatrix();
  carrierRail.matrixAutoUpdate = false;
  outerEnvelope.add(carrierRail);

  // 3. Three Layered Segmented Containment Armor Carriers (centered at 90°, 210°, 330°; 52° outer arc + 28° raised stepped crown)
  const nacelleAnodized: THREE.Mesh[] = [];
  const nacelleTitanium: THREE.Mesh[] = [];
  const nacelleRingFrame: THREE.Mesh[] = [];
  const nacelleCarbon: THREE.Mesh[] = [];
  const nacelleCeramic: THREE.Mesh[] = [];

  const nacelleAngles = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6];
  const halfArc = (26 * Math.PI) / 180; // 52° total arc per carrier segment — preserves crisp breathing room
  const crownHalfArc = (14 * Math.PI) / 180; // 28° central raised stepped armor plate

  for (const centerA of nacelleAngles) {
    const a0 = centerA - halfArc;
    const a1 = centerA + halfArc;

    // Layer A: Primary obsidian anodized armor carrier base
    const hull = new THREE.Mesh(
      createBeveledArcSector(4.70, 5.46, a0, a1, 0.50, 0.044, 0.044, 24),
      materials.anodizedBlack
    );
    hull.position.z = -0.45;
    outerEnvelope.add(hull);
    nacelleAnodized.push(hull);

    // Layer B: Stepped central raised armor crown segment (creates multi-level industrial depth instead of a uniform arc)
    const crownPlate = new THREE.Mesh(
      createBeveledArcSector(4.78, 5.42, centerA - crownHalfArc, centerA + crownHalfArc, 0.18, 0.026, 0.026, 18),
      materials.anodizedBlack
    );
    crownPlate.position.z = -0.25;
    outerEnvelope.add(crownPlate);
    nacelleAnodized.push(crownPlate);

    // Layer C: Machined dark-gunmetal outer perimeter trim rail + twin end transition bevel caps
    const bumper = new THREE.Mesh(
      createBeveledArcSector(5.38, 5.52, a0 + 0.04, a1 - 0.04, 0.18, 0.024, 0.024, 22),
      materials.brushedTitanium
    );
    bumper.position.z = -0.22;
    outerEnvelope.add(bumper);
    nacelleTitanium.push(bumper);

    const crownTrim = new THREE.Mesh(
      createBeveledArcSector(5.32, 5.44, centerA - crownHalfArc + 0.03, centerA + crownHalfArc - 0.03, 0.10, 0.016, 0.016, 16),
      materials.ringFrameMat
    );
    crownTrim.position.z = -0.14;
    outerEnvelope.add(crownTrim);
    nacelleRingFrame.push(crownTrim);

    // Recessed obsidian carbon-composite channel bed beneath the continuous optical ring
    const serviceDeck = new THREE.Mesh(
      createBeveledArcSector(4.82, 5.28, a0 + 0.04, a1 - 0.04, 0.10, 0.016, 0.016, 20),
      materials.darkCarbon
    );
    serviceDeck.position.z = -0.16;
    outerEnvelope.add(serviceDeck);
    nacelleCarbon.push(serviceDeck);

    // Slim matte graphite-ceramic inner thermal liner
    const thermalLiner = new THREE.Mesh(
      createBeveledArcSector(4.58, 4.74, a0 + 0.03, a1 - 0.03, 0.34, 0.02, 0.02, 20),
      materials.darkCeramic
    );
    thermalLiner.position.z = -0.42;
    outerEnvelope.add(thermalLiner);
    nacelleCeramic.push(thermalLiner);
  }

  // 4. Restrained Radial Load-Bearing I-Beam Spars & Transverse Chord Cross-Braces with Machined Splice Collars
  const sparBodyGeo = createBeveledTrapezoid(0.32, 0.24, 2.48, 0.30, 0.026, 0.026);
  const sparFlangeGeo = createBeveledTrapezoid(0.11, 0.08, 2.30, 0.07, 0.012, 0.012);
  const braceGeo = createBeveledTrapezoid(2.22, 2.04, 0.20, 0.18, 0.02, 0.02);
  const braceSpliceGeo = createBeveledTrapezoid(0.46, 0.38, 0.26, 0.22, 0.018, 0.018);

  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const rMid = 3.44;
    const sparBody = new THREE.Mesh(sparBodyGeo, materials.anodizedBlack);
    sparBody.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, -0.62);
    sparBody.rotation.z = a + Math.PI / 2;
    outerEnvelope.add(sparBody);
    nacelleAnodized.push(sparBody);

    const sparFlange = new THREE.Mesh(sparFlangeGeo, materials.ringFrameMat);
    sparFlange.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, -0.45);
    sparFlange.rotation.z = a + Math.PI / 2;
    outerEnvelope.add(sparFlange);
    nacelleRingFrame.push(sparFlange);
  }

  // 3 restrained transverse chord cross-braces anchored at r = 3.56 with gunmetal center splice brackets
  for (let i = 0; i < 3; i++) {
    const a = ((Math.PI * 2) / 3) * i;
    const bx = Math.cos(a + Math.PI / 2) * 3.56;
    const by = Math.sin(a + Math.PI / 2) * 3.56;
    const brace = new THREE.Mesh(braceGeo, materials.darkCeramic);
    brace.position.set(bx, by, -0.66);
    brace.rotation.z = a;
    outerEnvelope.add(brace);
    nacelleCeramic.push(brace);

    const splice = new THREE.Mesh(braceSpliceGeo, materials.ringFrameMat);
    splice.position.set(bx, by, -0.62);
    splice.rotation.z = a;
    outerEnvelope.add(splice);
    nacelleRingFrame.push(splice);
  }

  // 5. Continuous 360° Smoked Optical Accelerator Raceway + Restrained Plasma Guide + High-Res Runners
  const glassTunnelMesh = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius, 0.115, 18, 96),
    materials.outerGlassRingMat
  );
  glassTunnelMesh.name = "arc-outer-transparent-glass-ring";
  glassTunnelMesh.position.z = 0.04;
  glassTunnelMesh.renderOrder = 3;
  glassTunnelMesh.updateMatrix();
  glassTunnelMesh.matrixAutoUpdate = false;
  outerEnvelope.add(glassTunnelMesh);

  const plasmaGuideMesh = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius, 0.018, 12, 96),
    materials.neonTubeMat
  );
  plasmaGuideMesh.name = "arc-outer-plasma-guide";
  plasmaGuideMesh.position.z = 0.04;
  plasmaGuideMesh.updateMatrix();
  plasmaGuideMesh.matrixAutoUpdate = false;
  outerEnvelope.add(plasmaGuideMesh);

  addOuterLightRunners(outerEnvelope, materials, lightRunners, ringRadius, 10, 0.105, 0.04);

  outerEnvelope.updateMatrixWorld(true);
  mergeGeometryBatch(nacelleAnodized, materials.anodizedBlack, outerEnvelope, "arc-merged-nacelles-anodizedBlack");
  mergeGeometryBatch(nacelleTitanium, materials.brushedTitanium, outerEnvelope, "arc-merged-nacelles-brushedTitanium");
  mergeGeometryBatch(nacelleRingFrame, materials.ringFrameMat, outerEnvelope, "arc-merged-nacelles-ringFrameMat");
  mergeGeometryBatch(nacelleCarbon, materials.darkCarbon, outerEnvelope, "arc-merged-nacelles-darkCarbon");
  mergeGeometryBatch(nacelleCeramic, materials.darkCeramic, outerEnvelope, "arc-merged-nacelles-darkCeramic");

  // 6. Balanced Tri-Symmetric Outer Substations (mechanically interlocked with containment carrier rail)
  buildAsymmetricOuterModules(outerEnvelope, materials);
  buildOuterMicroDetails(outerEnvelope, materials, ringRadius);
  reactorGroup.add(outerEnvelope);

  // ==========================================
  // Deep Open-Bay Counter-Rotating Mechanical Turbine Assembly (Recessed for Clean Negative Space)
  // ==========================================
  const internalTurbine = new THREE.Group();
  internalTurbine.name = "arc-turbine-primary";
  internalTurbine.position.z = -0.78;

  const bladeGeo = createBeveledTrapezoid(0.22, 0.13, 1.12, 0.075, 0.014, 0.014);
  const bladeInst = new THREE.InstancedMesh(bladeGeo, materials.anodizedBlack, 18);
  bladeInst.name = "arc-turbine-primary-blades";
  const dummyBlade = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const a = ((Math.PI * 2) / 18) * i;
    dummyBlade.position.set(Math.cos(a) * 3.12, Math.sin(a) * 3.12, 0);
    dummyBlade.rotation.set(0.36, 0, a + Math.PI / 2);
    dummyBlade.updateMatrix();
    bladeInst.setMatrixAt(i, dummyBlade.matrix);
  }
  bladeInst.instanceMatrix.needsUpdate = true;
  bladeInst.computeBoundingSphere();
  internalTurbine.add(bladeInst);

  const rotorHubGeo = createChamferedRingLathe(
    [
      [2.18, -0.10],
      [2.25, 0.10],
      [2.48, 0.10],
      [2.56, -0.10],
    ],
    48
  );
  const rotorHub = new THREE.Mesh(rotorHubGeo, materials.ringFrameMat);
  rotorHub.name = "arc-turbine-rotor-hub";
  internalTurbine.add(rotorHub);
  reactorGroup.add(internalTurbine);

  const internalTurbineSecondary = new THREE.Group();
  internalTurbineSecondary.name = "arc-turbine-secondary";
  internalTurbineSecondary.position.z = -0.62;

  const statorVaneGeo = createBeveledTrapezoid(0.17, 0.11, 0.72, 0.07, 0.012, 0.012);
  const statorInst = new THREE.InstancedMesh(statorVaneGeo, materials.copperWinding, 12);
  statorInst.name = "arc-turbine-secondary-stator";
  for (let i = 0; i < 12; i++) {
    const a = ((Math.PI * 2) / 12) * i;
    dummyBlade.position.set(Math.cos(a) * 2.36, Math.sin(a) * 2.36, 0);
    dummyBlade.rotation.set(-0.34, 0, a + Math.PI / 2);
    dummyBlade.updateMatrix();
    statorInst.setMatrixAt(i, dummyBlade.matrix);
  }
  statorInst.instanceMatrix.needsUpdate = true;
  statorInst.computeBoundingSphere();
  internalTurbineSecondary.add(statorInst);
  reactorGroup.add(internalTurbineSecondary);

  // ==========================================
  // Refined Waveguide Trenches, Compact Containment Clamps & Anchored Process Nodes
  // ==========================================
  const apothem = 2.58;
  buildTrenches(reactorGroup, materials, lighting, apothem);
  buildCornerClamps(reactorGroup, materials, apothem);
  buildFiberOpticsAndDataModules(reactorGroup, materials);

  // ==========================================
  // Deep 7-Layer Central Mechanical Energy Chamber
  // ==========================================
  const coreGroup = new THREE.Group();
  coreGroup.name = "arc-central-core";

  const plasmaFilaments = new THREE.Group();
  plasmaFilaments.name = "arc-plasma-system";

  const confinementRings = new THREE.Group();
  confinementRings.name = "arc-containment-system";
  coreGroup.add(confinementRings);

  coreGroup.add(lighting.coreLight);
  coreGroup.add(lighting.innerChamberLight);

  buildCoreDecorations(coreGroup, materials, graphicsQuality);

  reactorGroup.add(coreGroup);
  applySelectiveShadowFlags(reactorGroup);

  return {
    reactorGroup,
    internalTurbine,
    internalTurbineSecondary,
    plasmaFilaments,
    confinementRings,
    lightRunners,
  };
}
