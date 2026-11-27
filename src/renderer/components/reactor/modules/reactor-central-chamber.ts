import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import {
  ensureUv2,
  createBeveledTriangleFrame,
  createBeveledTriangleSolid,
  createBeveledTrapezoid,
  createBeveledPolygon,
  createBeveledHexagon,
  mergeGeometryBatch,
} from "./reactor-geometry-primitives";
import { applyCenteredPlasmaUvs, bakeRadialPlasmaVertexColors } from "./reactor-core-plasma";

export interface CentralChamberRig {
  group: THREE.Group;
  shell: THREE.Group;
  clamps: THREE.Group;
  triangularCoreMesh: THREE.Mesh;
  innerTriWireMesh?: THREE.Mesh | null;
  apertureInnerRim: THREE.Mesh;
  portsGroup: THREE.Group;
  conduitsGroup: THREE.Group;
  runnersGroup: THREE.Group;
  runners: THREE.Mesh[];
  portDiodeMeshes: THREE.Mesh[];
  coreVertexLights?: THREE.PointLight[];
}

/**
 * Builds the 7-Layer Central Mechanical Energy Chamber, Volumetric 4-Layer Plasma Core & Radial Feeders (ARC-056).
 */
export function buildCentralChamber(
  materials: ReactorMaterials,
  _graphicsQuality: string
): CentralChamberRig {
  const group = new THREE.Group();
  group.name = "arc-central-chamber-root";
  const shell = new THREE.Group();
  shell.name = "arc-chamber-shell";
  const clamps = new THREE.Group();
  clamps.name = "arc-chamber-clamps";
  const portsGroup = new THREE.Group();
  portsGroup.name = "arc-ports-group";
  group.add(shell, clamps, portsGroup);

  const R_INNER = 2.25;
  const APOTHEM_INNER = R_INNER / 2.0; // 1.125
  const SIDE_LEN = R_INNER * Math.sqrt(3); // ~3.897
  const R_OUTER = 4.85;
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  const innerVertices = angles.map((a) => new THREE.Vector3(Math.cos(a) * R_INNER, Math.sin(a) * R_INNER, 0.22));
  const outerVertices = angles.map((a) => new THREE.Vector3(Math.cos(a) * R_OUTER, Math.sin(a) * R_OUTER, 0.35));

  const chamberAnodized: THREE.Mesh[] = [];
  const chamberTitanium: THREE.Mesh[] = [];
  const chamberRingFrame: THREE.Mesh[] = [];
  const chamberCarbon: THREE.Mesh[] = [];
  const chamberCeramic: THREE.Mesh[] = [];
  const chamberCopper: THREE.Mesh[] = [];
  const chamberNeon: THREE.Mesh[] = [];

  // LAYER 1: One Dominant Outer Triangular Titanium Armor Frame + Precision Gunmetal Crown Bezel
  const innerChassisGroup = new THREE.Group();
  innerChassisGroup.name = "arc-inner-triangle-chassis";

  const mainBarrelMesh = new THREE.Mesh(createBeveledTriangleFrame(2.62, 1.66, 0.96, 0.064, 0.064), materials.anodizedBlack);
  mainBarrelMesh.position.z = -0.24;
  innerChassisGroup.add(mainBarrelMesh);
  chamberAnodized.push(mainBarrelMesh);

  const crownBezelMesh = new THREE.Mesh(createBeveledTriangleFrame(2.38, 1.88, 0.10, 0.024, 0.024), materials.brushedTitanium);
  crownBezelMesh.position.z = 0.31;
  innerChassisGroup.add(crownBezelMesh);
  chamberTitanium.push(crownBezelMesh);

  // =========================================================================
  // LAYER 2: 3 Edge Waveguide Channels, Riser Stanchions & Clamping Yokes
  // =========================================================================
  const trenchL = SIDE_LEN - 0.56;
  const floorGeo = createBeveledTrapezoid(trenchL, trenchL - 0.14, 0.42, 0.14, 0.018, 0.018);
  const yokeGeo = createBeveledTrapezoid(0.26, 0.19, 0.60, 0.22, 0.026, 0.026);
  const stanchionGeo = createBeveledTrapezoid(0.22, 0.18, 0.34, 0.36, 0.02, 0.02);
  const strapGeo = createBeveledTrapezoid(0.068, 0.068, 0.36, 0.045, 0.010, 0.010);

  for (let i = 0; i < 3; i++) {
    const edgeGroup = new THREE.Group();
    edgeGroup.name = `arc-inner-trench-edge-${i}`;
    edgeGroup.rotation.z = ((Math.PI * 2) / 3) * i;

    const floorMesh = new THREE.Mesh(floorGeo, materials.darkCarbon);
    floorMesh.position.set(0, APOTHEM_INNER, 0.12);
    edgeGroup.add(floorMesh);
    chamberCarbon.push(floorMesh);

    // Individual cloned material per edge for 3-band FFT audio reactivity
    const tubeGeo = new THREE.CylinderGeometry(0.06, 0.06, trenchL - 0.26, 20);
    ensureUv2(tubeGeo);
    const tubeMesh = new THREE.Mesh(tubeGeo, materials.neonTubeMat.clone());
    tubeMesh.rotation.z = Math.PI / 2;
    tubeMesh.position.set(0, APOTHEM_INNER, 0.24);
    tubeMesh.name = `arc-inner-plasma-tube-${i}`;
    edgeGroup.add(tubeMesh);

    // 2 Clamping Yokes (gunmetal) + Riser Stanchions + Subtle Copper Contacts per edge
    for (let r = -1; r <= 1; r += 2) {
      const xPos = r * (trenchL * 0.27);
      const stanchion = new THREE.Mesh(stanchionGeo, materials.darkCeramic);
      stanchion.position.set(xPos, APOTHEM_INNER + 0.14, 0.18);
      edgeGroup.add(stanchion);
      chamberCeramic.push(stanchion);

      const yoke = new THREE.Mesh(yokeGeo, materials.ringFrameMat);
      yoke.position.set(xPos, APOTHEM_INNER, 0.36);
      edgeGroup.add(yoke);
      chamberRingFrame.push(yoke);

      const strap = new THREE.Mesh(strapGeo, materials.copperWinding);
      strap.position.set(xPos, APOTHEM_INNER, 0.48);
      edgeGroup.add(strap);
      chamberCopper.push(strap);
    }

    innerChassisGroup.add(edgeGroup);
  }

  // Deep Multi-Tier Hexagonal Vertex Coupler Towers & Diodes (-90°, 30°, 150°)
  const portDiodeMeshes: THREE.Mesh[] = [];
  const coreVertexLights: THREE.PointLight[] = [];
  const hexTowerGeo = createBeveledHexagon(0.36, 0.88, 0.04, 0.04);
  const hexCeramicGeo = createBeveledHexagon(0.28, 0.18, 0.024, 0.024);
  const hexCapGeo = createBeveledHexagon(0.22, 0.14, 0.025, 0.025);
  const hexCopperRingGeo = new THREE.TorusGeometry(0.14, 0.02, 10, 18);
  ensureUv2(hexCopperRingGeo);

  innerVertices.forEach((v, i) => {
    const cornerGroup = new THREE.Group();
    cornerGroup.name = `arc-inner-corner-node-${i}`;
    cornerGroup.position.copy(v);

    const towerMesh = new THREE.Mesh(hexTowerGeo, materials.anodizedBlack);
    towerMesh.position.z = -0.34;
    cornerGroup.add(towerMesh);
    chamberAnodized.push(towerMesh);

    const ceramicCollar = new THREE.Mesh(hexCeramicGeo, materials.darkCeramic);
    ceramicCollar.position.z = 0.14;
    cornerGroup.add(ceramicCollar);
    chamberCeramic.push(ceramicCollar);

    const capMesh = new THREE.Mesh(hexCapGeo, materials.ringFrameMat);
    capMesh.position.z = 0.25;
    cornerGroup.add(capMesh);
    chamberRingFrame.push(capMesh);

    const copperRing = new THREE.Mesh(hexCopperRingGeo, materials.copperWinding);
    copperRing.position.z = 0.34;
    cornerGroup.add(copperRing);
    chamberCopper.push(copperRing);

    const diodeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 16), materials.coreDiodeMat);
    diodeMesh.position.z = 0.35;
    diodeMesh.name = `arc-inner-port-diode-${i}`;
    cornerGroup.add(diodeMesh);
    portDiodeMeshes.push(diodeMesh);

    const vertexLight = new THREE.PointLight(materials.currentColor.getHex(), 0.26, 4.2, 2.1);
    vertexLight.position.set(v.x, v.y, v.z + 0.36);
    vertexLight.name = `arc-vertex-light-${i}`;
    group.add(vertexLight);
    coreVertexLights.push(vertexLight);

    innerChassisGroup.add(cornerGroup);
  });

  group.add(innerChassisGroup);

  // LAYER 3: Deep Stepped Matte Ceramic Isolation Well, Focus Coils & Iris Guide Rails
  const addStatic = (
    parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
    bucket: THREE.Mesh[], x: number, y: number, z: number, rotZ = 0
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rotZ) m.rotation.z = rotZ;
    parent.add(m);
    bucket.push(m);
    return m;
  };

  addStatic(shell, createBeveledTriangleFrame(1.74, 1.28, 0.44, 0.04, 0.04), materials.darkCeramic, chamberCeramic, 0, 0, -0.14);
  addStatic(shell, createBeveledTriangleFrame(1.40, 0.98, 0.56, 0.035, 0.035), materials.darkCeramic, chamberCeramic, 0, 0, -0.60);
  addStatic(shell, createBeveledTriangleSolid(1.12, 0.14, 0.025, 0.025), materials.darkCeramic, chamberCeramic, 0, 0, -0.96);
  addStatic(shell, createBeveledTriangleFrame(0.96, 0.76, 0.18, 0.024, 0.024), materials.copperWinding, chamberCopper, 0, 0, -0.78);

  const guideRailGeo = createBeveledTrapezoid(0.13, 0.095, 0.58, 0.14, 0.014, 0.014);
  for (let i = 0; i < 3; i++) {
    const a = angles[i] + Math.PI / 3;
    addStatic(shell, guideRailGeo, materials.ringFrameMat, chamberRingFrame, Math.cos(a) * 0.96, Math.sin(a) * 0.96, -0.08, a + Math.PI / 2);
  }

  // LAYER 4: True 3D 6-Blade Mechanical Aperture Iris (`arc-aperture-inner-rim`)
  const apertureInnerRim = new THREE.Mesh(createBeveledTriangleFrame(1.06, 0.78, 0.14, 0.03, 0.03), materials.ringFrameMat);
  apertureInnerRim.name = "arc-aperture-inner-rim";
  apertureInnerRim.position.z = 0.02;

  const bladePoly = createBeveledPolygon([[-0.24, -0.08], [0.32, -0.05], [0.24, 0.14], [-0.18, 0.10]], 0.055, 0.012, 0.012);
  const irisBladeMeshes: THREE.Mesh[] = [];
  for (let b = 0; b < 6; b++) {
    const a = ((Math.PI * 2) / 6) * b + Math.PI / 6;
    addStatic(apertureInnerRim, bladePoly, materials.anodizedBlack, irisBladeMeshes, Math.cos(a) * 0.56, Math.sin(a) * 0.56, -0.04 + (b % 2) * 0.035, a + 0.55);
  }
  apertureInnerRim.updateMatrixWorld(true);
  mergeGeometryBatch(irisBladeMeshes, materials.anodizedBlack, apertureInnerRim, "arc-iris-shutter-blades");

  const irisCopperActuator = new THREE.Mesh(createBeveledTriangleFrame(0.84, 0.72, 0.08, 0.014, 0.014), materials.copperWinding);
  irisCopperActuator.position.z = -0.06;
  apertureInnerRim.add(irisCopperActuator);
  group.add(apertureInnerRim);

  // LAYER 5: Volumetric 4-Layer Central Plasma Energy Core, Containment & Spill Light (ARC-056)
  const facetedCavityGeo = new THREE.OctahedronGeometry(0.46, 1);
  facetedCavityGeo.scale(1.0, 1.0, 0.24);
  ensureUv2(facetedCavityGeo);
  const facetedCavity = new THREE.Mesh(facetedCavityGeo, materials.singularityFacetedMat);
  facetedCavity.name = "arc-core-faceted-cavity";
  facetedCavity.position.z = -0.745;
  facetedCavity.updateMatrix();
  facetedCavity.matrixAutoUpdate = false;
  shell.add(facetedCavity);

  // Widened Mechanical Emitter Cradle behind primary plasma (innerR=0.62 -> actual bore 0.600 > body 0.568)
  addStatic(shell, createBeveledTriangleFrame(0.88, 0.62, 0.048, 0.010, 0.010), materials.anodizedBlack, chamberAnodized, 0, 0, -0.595);

  // Outer Plasma Energy Envelope — annular crimson corona behind main body (outer 0.700 <= iris actuator 0.72)
  const outerEnvelopeGeo = bakeRadialPlasmaVertexColors(
    applyCenteredPlasmaUvs(createBeveledTriangleFrame(0.684, 0.52, 0.044, 0.008, 0.008), 0.70),
    0.50, 0.70, [0.88, 0.24, 0.18], [0.22, 0.04, 0.05]
  );
  const outerEnvelopeMesh = new THREE.Mesh(outerEnvelopeGeo, materials.plasmaVortexMat);
  outerEnvelopeMesh.name = "arc-plasma-outer-envelope";
  outerEnvelopeMesh.position.z = -0.525;
  outerEnvelopeMesh.renderOrder = 1;
  group.add(outerEnvelopeMesh);

  // Three Symmetrical Mounting Jaws at 90°, 210°, 330° (r=[0.583..0.860], strictly clear of 0.568 main body)
  const emitterArmGeo = createBeveledTrapezoid(0.19, 0.13, 0.24, 0.064, 0.010, 0.010);
  const coreMountJawGeo = createBeveledTrapezoid(0.14, 0.10, 0.14, 0.056, 0.008, 0.008);
  const coreContactStudGeo = createBeveledTrapezoid(0.054, 0.042, 0.058, 0.044, 0.006, 0.006);
  for (let i = 0; i < 3; i++) {
    const jawA = angles[i] + Math.PI / 3;
    addStatic(shell, emitterArmGeo, materials.anodizedBlack, chamberAnodized, Math.cos(jawA) * 0.73, Math.sin(jawA) * 0.73, -0.455, jawA + Math.PI / 2);
    addStatic(shell, coreMountJawGeo, materials.ringFrameMat, chamberRingFrame, Math.cos(jawA) * 0.67, Math.sin(jawA) * 0.67, -0.445, jawA + Math.PI / 2);
    addStatic(shell, coreContactStudGeo, materials.copperWinding, chamberCopper, Math.cos(jawA) * 0.618, Math.sin(jawA) * 0.618, -0.435, jawA + Math.PI / 2);
  }

  // Main Plasma Body (r=0.54 -> 69.2% radius / 47.9% area of 0.78 aperture) & White-Hot Singularity Heart (r=0.145)
  const triangularCoreMesh = new THREE.Mesh(
    applyCenteredPlasmaUvs(createBeveledTriangleSolid(0.54, 0.124, 0.014, 0.014), 0.568),
    materials.singularityCoreEmissiveMat
  );
  triangularCoreMesh.name = "arc-triangular-core-mesh";
  triangularCoreMesh.position.z = -0.410;
  triangularCoreMesh.renderOrder = 2;
  group.add(triangularCoreMesh);

  const whiteHotCoreMesh = new THREE.Mesh(
    applyCenteredPlasmaUvs(createBeveledTriangleSolid(0.145, 0.048, 0.010, 0.010), 0.165),
    materials.singularityPointMat
  );
  whiteHotCoreMesh.name = "arc-plasma-white-core";
  whiteHotCoreMesh.position.z = -0.285;
  whiteHotCoreMesh.renderOrder = 3;
  group.add(whiteHotCoreMesh);

  // Front Electromagnetic Containment Field, Inner Wireframe & Single Core Spill Light
  const containmentFieldMesh = new THREE.Mesh(
    bakeRadialPlasmaVertexColors(
      applyCenteredPlasmaUvs(createBeveledTriangleFrame(0.64, 0.45, 0.032, 0.008, 0.008), 0.656),
      0.434, 0.656, [0.95, 0.48, 0.28], [0.32, 0.08, 0.10]
    ),
    materials.plasmaVortexMat
  );
  containmentFieldMesh.name = "arc-plasma-containment-field";
  containmentFieldMesh.position.z = -0.190;
  containmentFieldMesh.renderOrder = 4;
  group.add(containmentFieldMesh);

  const innerTriWireMesh = new THREE.Mesh(createBeveledTriangleFrame(0.58, 0.48, 0.028, 0.006, 0.006), materials.singularityInnerWireMat);
  innerTriWireMesh.name = "arc-inner-wire-triangle";
  innerTriWireMesh.position.z = -0.125;
  innerTriWireMesh.renderOrder = 5;
  group.add(innerTriWireMesh);

  const coreSpillLight = new THREE.PointLight(materials.currentColor.getHex(), 0.0, 3.8, 1.8);
  coreSpillLight.name = "arc-core-spill-light";
  coreSpillLight.castShadow = false;
  coreSpillLight.position.set(0, 0, -0.18);
  group.add(coreSpillLight);

  // LAYER 6: Recessed Armored Optical Protective Glass Viewport + 3 Retaining Clips
  const glassWindow = new THREE.Mesh(createBeveledTriangleSolid(1.66, 0.04, 0.018, 0.018), materials.opticGlass);
  glassWindow.name = "arc-chamber-optic-glass";
  glassWindow.position.z = 0.34;
  glassWindow.renderOrder = 6;
  glassWindow.updateMatrix();
  glassWindow.matrixAutoUpdate = false;
  group.add(glassWindow);

  const clipGeo = createBeveledTrapezoid(0.24, 0.17, 0.28, 0.08, 0.014, 0.014);
  for (let i = 0; i < 3; i++) {
    const a = angles[i];
    addStatic(clamps, clipGeo, materials.ringFrameMat, chamberRingFrame, Math.cos(a) * 1.54, Math.sin(a) * 1.54, 0.38, a + Math.PI / 2);
  }

  // LAYER 7: Integrated Central Chamber A.R.C. Logo Assembly
  const lettersGroup = new THREE.Group();
  lettersGroup.name = "arc-central-letters-logo";
  lettersGroup.position.set(0, 0.0, 0.38);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 2.14), materials.arcCenterLogoMat);
  hudMesh.name = "arc-central-hud-mesh";
  hudMesh.renderOrder = 7;
  lettersGroup.add(hudMesh);
  group.add(lettersGroup);

  // 3 PIER-SUPPORTED ARMORED RADIAL POWER BRIDGES + 3 PRIMARY RADIAL MODULE ENERGY FEEDERS
  const conduitsGroup = new THREE.Group();
  conduitsGroup.name = "arc-corner-conduits-group";
  const runnersGroup = new THREE.Group();
  runnersGroup.name = "arc-conduit-runners-group";
  const runners: THREE.Mesh[] = [];

  const termHexGeo = createBeveledHexagon(0.24, 0.28, 0.028, 0.028);
  const termBaseGeo = createBeveledHexagon(0.34, 0.58, 0.036, 0.036);
  const saddleGeo = new THREE.CylinderGeometry(0.105, 0.115, 0.10, 10);
  const pierGeo = createBeveledTrapezoid(0.22, 0.16, 0.28, 0.88, 0.02, 0.02);
  const pierCollarGeo = createBeveledTrapezoid(0.30, 0.24, 0.34, 0.14, 0.016, 0.016);
  const feederHousingGeo = createBeveledTrapezoid(0.36, 0.28, 1.18, 0.22, 0.02, 0.02);
  const feederFlangeGeo = createBeveledTrapezoid(0.42, 0.34, 0.22, 0.26, 0.016, 0.016);
  const feederCoreGeo = new THREE.BoxGeometry(0.085, 1.08, 0.055);
  ensureUv2(saddleGeo);

  for (let i = 0; i < 3; i++) {
    const pStart = innerVertices[i].clone();
    const pEnd = outerVertices[i].clone();
    const pMid = pStart.clone().lerp(pEnd, 0.5);
    pMid.z = 0.40;
    const curve = new THREE.QuadraticBezierCurve3(pStart, pMid, pEnd);

    addStatic(conduitsGroup, new THREE.TubeGeometry(curve, 20, 0.064, 8, false), materials.anodizedBlack, chamberAnodized, 0, 0, 0);
    addStatic(conduitsGroup, new THREE.TubeGeometry(curve, 20, 0.017, 8, false), materials.neonTubeMat, chamberNeon, 0, 0, 0);

    const midPt = curve.getPoint(0.5);
    addStatic(conduitsGroup, pierGeo, materials.anodizedBlack, chamberAnodized, midPt.x, midPt.y, -0.14, angles[i] + Math.PI / 2);
    addStatic(conduitsGroup, pierCollarGeo, materials.ringFrameMat, chamberRingFrame, midPt.x, midPt.y, 0.24, angles[i] + Math.PI / 2);

    const tangent = curve.getTangent(0.5);
    const bandMesh = new THREE.Mesh(saddleGeo, materials.brushedTitanium);
    bandMesh.position.copy(midPt);
    bandMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    conduitsGroup.add(bandMesh);
    chamberTitanium.push(bandMesh);

    addStatic(conduitsGroup, termBaseGeo, materials.anodizedBlack, chamberAnodized, pEnd.x, pEnd.y, pEnd.z - 0.34);
    addStatic(conduitsGroup, termHexGeo, materials.ringFrameMat, chamberRingFrame, pEnd.x, pEnd.y, pEnd.z);

    const runnerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.064, 12, 12), materials.neonTubeMat);
    runnerMesh.name = `arc-conduit-runner-${i}`;
    runnerMesh.position.copy(pStart);
    runnersGroup.add(runnerMesh);
    runners.push(runnerMesh);

    // Primary Radial Energy Distribution Channel linking central chamber to primary module (r=2.12)
    const feedA = angles[i] + Math.PI / 3;
    const rFeed = 1.72;
    addStatic(conduitsGroup, feederHousingGeo, materials.anodizedBlack, chamberAnodized, Math.cos(feedA) * rFeed, Math.sin(feedA) * rFeed, -0.04, feedA - Math.PI / 2);
    addStatic(conduitsGroup, feederFlangeGeo, materials.ringFrameMat, chamberRingFrame, Math.cos(feedA) * 2.12, Math.sin(feedA) * 2.12, 0.04, feedA - Math.PI / 2);
    addStatic(conduitsGroup, feederCoreGeo, materials.neonTubeMat, chamberNeon, Math.cos(feedA) * rFeed, Math.sin(feedA) * rFeed, 0.08, feedA - Math.PI / 2);
  }

  group.add(conduitsGroup);
  group.add(runnersGroup);

  group.updateMatrixWorld(true);
  mergeGeometryBatch(chamberAnodized, materials.anodizedBlack, group, "arc-merged-chamber-anodizedBlack");
  mergeGeometryBatch(chamberTitanium, materials.brushedTitanium, group, "arc-merged-chamber-brushedTitanium");
  mergeGeometryBatch(chamberRingFrame, materials.ringFrameMat, group, "arc-merged-chamber-ringFrameMat");
  mergeGeometryBatch(chamberCarbon, materials.darkCarbon, innerChassisGroup, "arc-merged-chamber-darkCarbon");
  mergeGeometryBatch(chamberCeramic, materials.darkCeramic, innerChassisGroup, "arc-merged-chamber-darkCeramic");
  mergeGeometryBatch(chamberCopper, materials.copperWinding, group, "arc-merged-chamber-copperWinding");
  mergeGeometryBatch(chamberNeon, materials.neonTubeMat, conduitsGroup, "arc-merged-chamber-neonTubeMat");

  return {
    group, shell, clamps, triangularCoreMesh, innerTriWireMesh,
    apertureInnerRim, portsGroup, conduitsGroup, runnersGroup,
    runners, portDiodeMeshes, coreVertexLights,
  };
}
