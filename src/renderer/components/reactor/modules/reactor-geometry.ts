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
    for (let i = 0; i < count; i++) {
      const arcLengths = [0.28, 0.46, 0.72, 0.36, 0.82, 0.32, 0.58, 0.92, 0.42, 0.64];
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

      const coreGeo = new THREE.TorusGeometry(radius, thickness * 0.24, 8, 28, arcLen);
      const capStartGeo = new THREE.SphereGeometry(thickness * 0.34, 8, 8);
      capStartGeo.translate(radius, 0, 0);
      const mergedCoreGeo =
        BufferGeometryUtils.mergeGeometries([coreGeo, capStartGeo], false) || coreGeo;
      if (mergedCoreGeo !== coreGeo) coreGeo.dispose();
      capStartGeo.dispose();
      const coreMesh = new THREE.Mesh(mergedCoreGeo, coreMat);
      coreMesh.matrixAutoUpdate = false;
      group.add(coreMesh);

      const auraGeo = new THREE.TorusGeometry(radius, thickness * 0.56, 8, 28, arcLen);
      const capEndGeo = new THREE.SphereGeometry(thickness * 0.16, 8, 8);
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
  // OPEN-FRAME EXOSKELETON & TRI-LOBED SEGMENTED CONTAINMENT NACELLES
  // (No solid circular rear disc — open structural bays expose deep internal machinery)
  // ==========================================
  const outerEnvelope = new THREE.Group();
  outerEnvelope.name = "arc-outer-envelope";
  const ringRadius = 5.32;

  // 1. Deep Recessed Open Rear Structural Hub Collar (supports turbine & spars, open center)
  const rearHubGeo = createChamferedRingLathe(
    [
      [1.82, -1.32],
      [2.64, -1.32],
      [2.74, -1.16],
      [2.64, -0.96],
      [1.92, -0.96],
      [1.82, -1.12],
      [1.82, -1.32],
    ],
    64
  );
  const rearHub = new THREE.Mesh(rearHubGeo, materials.anodizedBlack);
  rearHub.name = "arc-rear-structural-hub";
  rearHub.updateMatrix();
  rearHub.matrixAutoUpdate = false;
  outerEnvelope.add(rearHub);

  // 2. Three Massive Segmented Containment Nacelles (centered at 90°, 210°, 330°; 66° arcs)
  // Leaves 3 massive 54° open bays at 30°, 150°, 270° filled by asymmetric industrial substations.
  const nacelleAnodized: THREE.Mesh[] = [];
  const nacelleTitanium: THREE.Mesh[] = [];
  const nacelleCarbon: THREE.Mesh[] = [];
  const nacelleCeramic: THREE.Mesh[] = [];

  const nacelleAngles = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6];
  const halfArc = (33 * Math.PI) / 180; // 66° total arc per nacelle

  for (const centerA of nacelleAngles) {
    const a0 = centerA - halfArc;
    const a1 = centerA + halfArc;

    // Deep primary structural nacelle armor hull (1.02 units thick!)
    const hull = new THREE.Mesh(
      createBeveledArcSector(4.62, 5.86, a0, a1, 0.92, 0.08, 0.08, 20),
      materials.anodizedBlack
    );
    hull.position.z = -0.62;
    outerEnvelope.add(hull);
    nacelleAnodized.push(hull);

    // Outer stepped brushed titanium blast rail wrapping the perimeter of the nacelle
    const bumper = new THREE.Mesh(
      createBeveledArcSector(5.68, 5.96, a0 + 0.04, a1 - 0.04, 0.42, 0.045, 0.045, 18),
      materials.brushedTitanium
    );
    bumper.position.z = -0.22;
    outerEnvelope.add(bumper);
    nacelleTitanium.push(bumper);

    // Recessed carbon-composite service bulkhead deck on the forward face of the nacelle
    const serviceDeck = new THREE.Mesh(
      createBeveledArcSector(4.78, 5.56, a0 + 0.06, a1 - 0.06, 0.14, 0.025, 0.025, 16),
      materials.darkCarbon
    );
    serviceDeck.position.z = -0.10;
    outerEnvelope.add(serviceDeck);
    nacelleCarbon.push(serviceDeck);

    // Matte dark ceramic inner thermal isolation liner facing the open turbine bay
    const thermalLiner = new THREE.Mesh(
      createBeveledArcSector(4.42, 4.68, a0 + 0.03, a1 - 0.03, 0.62, 0.035, 0.035, 16),
      materials.darkCeramic
    );
    thermalLiner.position.z = -0.58;
    outerEnvelope.add(thermalLiner);
    nacelleCeramic.push(thermalLiner);
  }

  // 3. Open-Frame Radial Load-Bearing I-Beam Spars & Transverse Cross-Braces
  // Physically connect inner hub collar to the 3 nacelles and 3 bay substations without closing space!
  const sparBodyGeo = createBeveledTrapezoid(0.58, 0.42, 2.55, 0.56, 0.05, 0.05);
  const sparFlangeGeo = createBeveledTrapezoid(0.24, 0.16, 2.38, 0.14, 0.02, 0.02);
  const braceGeo = createBeveledTrapezoid(2.35, 2.15, 0.30, 0.28, 0.03, 0.03);

  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const rMid = 3.62;
    const sparBody = new THREE.Mesh(sparBodyGeo, materials.anodizedBlack);
    sparBody.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, -0.84);
    sparBody.rotation.z = a + Math.PI / 2;
    outerEnvelope.add(sparBody);
    nacelleAnodized.push(sparBody);

    const sparFlange = new THREE.Mesh(sparFlangeGeo, materials.brushedTitanium);
    sparFlange.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, -0.50);
    sparFlange.rotation.z = a + Math.PI / 2;
    outerEnvelope.add(sparFlange);
    nacelleTitanium.push(sparFlange);
  }

  // 3 deep transverse chord cross-braces tying adjacent spars together behind the trenches
  for (let i = 0; i < 3; i++) {
    const a = ((Math.PI * 2) / 3) * i;
    const brace = new THREE.Mesh(braceGeo, materials.darkCeramic);
    brace.position.set(Math.cos(a + Math.PI / 2) * 3.85, Math.sin(a + Math.PI / 2) * 3.85, -1.04);
    brace.rotation.z = a;
    outerEnvelope.add(brace);
    nacelleCeramic.push(brace);
  }

  // 4. Segmented Optical Accelerator Tunnels spanning the 3 open bays + plasma guide + runners
  const bayAngles = [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2];
  const glassTunnelMeshes: THREE.Mesh[] = [];
  const plasmaArcMeshes: THREE.Mesh[] = [];
  const baySpan = (54 * Math.PI) / 180;

  for (const bayA of bayAngles) {
    const startA = bayA - baySpan * 0.5;
    const glassArc = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.14, 18, 36, baySpan),
      materials.outerGlassRingMat
    );
    glassArc.rotation.z = startA;
    glassArc.position.z = -0.14;
    outerEnvelope.add(glassArc);
    glassTunnelMeshes.push(glassArc);

    const plasmaArc = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.024, 10, 32, baySpan),
      materials.neonTubeMat
    );
    plasmaArc.rotation.z = startA;
    plasmaArc.position.z = -0.14;
    outerEnvelope.add(plasmaArc);
    plasmaArcMeshes.push(plasmaArc);
  }

  addRunners(outerEnvelope, ringRadius, 10, 0.13, -0.14);

  outerEnvelope.updateMatrixWorld(true);
  mergeGeometryBatch(nacelleAnodized, materials.anodizedBlack, outerEnvelope, "arc-merged-nacelles-anodizedBlack");
  mergeGeometryBatch(nacelleTitanium, materials.brushedTitanium, outerEnvelope, "arc-merged-nacelles-brushedTitanium");
  mergeGeometryBatch(nacelleCarbon, materials.darkCarbon, outerEnvelope, "arc-merged-nacelles-darkCarbon");
  mergeGeometryBatch(nacelleCeramic, materials.darkCeramic, outerEnvelope, "arc-merged-nacelles-darkCeramic");
  const mergedGlassTunnels = mergeGeometryBatch(
    glassTunnelMeshes,
    materials.outerGlassRingMat,
    outerEnvelope,
    "arc-outer-transparent-glass-ring"
  );
  if (mergedGlassTunnels) mergedGlassTunnels.renderOrder = 3;
  mergeGeometryBatch(plasmaArcMeshes, materials.neonTubeMat, outerEnvelope, "arc-outer-plasma-guide");

  // 5. Functional Asymmetric Outer Modules (Thermal Condenser, Cryo-Capacitor Pod, Ventral Keel)
  buildAsymmetricOuterModules(outerEnvelope, materials);
  buildOuterMicroDetails(outerEnvelope, materials, ringRadius);
  reactorGroup.add(outerEnvelope);

  // ==========================================
  // Deep Open-Bay Counter-Rotating Mechanical Turbine Assembly
  // ==========================================
  const internalTurbine = new THREE.Group();
  internalTurbine.name = "arc-turbine-primary";
  internalTurbine.position.z = -0.98;

  const bladeGeo = createBeveledTrapezoid(0.32, 0.18, 1.12, 0.10, 0.02, 0.02);
  const bladeInst = new THREE.InstancedMesh(bladeGeo, materials.brushedTitanium, 18);
  bladeInst.name = "arc-turbine-primary-blades";
  const dummyBlade = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const a = ((Math.PI * 2) / 18) * i;
    dummyBlade.position.set(Math.cos(a) * 3.12, Math.sin(a) * 3.12, 0);
    dummyBlade.rotation.set(0.42, 0, a + Math.PI / 2);
    dummyBlade.updateMatrix();
    bladeInst.setMatrixAt(i, dummyBlade.matrix);
  }
  bladeInst.instanceMatrix.needsUpdate = true;
  bladeInst.computeBoundingSphere();
  internalTurbine.add(bladeInst);

  const rotorHubGeo = createChamferedRingLathe(
    [
      [2.38, -0.14],
      [2.46, 0.14],
      [2.64, 0.14],
      [2.72, -0.14],
    ],
    48
  );
  const rotorHub = new THREE.Mesh(rotorHubGeo, materials.ringFrameMat);
  rotorHub.name = "arc-turbine-rotor-hub";
  internalTurbine.add(rotorHub);
  reactorGroup.add(internalTurbine);

  const internalTurbineSecondary = new THREE.Group();
  internalTurbineSecondary.name = "arc-turbine-secondary";
  internalTurbineSecondary.position.z = -0.74;

  const statorVaneGeo = createBeveledTrapezoid(0.22, 0.14, 0.68, 0.09, 0.015, 0.015);
  const statorInst = new THREE.InstancedMesh(statorVaneGeo, materials.copperWinding, 12);
  statorInst.name = "arc-turbine-secondary-stator";
  for (let i = 0; i < 12; i++) {
    const a = ((Math.PI * 2) / 12) * i;
    dummyBlade.position.set(Math.cos(a) * 2.38, Math.sin(a) * 2.38, 0);
    dummyBlade.rotation.set(-0.36, 0, a + Math.PI / 2);
    dummyBlade.updateMatrix();
    statorInst.setMatrixAt(i, dummyBlade.matrix);
  }
  statorInst.instanceMatrix.needsUpdate = true;
  statorInst.computeBoundingSphere();
  internalTurbineSecondary.add(statorInst);
  reactorGroup.add(internalTurbineSecondary);

  // ==========================================
  // Deep Waveguide Trenches, Massive Containment Clamps & Anchored Process Nodes
  // ==========================================
  const apothem = 2.65;
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
