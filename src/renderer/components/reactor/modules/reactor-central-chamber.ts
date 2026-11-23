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
 * Builds the Deep 7-Layer Central Mechanical Energy Chamber (Stage I.1):
 * Physical Z-stratification spans z = -1.06 .. +0.58 (1.64 units of real depth):
 * 1. Deep beveled outer chamber barrel (z = -0.82..+0.14) + stanchion-elevated titanium crown bezel (z = +0.34)
 * 2. Edge audio plasma trenches, U-clamps & pier-supported radial power bridges (exact Bezier paths)
 * 3. Deep stepped matte ceramic isolation well (z = -0.94..+0.12) + 3 radial iris guide rails + copper focus coil
 * 4. True 3D 6-blade mechanical aperture iris (`arc-aperture-inner-rim`, z = +0.02)
 * 5. Deeply recessed volumetric emitter core & faceted containment cage (z = -0.68..-0.30)
 * 6. Recessed beveled smoked optical glass viewport with 3 retaining clips (z = +0.34, separated by ~0.82 units from emitter!)
 * 7. Crisp floating A.R.C. central mark (`arc-central-letters-logo`, z = +0.52)
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
  // LAYER 1: Deep Extruded Outer Chamber Barrel & Elevated Titanium Armor Crown
  // =========================================================================
  const innerChassisGroup = new THREE.Group();
  innerChassisGroup.name = "arc-inner-triangle-chassis";

  // Deep machined outer barrel (0.86 depth — thick architectural walls visible from 3/4 view!)
  const mainBarrelMesh = new THREE.Mesh(
    createBeveledTriangleFrame(2.62, 1.56, 0.86, 0.065, 0.065),
    materials.anodizedBlack
  );
  mainBarrelMesh.position.z = -0.34;
  innerChassisGroup.add(mainBarrelMesh);
  chamberAnodized.push(mainBarrelMesh);

  // Elevated precision brushed titanium upper crown bezel (separated by cooling stanchions)
  const crownBezelMesh = new THREE.Mesh(
    createBeveledTriangleFrame(2.44, 1.78, 0.14, 0.035, 0.035),
    materials.brushedTitanium
  );
  crownBezelMesh.position.z = 0.32;
  innerChassisGroup.add(crownBezelMesh);
  chamberTitanium.push(crownBezelMesh);

  // =========================================================================
  // LAYER 2: 3 Edge Waveguide Channels, Riser Stanchions & Clamping Yokes
  // =========================================================================
  const trenchL = SIDE_LEN - 0.56;
  const floorGeo = createBeveledTrapezoid(trenchL, trenchL - 0.14, 0.42, 0.14, 0.018, 0.018);
  const yokeGeo = createBeveledTrapezoid(0.28, 0.20, 0.62, 0.24, 0.03, 0.03);
  const stanchionGeo = createBeveledTrapezoid(0.22, 0.18, 0.34, 0.36, 0.02, 0.02);
  const strapGeo = createBeveledTrapezoid(0.09, 0.09, 0.48, 0.06, 0.012, 0.012);

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

    // 2 Heavy Clamping Yokes + Riser Stanchions + Copper Bus Straps per edge
    for (let r = -1; r <= 1; r += 2) {
      const xPos = r * (trenchL * 0.27);
      const stanchion = new THREE.Mesh(stanchionGeo, materials.darkCeramic);
      stanchion.position.set(xPos, APOTHEM_INNER + 0.14, 0.18);
      edgeGroup.add(stanchion);
      chamberCeramic.push(stanchion);

      const yoke = new THREE.Mesh(yokeGeo, materials.brushedTitanium);
      yoke.position.set(xPos, APOTHEM_INNER, 0.38);
      edgeGroup.add(yoke);
      chamberTitanium.push(yoke);

      const strap = new THREE.Mesh(strapGeo, materials.copperWinding);
      strap.position.set(xPos, APOTHEM_INNER, 0.51);
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

    const capMesh = new THREE.Mesh(hexCapGeo, materials.brushedTitanium);
    capMesh.position.z = 0.25;
    cornerGroup.add(capMesh);
    chamberTitanium.push(capMesh);

    const copperRing = new THREE.Mesh(hexCopperRingGeo, materials.copperWinding);
    copperRing.position.z = 0.34;
    cornerGroup.add(copperRing);
    chamberCopper.push(copperRing);

    const diodeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 16), materials.coreDiodeMat);
    diodeMesh.position.z = 0.35;
    diodeMesh.name = `arc-inner-port-diode-${i}`;
    cornerGroup.add(diodeMesh);
    portDiodeMeshes.push(diodeMesh);

    const vertexLight = new THREE.PointLight(materials.currentColor.getHex(), 0.35, 4.5, 2.0);
    vertexLight.position.set(v.x, v.y, v.z + 0.36);
    vertexLight.name = `arc-vertex-light-${i}`;
    group.add(vertexLight);
    coreVertexLights.push(vertexLight);

    innerChassisGroup.add(cornerGroup);
  });

  group.add(innerChassisGroup);

  // LAYER 3: Deep Stepped Matte Ceramic Isolation Well, Focus Coils & Iris Guide Rails
  const addStatic = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    bucket: THREE.Mesh[],
    x: number,
    y: number,
    z: number,
    rotZ = 0
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rotZ) m.rotation.z = rotZ;
    parent.add(m);
    bucket.push(m);
    return m;
  };

  addStatic(shell, createBeveledTriangleFrame(1.68, 1.24, 0.44, 0.04, 0.04), materials.darkCeramic, chamberCeramic, 0, 0, -0.14);
  addStatic(shell, createBeveledTriangleFrame(1.36, 0.96, 0.56, 0.035, 0.035), materials.darkCeramic, chamberCeramic, 0, 0, -0.62);
  addStatic(shell, createBeveledTriangleSolid(1.12, 0.14, 0.025, 0.025), materials.darkCeramic, chamberCeramic, 0, 0, -0.96);
  addStatic(shell, createBeveledTriangleFrame(0.96, 0.76, 0.18, 0.024, 0.024), materials.copperWinding, chamberCopper, 0, 0, -0.78);

  const guideRailGeo = createBeveledTrapezoid(0.14, 0.10, 0.62, 0.16, 0.015, 0.015);
  for (let i = 0; i < 3; i++) {
    const a = angles[i] + Math.PI / 3;
    addStatic(shell, guideRailGeo, materials.brushedTitanium, chamberTitanium, Math.cos(a) * 0.96, Math.sin(a) * 0.96, -0.06, a + Math.PI / 2);
  }

  // LAYER 4: True 3D 6-Blade Mechanical Aperture Iris (`arc-aperture-inner-rim`)
  const apertureInnerRim = new THREE.Mesh(
    createBeveledTriangleFrame(1.06, 0.78, 0.14, 0.03, 0.03),
    materials.brushedTitanium
  );
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

  const irisCopperActuator = new THREE.Mesh(createBeveledTriangleFrame(0.84, 0.72, 0.09, 0.016, 0.016), materials.copperWinding);
  irisCopperActuator.position.z = -0.06;
  apertureInnerRim.add(irisCopperActuator);
  group.add(apertureInnerRim);

  // LAYER 5: Deeply Recessed 3D Volumetric Emitter Core & Containment Cage
  const facetedCavityGeo = new THREE.OctahedronGeometry(0.46, 1);
  facetedCavityGeo.scale(1.0, 1.0, 0.72);
  ensureUv2(facetedCavityGeo);
  const facetedCavity = new THREE.Mesh(facetedCavityGeo, materials.singularityFacetedMat);
  facetedCavity.name = "arc-core-faceted-cavity";
  facetedCavity.position.z = -0.58;
  facetedCavity.updateMatrix();
  facetedCavity.matrixAutoUpdate = false;
  shell.add(facetedCavity);

  const triangularCoreMesh = new THREE.Mesh(createBeveledTriangleSolid(0.54, 0.24, 0.035, 0.035), materials.singularityCoreEmissiveMat);
  triangularCoreMesh.name = "arc-triangular-core-mesh";
  triangularCoreMesh.position.z = -0.46;
  group.add(triangularCoreMesh);

  const innerTriWireMesh = new THREE.Mesh(createBeveledTriangleFrame(0.68, 0.52, 0.14, 0.016, 0.016), materials.singularityInnerWireMat);
  innerTriWireMesh.name = "arc-inner-wire-triangle";
  innerTriWireMesh.position.z = -0.28;
  group.add(innerTriWireMesh);

  // LAYER 6: Recessed Armored Optical Protective Glass Viewport + 3 Retaining Clips
  const glassWindow = new THREE.Mesh(createBeveledTriangleSolid(1.66, 0.04, 0.018, 0.018), materials.opticGlass);
  glassWindow.name = "arc-chamber-optic-glass";
  glassWindow.position.z = 0.34;
  glassWindow.renderOrder = 4;
  glassWindow.updateMatrix();
  glassWindow.matrixAutoUpdate = false;
  group.add(glassWindow);

  const clipGeo = createBeveledTrapezoid(0.28, 0.20, 0.34, 0.10, 0.018, 0.018);
  for (let i = 0; i < 3; i++) {
    const a = angles[i];
    addStatic(clamps, clipGeo, materials.brushedTitanium, chamberTitanium, Math.cos(a) * 1.54, Math.sin(a) * 1.54, 0.40, a + Math.PI / 2);
  }

  // LAYER 7: Crisp Floating A.R.C. Central Mark
  const lettersGroup = new THREE.Group();
  lettersGroup.name = "arc-central-letters-logo";
  lettersGroup.position.set(0, 0.0, 0.52);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.12, 2.12), materials.arcCenterLogoMat);
  hudMesh.name = "arc-central-hud-mesh";
  hudMesh.renderOrder = 6;
  lettersGroup.add(hudMesh);
  group.add(lettersGroup);

  // 3 PIER-SUPPORTED ARMORED RADIAL POWER BRIDGES (Exact state-driver Bezier paths)
  const conduitsGroup = new THREE.Group();
  conduitsGroup.name = "arc-corner-conduits-group";
  const runnersGroup = new THREE.Group();
  runnersGroup.name = "arc-conduit-runners-group";
  const runners: THREE.Mesh[] = [];

  const termHexGeo = createBeveledHexagon(0.26, 0.30, 0.032, 0.032);
  const termBaseGeo = createBeveledHexagon(0.38, 0.64, 0.04, 0.04);
  const bandGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.07, 12);
  const saddleGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.11, 10);
  const pierGeo = createBeveledTrapezoid(0.22, 0.16, 0.28, 0.92, 0.02, 0.02);
  ensureUv2(bandGeo);
  ensureUv2(saddleGeo);

  for (let i = 0; i < 3; i++) {
    const pStart = innerVertices[i].clone();
    const pEnd = outerVertices[i].clone();
    const pMid = pStart.clone().lerp(pEnd, 0.5);
    pMid.z = 0.40;
    const curve = new THREE.QuadraticBezierCurve3(pStart, pMid, pEnd);

    addStatic(conduitsGroup, new THREE.TubeGeometry(curve, 20, 0.068, 8, false), materials.anodizedBlack, chamberAnodized, 0, 0, 0);
    addStatic(conduitsGroup, new THREE.TubeGeometry(curve, 20, 0.028, 8, false), materials.neonTubeMat, chamberNeon, 0, 0, 0);

    const midPt = curve.getPoint(0.5);
    addStatic(conduitsGroup, pierGeo, materials.anodizedBlack, chamberAnodized, midPt.x, midPt.y, -0.14, angles[i] + Math.PI / 2);

    [0.24, 0.5, 0.76].forEach((u, idx) => {
      const pt = curve.getPoint(u);
      const tangent = curve.getTangent(u);
      const bandMesh = new THREE.Mesh(
        idx === 1 ? saddleGeo : bandGeo,
        idx === 1 ? materials.darkCeramic : materials.brushedTitanium
      );
      bandMesh.position.copy(pt);
      bandMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      conduitsGroup.add(bandMesh);
      if (idx === 1) chamberCeramic.push(bandMesh);
      else chamberTitanium.push(bandMesh);
    });

    addStatic(conduitsGroup, termBaseGeo, materials.anodizedBlack, chamberAnodized, pEnd.x, pEnd.y, pEnd.z - 0.34);
    addStatic(conduitsGroup, termHexGeo, materials.brushedTitanium, chamberTitanium, pEnd.x, pEnd.y, pEnd.z);

    const runnerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), materials.neonTubeMat);
    runnerMesh.name = `arc-conduit-runner-${i}`;
    runnerMesh.position.copy(pStart);
    runnersGroup.add(runnerMesh);
    runners.push(runnerMesh);
  }

  group.add(conduitsGroup);
  group.add(runnersGroup);

  group.updateMatrixWorld(true);
  mergeGeometryBatch(chamberAnodized, materials.anodizedBlack, group, "arc-merged-chamber-anodizedBlack");
  mergeGeometryBatch(chamberTitanium, materials.brushedTitanium, group, "arc-merged-chamber-brushedTitanium");
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
