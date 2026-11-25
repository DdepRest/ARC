import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
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

      // High-resolution smooth plasma runner core & soft optical aura
      const coreGeo = new THREE.TorusGeometry(radius, thickness * 0.25, 12, 48, arcLen);
      const capStartGeo = new THREE.SphereGeometry(thickness * 0.32, 10, 10);
      capStartGeo.translate(radius, 0, 0);
      const mergedCoreGeo =
        BufferGeometryUtils.mergeGeometries([coreGeo, capStartGeo], false) || coreGeo;
      if (mergedCoreGeo !== coreGeo) coreGeo.dispose();
      capStartGeo.dispose();
      const coreMesh = new THREE.Mesh(mergedCoreGeo, coreMat);
      coreMesh.matrixAutoUpdate = false;
      group.add(coreMesh);

      const auraGeo = new THREE.TorusGeometry(radius, thickness * 0.56, 12, 48, arcLen);
      const capEndGeo = new THREE.SphereGeometry(thickness * 0.16, 10, 10);
      capEndGeo.translate(Math.cos(arcLen) * radius, Math.sin(arcLen) * radius, 0);
      const mergedAuraGeo =
        BufferGeometryUtils.mergeGeometries([auraGeo, capEndGeo], false) || auraGeo;
      if (mergedAuraGeo !== auraGeo) auraGeo.dispose();
      capEndGeo.dispose();
      const auraMesh = new THREE.Mesh(mergedAuraGeo, glowMat);
      auraMesh.matrixAutoUpdate = false;
      group.add(auraMesh);

      group.position.z = zOffset;
      group.rotation.z = (i / count) * Math.PI * 2 + (i % 3) * 0.35;

      const dir = i % 2 === 0 ? 1 : -1;
      const baseSpeed = dir * (0.22 + ((i * 7) % 5) * 0.05);
      const isInitialActive = i % 3 === 0 || i === 5;
      const state: "igniting" | "active" | "dissipating" | "dormant" =
        isInitialActive ? "active" : "dormant";
      const timer = isInitialActive ? 1.8 + (i % 4) * 1.2 : 0.4 + (i % 3) * 0.7;
      const curOpacity = isInitialActive ? 0.72 : 0.0;

      group.visible = isInitialActive;
      group.userData = {
        baseSpeed,
        direction: dir,
        state,
        timer,
        maxLife: 2.4 + (i % 4) * 1.1,
        opacity: curOpacity,
        pulseFreq: 3.0 + (i % 4) * 1.4,
        pulseOffset: i * 0.9,
      };

      parentGroup.add(group);
      lightRunners.push({ group, coreMat, glowMat });
    }
  };

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

  // 2. Three Sleek Segmented Containment Nacelles (centered at 90°, 210°, 330°; 52° arcs)
  // Restrained arc & radial profile preserve crisp breathing room around the 30°/150°/270° bays and circular optical ring
  const nacelleAnodized: THREE.Mesh[] = [];
  const nacelleTitanium: THREE.Mesh[] = [];
  const nacelleCarbon: THREE.Mesh[] = [];
  const nacelleCeramic: THREE.Mesh[] = [];

  const nacelleAngles = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6];
  const halfArc = (26 * Math.PI) / 180; // 52° total arc per nacelle — restores intentional negative space

  for (const centerA of nacelleAngles) {
    const a0 = centerA - halfArc;
    const a1 = centerA + halfArc;

    // Primary obsidian anodized armor hull (slimmed inward edge to r = 4.70 for crisp separation from internal frame)
    const hull = new THREE.Mesh(
      createBeveledArcSector(4.70, 5.46, a0, a1, 0.52, 0.046, 0.046, 24),
      materials.anodizedBlack
    );
    hull.position.z = -0.44;
    outerEnvelope.add(hull);
    nacelleAnodized.push(hull);

    // Restrained slim dark-gunmetal outer perimeter trim rail
    const bumper = new THREE.Mesh(
      createBeveledArcSector(5.38, 5.52, a0 + 0.04, a1 - 0.04, 0.18, 0.024, 0.024, 22),
      materials.brushedTitanium
    );
    bumper.position.z = -0.22;
    outerEnvelope.add(bumper);
    nacelleTitanium.push(bumper);

    // Recessed obsidian carbon-composite channel bed beneath the continuous optical ring
    const serviceDeck = new THREE.Mesh(
      createBeveledArcSector(4.80, 5.30, a0 + 0.04, a1 - 0.04, 0.10, 0.016, 0.016, 20),
      materials.darkCarbon
    );
    serviceDeck.position.z = -0.16;
    outerEnvelope.add(serviceDeck);
    nacelleCarbon.push(serviceDeck);

    // Slim matte dark ceramic inner thermal liner (retracted from r = 4.28 to r = 4.58)
    const thermalLiner = new THREE.Mesh(
      createBeveledArcSector(4.58, 4.74, a0 + 0.03, a1 - 0.03, 0.34, 0.02, 0.02, 20),
      materials.darkCeramic
    );
    thermalLiner.position.z = -0.42;
    outerEnvelope.add(thermalLiner);
    nacelleCeramic.push(thermalLiner);
  }

  // 3. Restrained Radial Load-Bearing I-Beam Spars & Reference-Scale Transverse Chord Cross-Braces
  // Connects central chamber (r = 2.20) to outer nacelles (r = 4.68) with clean open bays between spans
  const sparBodyGeo = createBeveledTrapezoid(0.32, 0.24, 2.48, 0.30, 0.026, 0.026);
  const sparFlangeGeo = createBeveledTrapezoid(0.11, 0.08, 2.30, 0.07, 0.012, 0.012);
  const braceGeo = createBeveledTrapezoid(2.22, 2.04, 0.20, 0.18, 0.02, 0.02);

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
    nacelleTitanium.push(sparFlange);
  }

  // 3 restrained transverse chord cross-braces anchored at r = 3.56, recessed cleanly behind the trenches
  for (let i = 0; i < 3; i++) {
    const a = ((Math.PI * 2) / 3) * i;
    const brace = new THREE.Mesh(braceGeo, materials.darkCeramic);
    brace.position.set(Math.cos(a + Math.PI / 2) * 3.56, Math.sin(a + Math.PI / 2) * 3.56, -0.66);
    brace.rotation.z = a;
    outerEnvelope.add(brace);
    nacelleCeramic.push(brace);
  }

  // 4. Continuous 360° Smoked Optical Accelerator Raceway + Restrained Plasma Guide + High-Res Runners
  // Rides cleanly at z = +0.04 above recessed nacelle decks and through containment bays
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

  addRunners(outerEnvelope, ringRadius, 10, 0.105, 0.04);

  outerEnvelope.updateMatrixWorld(true);
  mergeGeometryBatch(nacelleAnodized, materials.anodizedBlack, outerEnvelope, "arc-merged-nacelles-anodizedBlack");
  mergeGeometryBatch(nacelleTitanium, materials.brushedTitanium, outerEnvelope, "arc-merged-nacelles-brushedTitanium");
  mergeGeometryBatch(nacelleCarbon, materials.darkCarbon, outerEnvelope, "arc-merged-nacelles-darkCarbon");
  mergeGeometryBatch(nacelleCeramic, materials.darkCeramic, outerEnvelope, "arc-merged-nacelles-darkCeramic");

  // 5. Balanced Tri-Symmetric Outer Substations (with restrained secondary engineering details)
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
