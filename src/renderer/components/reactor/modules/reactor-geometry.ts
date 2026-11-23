import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import {
  buildTrenches,
  buildCornerClamps,
  buildFiberOpticsAndDataModules,
} from "./reactor-geometry-sub";
import { buildCoreDecorations } from "./reactor-geometry-core-decor";
import {
  ensureUv2,
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

  const addRunners = (
    parentGroup: THREE.Object3D,
    radius: number,
    count: number,
    thickness: number,
    zOffset: number = 0
  ) => {
    for (let i = 0; i < count; i++) {
      const arcLengths = [0.3, 0.5, 0.8, 0.4, 0.9, 0.35, 0.65, 1.1, 0.45, 0.7];
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

      const coreGeo = new THREE.TorusGeometry(radius, thickness * 0.24, 8, 32, arcLen);
      const capStartGeo = new THREE.SphereGeometry(thickness * 0.36, 10, 10);
      capStartGeo.translate(radius, 0, 0);
      const mergedCoreGeo =
        BufferGeometryUtils.mergeGeometries([coreGeo, capStartGeo], false) || coreGeo;
      if (mergedCoreGeo !== coreGeo) coreGeo.dispose();
      capStartGeo.dispose();
      const coreMesh = new THREE.Mesh(mergedCoreGeo, coreMat);
      coreMesh.matrixAutoUpdate = false;
      group.add(coreMesh);

      const auraGeo = new THREE.TorusGeometry(radius, thickness * 0.6, 8, 32, arcLen);
      const capEndGeo = new THREE.SphereGeometry(thickness * 0.18, 8, 8);
      capEndGeo.translate(Math.cos(arcLen) * radius, Math.sin(arcLen) * radius, 0);
      const mergedAuraGeo =
        BufferGeometryUtils.mergeGeometries([auraGeo, capEndGeo], false) || auraGeo;
      if (mergedAuraGeo !== auraGeo) auraGeo.dispose();
      capEndGeo.dispose();
      const auraMesh = new THREE.Mesh(mergedAuraGeo, glowMat);
      auraMesh.matrixAutoUpdate = false;
      group.add(auraMesh);

      group.position.z = zOffset;
      group.rotation.z = (i / count) * Math.PI * 2 + (i % 3) * 0.4;

      const dir = i % 2 === 0 ? 1 : -1;
      const baseSpeed = dir * (0.22 + ((i * 7) % 5) * 0.05);
      const isInitialActive = i % 2 === 0 || i === 1 || i === 7;
      const state: "igniting" | "active" | "dissipating" | "dormant" =
        isInitialActive ? "active" : "dormant";
      const timer = isInitialActive ? 1.5 + (i % 4) * 1.2 : 0.4 + (i % 3) * 0.8;
      const curOpacity = isInitialActive ? 0.85 : 0.0;

      group.visible = isInitialActive;
      group.userData = {
        baseSpeed,
        direction: dir,
        state,
        timer,
        maxLife: 2.2 + (i % 4) * 1.1,
        opacity: curOpacity,
        pulseFreq: 3.0 + (i % 4) * 1.5,
        pulseOffset: i * 0.9,
      };

      parentGroup.add(group);
      lightRunners.push({ group, coreMat, glowMat });
    }
  };

  // ==========================================
  // Outer Envelope: Bulkhead Deck, Stepped Containment Ring, Beveled Armor Sectors,
  // Radial Load-Bearing Struts, Optical Conduit Ring & Sculpted Exhaust Cowlings
  // ==========================================
  const outerEnvelope = new THREE.Group();
  outerEnvelope.name = "arc-outer-envelope";

  const ringRadius = 5.38;

  // 1. Solid Recessed Carbon-Composite Structural Backplane Deck (zero void holes)
  const bulkheadDeckGeo = new THREE.CylinderGeometry(5.52, 5.36, 0.24, 96);
  bulkheadDeckGeo.rotateX(Math.PI / 2);
  ensureUv2(bulkheadDeckGeo);
  const bulkheadDeck = new THREE.Mesh(bulkheadDeckGeo, materials.darkCarbon);
  bulkheadDeck.name = "arc-bulkhead-deck-carbon";
  bulkheadDeck.position.z = -0.68;
  bulkheadDeck.updateMatrix();
  bulkheadDeck.matrixAutoUpdate = false;
  outerEnvelope.add(bulkheadDeck);

  // 2. Stepped Machined Anodized Titanium Outer Containment Ring (Lathe with 45° bevels)
  const containmentRingGeo = createChamferedRingLathe(
    [
      [5.04, -0.78],
      [5.80, -0.78],
      [5.88, -0.58],
      [5.88, -0.24],
      [5.76, -0.10],
      [5.62, -0.10],
      [5.54, -0.26],
      [5.22, -0.26],
      [5.14, -0.14],
      [5.04, -0.22],
      [5.04, -0.78],
    ],
    96
  );
  const containmentRing = new THREE.Mesh(containmentRingGeo, materials.anodizedBlack);
  containmentRing.name = "arc-outer-containment-ring";
  containmentRing.updateMatrix();
  containmentRing.matrixAutoUpdate = false;
  outerEnvelope.add(containmentRing);

  // 3. 6 Segmented Beveled Curved Anodized Titanium Armor Sectors (expansion seams reveal depth)
  const armorSectorMeshes: THREE.Mesh[] = [];
  const sectorSpan = (Math.PI * 2) / 6;
  const seamGap = 0.055;
  for (let i = 0; i < 6; i++) {
    const a0 = i * sectorSpan + Math.PI / 6 + seamGap;
    const a1 = (i + 1) * sectorSpan + Math.PI / 6 - seamGap;
    const sectorGeo = createBeveledArcSector(3.16, 4.98, a0, a1, 0.16, 0.045, 0.045, 18);
    const sectorMesh = new THREE.Mesh(sectorGeo, materials.anodizedBlack);
    sectorMesh.position.z = -0.34;
    outerEnvelope.add(sectorMesh);
    armorSectorMeshes.push(sectorMesh);
  }

  // 4. 6 Heavy Beveled Radial Load-Bearing Bulkhead Struts (30°, 90°, 150°, 210°, 270°, 330°)
  const strutAnodizedMeshes: THREE.Mesh[] = [];
  const strutTitaniumMeshes: THREE.Mesh[] = [];
  const strutBodyGeo = createBeveledTrapezoid(0.56, 0.44, 2.75, 0.22, 0.045, 0.045);
  const strutCrownGeo = createBeveledTrapezoid(0.24, 0.18, 2.55, 0.08, 0.02, 0.02);

  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const rMid = 3.82;
    const strutBody = new THREE.Mesh(strutBodyGeo, materials.anodizedBlack);
    strutBody.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, -0.22);
    strutBody.rotation.z = a + Math.PI / 2;
    outerEnvelope.add(strutBody);
    strutAnodizedMeshes.push(strutBody);

    const strutCrown = new THREE.Mesh(strutCrownGeo, materials.brushedTitanium);
    strutCrown.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, -0.09);
    strutCrown.rotation.z = a + Math.PI / 2;
    outerEnvelope.add(strutCrown);
    strutTitaniumMeshes.push(strutCrown);
  }

  // 5. Transparent Optical Glass Plasma Conduit Ring + Plasma Guide + 10 Runners
  const outerGlassRing = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius, 0.16, 24, 112),
    materials.outerGlassRingMat
  );
  outerGlassRing.position.z = -0.13;
  outerGlassRing.name = "arc-outer-transparent-glass-ring";
  outerGlassRing.renderOrder = 3;
  outerGlassRing.updateMatrix();
  outerGlassRing.matrixAutoUpdate = false;
  outerEnvelope.add(outerGlassRing);

  const innerBezelGeo = new THREE.TorusGeometry(ringRadius - 0.17, 0.026, 12, 96);
  ensureUv2(innerBezelGeo);
  const innerBezel = new THREE.Mesh(innerBezelGeo, materials.brushedTitanium);
  innerBezel.name = "arc-outer-inner-bezel";
  innerBezel.position.z = -0.13;
  innerBezel.updateMatrix();
  innerBezel.matrixAutoUpdate = false;
  outerEnvelope.add(innerBezel);

  const ringPlasmaGuide = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius, 0.025, 12, 96),
    materials.neonTubeMat
  );
  ringPlasmaGuide.position.z = -0.13;
  ringPlasmaGuide.name = "arc-outer-plasma-guide";
  ringPlasmaGuide.updateMatrix();
  ringPlasmaGuide.matrixAutoUpdate = false;
  outerEnvelope.add(ringPlasmaGuide);

  addRunners(outerEnvelope, ringRadius, 10, 0.13, -0.13);

  // 6. 12 Sculpted Beveled Exhaust Cowlings (merged by material -> 3 draw calls)
  const nozzleHousingMeshes: THREE.Mesh[] = [];
  const nozzleTrimMeshes: THREE.Mesh[] = [];
  const nozzleInteriorMeshes: THREE.Mesh[] = [];
  const tempNozzleGroups: THREE.Group[] = [];

  const cowlingGeo = createBeveledTrapezoid(0.36, 0.28, 0.48, 0.28, 0.035, 0.035);
  const collarTrimGeo = createBeveledTrapezoid(0.40, 0.34, 0.14, 0.32, 0.022, 0.022);
  const ventCoreGeo = new THREE.BoxGeometry(0.16, 0.24, 0.12);

  for (let i = 0; i < 12; i++) {
    const nAngle = ((Math.PI * 2) / 12) * i;
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(Math.cos(nAngle) * 5.08, Math.sin(nAngle) * 5.08, -0.25);
    nozzleGroup.rotation.z = nAngle;

    const housing = new THREE.Mesh(cowlingGeo, materials.heatTintedMetal);
    nozzleGroup.add(housing);
    nozzleHousingMeshes.push(housing);

    const trim = new THREE.Mesh(collarTrimGeo, materials.brushedTitanium);
    trim.position.x = 0.04;
    trim.position.z = 0.02;
    nozzleGroup.add(trim);
    nozzleTrimMeshes.push(trim);

    const interior = new THREE.Mesh(ventCoreGeo, materials.neonTubeMat);
    interior.position.set(-0.08, 0, 0.08);
    nozzleGroup.add(interior);
    nozzleInteriorMeshes.push(interior);

    outerEnvelope.add(nozzleGroup);
    tempNozzleGroups.push(nozzleGroup);
  }

  outerEnvelope.updateMatrixWorld(true);
  mergeGeometryBatch(armorSectorMeshes, materials.anodizedBlack, outerEnvelope, "arc-merged-armor-sectors");
  mergeGeometryBatch(strutAnodizedMeshes, materials.anodizedBlack, outerEnvelope, "arc-merged-radial-struts-anodized");
  mergeGeometryBatch(strutTitaniumMeshes, materials.brushedTitanium, outerEnvelope, "arc-merged-radial-struts-titanium");
  mergeGeometryBatch(nozzleHousingMeshes, materials.heatTintedMetal, outerEnvelope, "arc-merged-nozzles-heatTintedMetal");
  mergeGeometryBatch(nozzleTrimMeshes, materials.brushedTitanium, outerEnvelope, "arc-merged-nozzles-brushedTitanium");
  mergeGeometryBatch(nozzleInteriorMeshes, materials.neonTubeMat, outerEnvelope, "arc-merged-nozzles-neonTubeMat");
  tempNozzleGroups.forEach((g) => outerEnvelope.remove(g));

  buildOuterMicroDetails(outerEnvelope, materials, ringRadius);
  reactorGroup.add(outerEnvelope);

  // ==========================================
  // Recessed Counter-Rotating Mechanical Turbine Assembly
  // (Driven smoothly by reactor-state-driver.ts)
  // ==========================================
  const internalTurbine = new THREE.Group();
  internalTurbine.name = "arc-turbine-primary";
  internalTurbine.position.z = -0.45;

  const bladeGeo = createBeveledTrapezoid(0.24, 0.14, 0.72, 0.07, 0.015, 0.015);
  const bladeInst = new THREE.InstancedMesh(bladeGeo, materials.brushedTitanium, 18);
  bladeInst.name = "arc-turbine-primary-blades";
  const dummyBlade = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const a = ((Math.PI * 2) / 18) * i;
    dummyBlade.position.set(Math.cos(a) * 2.74, Math.sin(a) * 2.74, 0);
    dummyBlade.rotation.set(0.32, 0, a + Math.PI / 2);
    dummyBlade.updateMatrix();
    bladeInst.setMatrixAt(i, dummyBlade.matrix);
  }
  bladeInst.instanceMatrix.needsUpdate = true;
  bladeInst.computeBoundingSphere();
  internalTurbine.add(bladeInst);

  const rotorHubGeo = createChamferedRingLathe(
    [
      [2.26, -0.05],
      [2.32, 0.05],
      [2.44, 0.05],
      [2.48, -0.05],
    ],
    48
  );
  const rotorHub = new THREE.Mesh(rotorHubGeo, materials.ringFrameMat);
  rotorHub.name = "arc-turbine-rotor-hub";
  internalTurbine.add(rotorHub);
  reactorGroup.add(internalTurbine);

  const internalTurbineSecondary = new THREE.Group();
  internalTurbineSecondary.name = "arc-turbine-secondary";
  internalTurbineSecondary.position.z = -0.37;

  const statorVaneGeo = createBeveledTrapezoid(0.18, 0.12, 0.48, 0.06, 0.012, 0.012);
  const statorInst = new THREE.InstancedMesh(statorVaneGeo, materials.copperWinding, 12);
  statorInst.name = "arc-turbine-secondary-stator";
  for (let i = 0; i < 12; i++) {
    const a = ((Math.PI * 2) / 12) * i;
    dummyBlade.position.set(Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0);
    dummyBlade.rotation.set(-0.28, 0, a + Math.PI / 2);
    dummyBlade.updateMatrix();
    statorInst.setMatrixAt(i, dummyBlade.matrix);
  }
  statorInst.instanceMatrix.needsUpdate = true;
  statorInst.computeBoundingSphere();
  internalTurbineSecondary.add(statorInst);
  reactorGroup.add(internalTurbineSecondary);

  // ==========================================
  // Main Triangular Waveguide Trenches, Sculpted Corner Clamps & Anchored Process Nodes
  // ==========================================
  const apothem = 2.65;
  buildTrenches(reactorGroup, materials, lighting, apothem);
  buildCornerClamps(reactorGroup, materials, apothem);
  buildFiberOpticsAndDataModules(reactorGroup, materials);

  // ==========================================
  // Central Core Array (7-Layer Mechanical Energy Chamber)
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
