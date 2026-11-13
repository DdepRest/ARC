import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import { createHUDLabel } from "./reactor-particles";
import {
  buildTrenches,
  buildCornerClamps,
  buildFiberOpticsAndDataModules,
} from "./reactor-geometry-sub";
import { buildCoreDecorations } from "./reactor-geometry-core-decor";

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
      // Varied arc lengths for different kinds of energy pulses (short sparks to sweeping plasma streams)
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

      const coreGeo = new THREE.TorusGeometry(
        radius,
        thickness * 0.25,
        12,
        64,
        arcLen
      );
      const capStartGeo = new THREE.SphereGeometry(thickness * 0.4, 16, 16);
      capStartGeo.translate(radius, 0, 0);
      const mergedCoreGeo =
        BufferGeometryUtils.mergeGeometries([coreGeo, capStartGeo], false) || coreGeo;
      if (mergedCoreGeo !== coreGeo) coreGeo.dispose();
      capStartGeo.dispose();
      const coreMesh = new THREE.Mesh(mergedCoreGeo, coreMat);
      coreMesh.matrixAutoUpdate = false;
      group.add(coreMesh);

      const auraGeo = new THREE.TorusGeometry(
        radius,
        thickness * 0.65,
        12,
        64,
        arcLen
      );
      const capEndGeo = new THREE.SphereGeometry(thickness * 0.2, 12, 12);
      capEndGeo.translate(
        Math.cos(arcLen) * radius,
        Math.sin(arcLen) * radius,
        0
      );
      const mergedAuraGeo =
        BufferGeometryUtils.mergeGeometries([auraGeo, capEndGeo], false) || auraGeo;
      if (mergedAuraGeo !== auraGeo) auraGeo.dispose();
      capEndGeo.dispose();
      const auraMesh = new THREE.Mesh(mergedAuraGeo, glowMat);
      auraMesh.matrixAutoUpdate = false;
      group.add(auraMesh);

      group.position.z = zOffset;
      // Staggered initial angles across the full circle
      group.rotation.z = (i / count) * Math.PI * 2 + (i % 3) * 0.4;

      const dir = i % 2 === 0 ? 1 : -1;
      // Controlled, majestic pace (0.22 - 0.45 rad/sec)
      const baseSpeed = dir * (0.22 + ((i * 7) % 5) * 0.05);

      // Staggered initial lifecycles: 6 of 10 runners active across the ring perimeter
      const isInitialActive = i % 2 === 0 || i === 1 || i === 7;
      const state: "igniting" | "active" | "dissipating" | "dormant" =
        isInitialActive ? "active" : "dormant";
      const timer = isInitialActive
        ? 1.5 + (i % 4) * 1.2
        : 0.4 + (i % 3) * 0.8;
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
  // Outer Envelope (Base Plate, Transparent Glass Ring, Energy Flow, Nozzles)
  // ==========================================
  const outerEnvelope = new THREE.Group();
  outerEnvelope.name = "arc-outer-envelope";

  const baseRadius = 5.6;
  const ringRadius = baseRadius - 0.2; // 5.4

  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(baseRadius, baseRadius - 0.2, 0.6, 128),
    materials.anodizedBlack
  );
  basePlate.rotation.x = Math.PI / 2;
  basePlate.position.z = -0.5;
  basePlate.updateMatrix();
  basePlate.matrixAutoUpdate = false;
  outerEnvelope.add(basePlate);

  // 1. Transparent Glass Outer Ring (Optic transparent conduit)
  const outerGlassRing = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius, 0.17, 32, 128),
    materials.outerGlassRingMat
  );
  outerGlassRing.position.z = -0.15;
  outerGlassRing.name = "arc-outer-transparent-glass-ring";
  outerGlassRing.updateMatrix();
  outerGlassRing.matrixAutoUpdate = false;
  outerEnvelope.add(outerGlassRing);

  // 2. Titanium Frame Bezels framing the glass conduit
  const outerBezel = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius + 0.16, 0.02, 16, 128),
    materials.brushedTitanium
  );
  outerBezel.position.z = -0.15;
  outerBezel.updateMatrix();
  outerBezel.matrixAutoUpdate = false;
  outerEnvelope.add(outerBezel);

  const innerBezel = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius - 0.16, 0.02, 16, 128),
    materials.brushedTitanium
  );
  innerBezel.position.z = -0.15;
  innerBezel.updateMatrix();
  innerBezel.matrixAutoUpdate = false;
  outerEnvelope.add(innerBezel);

  // 3. Central Luminous Plasma Channel inside the transparent ring
  const ringPlasmaGuide = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius, 0.025, 16, 128),
    materials.neonTubeMat
  );
  ringPlasmaGuide.position.z = -0.15;
  ringPlasmaGuide.name = "arc-outer-plasma-guide";
  ringPlasmaGuide.updateMatrix();
  ringPlasmaGuide.matrixAutoUpdate = false;
  outerEnvelope.add(ringPlasmaGuide);

  // 4. Circulating Energy Runners inside transparent ring (10 dynamic runners)
  addRunners(outerEnvelope, ringRadius, 10, 0.14, -0.15);

  // Precision Monolith Heat Exhaust & Plasma Cooling Ports (Merged by material: 36 -> 3 draw calls)
  const nozzleHousingMeshes: THREE.Mesh[] = [];
  const nozzleTrimMeshes: THREE.Mesh[] = [];
  const nozzleInteriorMeshes: THREE.Mesh[] = [];
  const tempNozzleGroups: THREE.Group[] = [];

  for (let i = 0; i < 12; i++) {
    const nAngle = ((Math.PI * 2) / 12) * i;
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(Math.cos(nAngle) * 5.25, Math.sin(nAngle) * 5.25, -0.35);
    nozzleGroup.rotation.z = nAngle;

    const nozzleHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.45, 0.35),
      materials.heatTintedMetal
    );
    nozzleGroup.add(nozzleHousing);
    nozzleHousingMeshes.push(nozzleHousing);

    const nozzleTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.38),
      materials.brushedTitanium
    );
    nozzleGroup.add(nozzleTrim);
    nozzleTrimMeshes.push(nozzleTrim);

    const nozzleInterior = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.28, 0.2),
      materials.neonTubeMat
    );
    nozzleInterior.position.z = 0.08;
    nozzleGroup.add(nozzleInterior);
    nozzleInteriorMeshes.push(nozzleInterior);

    outerEnvelope.add(nozzleGroup);
    tempNozzleGroups.push(nozzleGroup);
  }

  outerEnvelope.updateMatrixWorld(true);

  const mergeNozzleSection = (
    meshes: THREE.Mesh[],
    material: THREE.Material,
    mergedName: string
  ) => {
    const geos: THREE.BufferGeometry[] = [];
    for (const mesh of meshes) {
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      const pos = geo.getAttribute("position");
      if (pos && !geo.getAttribute("uv")) {
        geo.setAttribute(
          "uv",
          new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)
        );
      }
      geos.push(geo);
    }
    const mergedGeo = BufferGeometryUtils.mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    for (const mesh of meshes) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
    if (mergedGeo) {
      const mergedMesh = new THREE.Mesh(mergedGeo, material);
      mergedMesh.name = mergedName;
      mergedMesh.updateMatrix();
      mergedMesh.matrixAutoUpdate = false;
      outerEnvelope.add(mergedMesh);
    }
  };

  mergeNozzleSection(
    nozzleHousingMeshes,
    materials.heatTintedMetal,
    "arc-merged-nozzles-heatTintedMetal"
  );
  mergeNozzleSection(
    nozzleTrimMeshes,
    materials.brushedTitanium,
    "arc-merged-nozzles-brushedTitanium"
  );
  mergeNozzleSection(
    nozzleInteriorMeshes,
    materials.neonTubeMat,
    "arc-merged-nozzles-neonTubeMat"
  );
  tempNozzleGroups.forEach((g) => outerEnvelope.remove(g));

  reactorGroup.add(outerEnvelope);

  // Trenches & Corner Clamps & Fiber Optics / Data Modules
  const apothem = 2.65;
  buildTrenches(reactorGroup, materials, lighting, apothem);
  buildCornerClamps(reactorGroup, materials, apothem);
  buildFiberOpticsAndDataModules(reactorGroup, materials);

  // ==========================================
  // Central Core Array (A.R.C. Core 4.1 Triangular Containment Core)
  // ==========================================
  const coreGroup = new THREE.Group();
  coreGroup.name = "arc-central-core";

  // Dummy turbine groups to preserve ReactorGeometryResult interface expectations
  const internalTurbine = new THREE.Group();
  internalTurbine.name = "arc-turbine-primary";
  const internalTurbineSecondary = new THREE.Group();
  internalTurbineSecondary.name = "arc-turbine-secondary";
  const plasmaFilaments = new THREE.Group();
  plasmaFilaments.name = "arc-plasma-system";

  // Empty confinementRings group to preserve ReactorGeometryResult interface without circles
  const confinementRings = new THREE.Group();
  confinementRings.name = "arc-containment-system";
  coreGroup.add(confinementRings);

  // Core Lights attachment
  coreGroup.add(lighting.coreLight);
  coreGroup.add(lighting.innerChamberLight);

  // Cognitive Singularity, Dual Glass Chamber, Support Struts, and ARC Diodes
  buildCoreDecorations(coreGroup, materials, graphicsQuality);

  reactorGroup.add(coreGroup);

  return {
    reactorGroup,
    internalTurbine,
    internalTurbineSecondary,
    plasmaFilaments,
    confinementRings,
    lightRunners,
  };
}

