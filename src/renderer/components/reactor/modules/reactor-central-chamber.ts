import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import {
  ensureUv2,
  createBeveledTriangleFrame,
  createBeveledTriangleSolid,
  createBeveledTrapezoid,
  createBeveledHexagon,
  mergeGeometryBatch,
} from "./reactor-geometry-primitives";

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
 * Builds the 7-Layer Central Mechanical Energy Chamber (A.R.C. Stage I Foundation):
 * 1. Outer beveled triangular anodized chassis + elevated brushed titanium outer bezel + hex vertex housings
 * 2. Edge waveguide trenches (3-band audio tubes), 6 beveled clamping yokes & 3 armored power bridge conduits
 * 3. Recessed matte technical ceramic thermal isolation liner & chamber floor
 * 4. Physical mechanical metallic aperture iris (`arc-aperture-inner-rim`, spring-animated by state-driver)
 * 5. Recessed faceted cavity core (`arc-triangular-core-mesh` + `arc-inner-wire-triangle`)
 * 6. Single clean beveled smoked optical glass protective window (zero stacked glass overdraw)
 * 7. Crisp floating A.R.C. central mark (`arc-central-letters-logo`)
 */
export function buildCentralChamber(
  materials: ReactorMaterials,
  _graphicsQuality: string
): CentralChamberRig {
  const group = new THREE.Group();
  group.name = "arc-central-chamber-root";
  group.position.z = 0.0;

  const shell = new THREE.Group();
  shell.name = "arc-chamber-shell";
  const clamps = new THREE.Group();
  clamps.name = "arc-chamber-clamps";
  const portsGroup = new THREE.Group();
  portsGroup.name = "arc-ports-group";
  group.add(shell);
  group.add(clamps);
  group.add(portsGroup);

  const R_INNER = 2.25;
  const APOTHEM_INNER = R_INNER / 2.0; // 1.125
  const SIDE_LEN = R_INNER * Math.sqrt(3); // ~3.897
  const R_OUTER = 4.85;
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

  const innerVertices = angles.map(
    (a) => new THREE.Vector3(Math.cos(a) * R_INNER, Math.sin(a) * R_INNER, 0.22)
  );
  const outerVertices = angles.map(
    (a) => new THREE.Vector3(Math.cos(a) * R_OUTER, Math.sin(a) * R_OUTER, 0.35)
  );

  const chamberAnodized: THREE.Mesh[] = [];
  const chamberTitanium: THREE.Mesh[] = [];
  const chamberCarbon: THREE.Mesh[] = [];
  const chamberCeramic: THREE.Mesh[] = [];
  const chamberCopper: THREE.Mesh[] = [];
  const chamberNeon: THREE.Mesh[] = [];

  // =========================================================================
  // LAYER 1: Outer Beveled Triangular Housing & Precision Titanium Outer Bezel
  // =========================================================================
  const innerChassisGroup = new THREE.Group();
  innerChassisGroup.name = "arc-inner-triangle-chassis";

  const mainFrameMesh = new THREE.Mesh(
    createBeveledTriangleFrame(2.58, 1.56, 0.24, 0.055, 0.055),
    materials.anodizedBlack
  );
  mainFrameMesh.position.z = 0.02;
  innerChassisGroup.add(mainFrameMesh);
  chamberAnodized.push(mainFrameMesh);

  const outerBezelMesh = new THREE.Mesh(
    createBeveledTriangleFrame(2.48, 2.22, 0.08, 0.025, 0.025),
    materials.brushedTitanium
  );
  outerBezelMesh.position.z = 0.20;
  innerChassisGroup.add(outerBezelMesh);
  chamberTitanium.push(outerBezelMesh);

  // =========================================================================
  // LAYER 2: 3 Edge Waveguide Channels, Audio Plasma Tubes & Clamping Yokes
  // =========================================================================
  const trenchL = SIDE_LEN - 0.56;
  const floorGeo = createBeveledTrapezoid(trenchL, trenchL - 0.14, 0.38, 0.06, 0.015, 0.015);
  const yokeGeo = createBeveledTrapezoid(0.24, 0.18, 0.54, 0.12, 0.025, 0.025);
  const strapGeo = createBeveledTrapezoid(0.08, 0.08, 0.44, 0.05, 0.01, 0.01);

  for (let i = 0; i < 3; i++) {
    const edgeGroup = new THREE.Group();
    edgeGroup.name = `arc-inner-trench-edge-${i}`;
    edgeGroup.rotation.z = ((Math.PI * 2) / 3) * i;

    const floorMesh = new THREE.Mesh(floorGeo, materials.darkCarbon);
    floorMesh.position.set(0, APOTHEM_INNER, 0.12);
    edgeGroup.add(floorMesh);
    chamberCarbon.push(floorMesh);

    // Glowing Core Plasma Tube (individual cloned material for 3-band FFT audio)
    const tubeGeo = new THREE.CylinderGeometry(0.058, 0.058, trenchL - 0.26, 20);
    ensureUv2(tubeGeo);
    const tubeMesh = new THREE.Mesh(tubeGeo, materials.neonTubeMat.clone());
    tubeMesh.rotation.z = Math.PI / 2;
    tubeMesh.position.set(0, APOTHEM_INNER, 0.20);
    tubeMesh.name = `arc-inner-plasma-tube-${i}`;
    edgeGroup.add(tubeMesh);

    // 2 Sculpted Clamping Yokes + Copper Contact Straps per edge
    for (let r = -1; r <= 1; r += 2) {
      const yoke = new THREE.Mesh(yokeGeo, materials.brushedTitanium);
      yoke.position.set(r * (trenchL * 0.27), APOTHEM_INNER, 0.26);
      edgeGroup.add(yoke);
      chamberTitanium.push(yoke);

      const strap = new THREE.Mesh(strapGeo, materials.copperWinding);
      strap.position.set(r * (trenchL * 0.27), APOTHEM_INNER, 0.33);
      edgeGroup.add(strap);
      chamberCopper.push(strap);
    }

    innerChassisGroup.add(edgeGroup);
  }

  // Sculpted Hexagonal Vertex Coupler Housings & Emitter Diodes at -90°, 30°, 150°
  const portDiodeMeshes: THREE.Mesh[] = [];
  const coreVertexLights: THREE.PointLight[] = [];
  const hexBaseGeo = createBeveledHexagon(0.32, 0.22, 0.035, 0.035);
  const hexCeramicGeo = createBeveledHexagon(0.25, 0.12, 0.02, 0.02);
  const hexCapGeo = createBeveledHexagon(0.20, 0.10, 0.022, 0.022);
  const hexCopperRingGeo = new THREE.TorusGeometry(0.135, 0.018, 10, 18);
  ensureUv2(hexCopperRingGeo);

  innerVertices.forEach((v, i) => {
    const cornerGroup = new THREE.Group();
    cornerGroup.name = `arc-inner-corner-node-${i}`;
    cornerGroup.position.copy(v);

    const baseMesh = new THREE.Mesh(hexBaseGeo, materials.anodizedBlack);
    baseMesh.position.z = -0.04;
    cornerGroup.add(baseMesh);
    chamberAnodized.push(baseMesh);

    const ceramicCollar = new THREE.Mesh(hexCeramicGeo, materials.darkCeramic);
    ceramicCollar.position.z = 0.06;
    cornerGroup.add(ceramicCollar);
    chamberCeramic.push(ceramicCollar);

    const capMesh = new THREE.Mesh(hexCapGeo, materials.brushedTitanium);
    capMesh.position.z = 0.11;
    cornerGroup.add(capMesh);
    chamberTitanium.push(capMesh);

    const copperRing = new THREE.Mesh(hexCopperRingGeo, materials.copperWinding);
    copperRing.position.z = 0.16;
    cornerGroup.add(copperRing);
    chamberCopper.push(copperRing);

    const diodeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 16), materials.coreDiodeMat);
    diodeMesh.position.z = 0.17;
    diodeMesh.name = `arc-inner-port-diode-${i}`;
    cornerGroup.add(diodeMesh);
    portDiodeMeshes.push(diodeMesh);

    const vertexLight = new THREE.PointLight(materials.currentColor.getHex(), 0.35, 4.5, 2.0);
    vertexLight.position.set(v.x, v.y, v.z + 0.25);
    vertexLight.name = `arc-vertex-light-${i}`;
    group.add(vertexLight);
    coreVertexLights.push(vertexLight);

    innerChassisGroup.add(cornerGroup);
  });

  group.add(innerChassisGroup);

  // =========================================================================
  // LAYER 3: Recessed Matte Ceramic Isolation Liner & Chamber Floor
  // =========================================================================
  const ceramicLiner = new THREE.Mesh(
    createBeveledTriangleFrame(1.66, 1.18, 0.22, 0.04, 0.04),
    materials.darkCeramic
  );
  ceramicLiner.position.z = 0.0;
  shell.add(ceramicLiner);
  chamberCeramic.push(ceramicLiner);

  const cavityFloor = new THREE.Mesh(
    createBeveledTriangleSolid(1.26, 0.08, 0.02, 0.02),
    materials.darkCeramic
  );
  cavityFloor.position.z = -0.22;
  shell.add(cavityFloor);
  chamberCeramic.push(cavityFloor);

  // Subtle metallic copper induction stator ring recessed on chamber floor
  const floorBusbar = new THREE.Mesh(
    createBeveledTriangleFrame(0.94, 0.78, 0.05, 0.015, 0.015),
    materials.copperWinding
  );
  floorBusbar.position.z = -0.15;
  shell.add(floorBusbar);
  chamberCopper.push(floorBusbar);

  // =========================================================================
  // LAYER 4: Physical Mechanical Aperture Iris (`arc-aperture-inner-rim`)
  // =========================================================================
  const irisGeo = createBeveledTriangleFrame(1.08, 0.80, 0.09, 0.028, 0.028);
  const apertureInnerRim = new THREE.Mesh(irisGeo, materials.brushedTitanium);
  apertureInnerRim.name = "arc-aperture-inner-rim";
  apertureInnerRim.position.z = 0.07;

  const irisCopperInner = new THREE.Mesh(
    createBeveledTriangleFrame(0.83, 0.72, 0.06, 0.014, 0.014),
    materials.copperWinding
  );
  irisCopperInner.position.z = -0.01;
  apertureInnerRim.add(irisCopperInner);
  group.add(apertureInnerRim);

  // =========================================================================
  // LAYER 5: Recessed Faceted Core Cavity & Emissive Emitter
  // =========================================================================
  const facetedCavityGeo = new THREE.OctahedronGeometry(0.42, 1);
  facetedCavityGeo.scale(1.0, 1.0, 0.36);
  ensureUv2(facetedCavityGeo);
  const facetedCavity = new THREE.Mesh(facetedCavityGeo, materials.singularityFacetedMat);
  facetedCavity.name = "arc-core-faceted-cavity";
  facetedCavity.position.z = -0.13;
  facetedCavity.updateMatrix();
  facetedCavity.matrixAutoUpdate = false;
  shell.add(facetedCavity);

  const triangularCoreMesh = new THREE.Mesh(
    createBeveledTriangleSolid(0.58, 0.055, 0.018, 0.018),
    materials.singularityCoreEmissiveMat
  );
  triangularCoreMesh.name = "arc-triangular-core-mesh";
  triangularCoreMesh.position.z = -0.08;
  group.add(triangularCoreMesh);

  const wireGeo = createBeveledTriangleFrame(0.68, 0.56, 0.03, 0.008, 0.008);
  const innerTriWireMesh = new THREE.Mesh(wireGeo, materials.singularityInnerWireMat);
  innerTriWireMesh.name = "arc-inner-wire-triangle";
  innerTriWireMesh.position.z = -0.02;
  group.add(innerTriWireMesh);

  // =========================================================================
  // LAYER 6: Single Clean Beveled Smoked Optical Glass Window
  // =========================================================================
  const glassWindow = new THREE.Mesh(
    createBeveledTriangleSolid(1.50, 0.028, 0.016, 0.016),
    materials.opticGlass
  );
  glassWindow.name = "arc-chamber-optic-glass";
  glassWindow.position.z = 0.19;
  glassWindow.renderOrder = 4;
  glassWindow.updateMatrix();
  glassWindow.matrixAutoUpdate = false;
  group.add(glassWindow);

  // =========================================================================
  // LAYER 7: Crisp Floating A.R.C. Central Mark
  // =========================================================================
  const lettersGroup = new THREE.Group();
  lettersGroup.name = "arc-central-letters-logo";
  lettersGroup.position.set(0, 0.0, 0.27);

  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 2.14), materials.arcCenterLogoMat);
  hudMesh.name = "arc-central-hud-mesh";
  hudMesh.renderOrder = 6;
  lettersGroup.add(hudMesh);
  group.add(lettersGroup);

  // =========================================================================
  // 3 ARMORED RADIAL POWER BRIDGE CONDUITS (Exact state-driver Bezier paths)
  // =========================================================================
  const conduitsGroup = new THREE.Group();
  conduitsGroup.name = "arc-corner-conduits-group";
  const runnersGroup = new THREE.Group();
  runnersGroup.name = "arc-conduit-runners-group";
  const runners: THREE.Mesh[] = [];

  const termHexGeo = createBeveledHexagon(0.24, 0.22, 0.03, 0.03);
  const termBaseGeo = createBeveledHexagon(0.32, 0.16, 0.03, 0.03);
  const bandGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.06, 12);
  const saddleGeo = new THREE.CylinderGeometry(0.102, 0.108, 0.09, 10);
  ensureUv2(bandGeo);
  ensureUv2(saddleGeo);

  for (let i = 0; i < 3; i++) {
    const pStart = innerVertices[i].clone();
    const pEnd = outerVertices[i].clone();
    // Matches reactor-state-driver.ts exact midPoints z = 0.40
    const pMid = pStart.clone().lerp(pEnd, 0.5);
    pMid.z = 0.40;

    const curve = new THREE.QuadraticBezierCurve3(pStart, pMid, pEnd);

    const railMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 20, 0.062, 8, false),
      materials.anodizedBlack
    );
    conduitsGroup.add(railMesh);
    chamberAnodized.push(railMesh);

    const energyTubeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 20, 0.028, 8, false),
      materials.neonTubeMat
    );
    conduitsGroup.add(energyTubeMesh);
    chamberNeon.push(energyTubeMesh);

    [0.24, 0.5, 0.76].forEach((u, idx) => {
      const pt = curve.getPoint(u);
      const tangent = curve.getTangent(u);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);

      const bandMesh = new THREE.Mesh(
        idx === 1 ? saddleGeo : bandGeo,
        idx === 1 ? materials.darkCeramic : materials.brushedTitanium
      );
      bandMesh.position.copy(pt);
      bandMesh.quaternion.copy(q);
      conduitsGroup.add(bandMesh);
      if (idx === 1) chamberCeramic.push(bandMesh);
      else chamberTitanium.push(bandMesh);
    });

    // Beveled hexagonal outer receiver terminal anchored at R=4.85
    const termBase = new THREE.Mesh(termBaseGeo, materials.anodizedBlack);
    termBase.position.set(pEnd.x, pEnd.y, pEnd.z - 0.10);
    conduitsGroup.add(termBase);
    chamberAnodized.push(termBase);

    const termCrown = new THREE.Mesh(termHexGeo, materials.brushedTitanium);
    termCrown.position.copy(pEnd);
    conduitsGroup.add(termCrown);
    chamberTitanium.push(termCrown);

    const runnerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), materials.neonTubeMat);
    runnerMesh.name = `arc-conduit-runner-${i}`;
    runnerMesh.position.copy(pStart);
    runnersGroup.add(runnerMesh);
    runners.push(runnerMesh);
  }

  group.add(conduitsGroup);
  group.add(runnersGroup);

  // Merge static chamber meshes by material
  group.updateMatrixWorld(true);
  mergeGeometryBatch(chamberAnodized, materials.anodizedBlack, group, "arc-merged-chamber-anodizedBlack");
  mergeGeometryBatch(chamberTitanium, materials.brushedTitanium, group, "arc-merged-chamber-brushedTitanium");
  mergeGeometryBatch(chamberCarbon, materials.darkCarbon, innerChassisGroup, "arc-merged-chamber-darkCarbon");
  mergeGeometryBatch(chamberCeramic, materials.darkCeramic, innerChassisGroup, "arc-merged-chamber-darkCeramic");
  mergeGeometryBatch(chamberCopper, materials.copperWinding, group, "arc-merged-chamber-copperWinding");
  mergeGeometryBatch(chamberNeon, materials.neonTubeMat, conduitsGroup, "arc-merged-chamber-neonTubeMat");

  return {
    group,
    shell,
    clamps,
    triangularCoreMesh,
    innerTriWireMesh,
    apertureInnerRim,
    portsGroup,
    conduitsGroup,
    runnersGroup,
    runners,
    portDiodeMeshes,
    coreVertexLights,
  };
}
