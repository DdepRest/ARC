import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import type { ReactorMaterials } from "./reactor-materials";

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

export function buildCentralChamber(
  materials: ReactorMaterials,
  graphicsQuality: string
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

  // Coordinates matching the reactor architecture:
  // Equilateral triangle pointing DOWNWARDS:
  // Vertices: Bottom (270°), Top-Right (30°), Top-Left (150°)
  const R_INNER = 2.25; // Vertex distance for small triangle
  const APOTHEM_INNER = R_INNER / 2.0; // 1.125 distance from center to side
  const SIDE_LEN = R_INNER * Math.sqrt(3); // ~3.897

  const R_OUTER = 4.85; // Vertex distance for outer triangle

  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

  const innerVertices = angles.map((a) => {
    return new THREE.Vector3(
      Math.cos(a) * R_INNER,
      Math.sin(a) * R_INNER,
      0.22
    );
  });

  const outerVertices = angles.map((a) => {
    return new THREE.Vector3(
      Math.cos(a) * R_OUTER,
      Math.sin(a) * R_OUTER,
      0.35
    );
  });

  const chamberDarkCarbon: THREE.Mesh[] = [];
  const chamberAnodizedBlack: THREE.Mesh[] = [];
  const chamberBrushedTitanium: THREE.Mesh[] = [];
  const chamberNeonTube: THREE.Mesh[] = [];

  // =========================================================================
  // 1. SMALL TRIANGLE CHASSIS / HOUSING (Hollow center, styled like big triangle)
  // =========================================================================
  const innerChassisGroup = new THREE.Group();
  innerChassisGroup.name = "arc-inner-triangle-chassis";

  let primaryCoreMesh: THREE.Mesh | null = null;
  const edgeTubes: THREE.Mesh[] = [];

  // Build 3 trench edges rotated at 0°, 120°, 240°
  // For edge 0 (rotation 0): side is at y = +APOTHEM_INNER (horizontal top side)
  for (let i = 0; i < 3; i++) {
    const edgeGroup = new THREE.Group();
    edgeGroup.name = `arc-inner-trench-edge-${i}`;
    edgeGroup.rotation.z = ((Math.PI * 2) / 3) * i;

    const trenchL = SIDE_LEN - 0.45; // Leave room for corner caps

    // Channel Floor (Dark Carbon)
    const floorGeo = new THREE.BoxGeometry(trenchL, 0.46, 0.08);
    const floorMesh = new THREE.Mesh(floorGeo, materials.darkCarbon);
    floorMesh.position.set(0, APOTHEM_INNER, 0.05);
    edgeGroup.add(floorMesh);
    chamberDarkCarbon.push(floorMesh);

    // Inner Wall (Anodized Black)
    const innerWallGeo = new THREE.BoxGeometry(trenchL - 0.2, 0.12, 0.22);
    const innerWallMesh = new THREE.Mesh(innerWallGeo, materials.anodizedBlack);
    innerWallMesh.position.set(0, APOTHEM_INNER - 0.2, 0.16);
    edgeGroup.add(innerWallMesh);
    chamberAnodizedBlack.push(innerWallMesh);

    // Outer Wall (Anodized Black)
    const outerWallGeo = new THREE.BoxGeometry(trenchL + 0.2, 0.12, 0.22);
    const outerWallMesh = new THREE.Mesh(outerWallGeo, materials.anodizedBlack);
    outerWallMesh.position.set(0, APOTHEM_INNER + 0.2, 0.16);
    edgeGroup.add(outerWallMesh);
    chamberAnodizedBlack.push(outerWallMesh);

    // Glowing Core Plasma Tube (Individual material clone per edge for 3-band frequency modulation)
    const tubeGeo = new THREE.CylinderGeometry(0.065, 0.065, trenchL - 0.2, 32);
    const edgeTubeMat = materials.neonTubeMat.clone();
    const tubeMesh = new THREE.Mesh(tubeGeo, edgeTubeMat);
    tubeMesh.rotation.z = Math.PI / 2;
    tubeMesh.position.set(0, APOTHEM_INNER, 0.18);
    tubeMesh.name = `arc-inner-plasma-tube-${i}`;
    edgeGroup.add(tubeMesh);
    edgeTubes.push(tubeMesh);

    if (i === 0) {
      primaryCoreMesh = tubeMesh;
    }

    // Titanium Support Rib Brackets (2 per side)
    for (let r = -1; r <= 1; r += 2) {
      const ribGeo = new THREE.BoxGeometry(0.14, 0.52, 0.1);
      const ribMesh = new THREE.Mesh(ribGeo, materials.brushedTitanium);
      ribMesh.position.set(r * (trenchL * 0.28), APOTHEM_INNER, 0.24);
      edgeGroup.add(ribMesh);
      chamberBrushedTitanium.push(ribMesh);
    }

    innerChassisGroup.add(edgeGroup);
  }

  // Corner Coupler Housings & High-Intensity Power Diodes at the 3 Vertices
  const portDiodeMeshes: THREE.Mesh[] = [];
  const coreVertexLights: THREE.PointLight[] = [];

  innerVertices.forEach((v, i) => {
    const cornerGroup = new THREE.Group();
    cornerGroup.name = `arc-inner-corner-node-${i}`;
    cornerGroup.position.copy(v);

    // Dark base housing block
    const blockGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.22, 6);
    const blockMesh = new THREE.Mesh(blockGeo, materials.anodizedBlack);
    blockMesh.rotation.x = Math.PI / 2;
    cornerGroup.add(blockMesh);
    chamberAnodizedBlack.push(blockMesh);

    // Titanium faceted cap
    const capGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.14, 6);
    const capMesh = new THREE.Mesh(capGeo, materials.brushedTitanium);
    capMesh.rotation.x = Math.PI / 2;
    capMesh.position.z = 0.08;
    cornerGroup.add(capMesh);
    chamberBrushedTitanium.push(capMesh);

    // Glowing High-Output Emitter Diode Crystal
    const diodeGeo = new THREE.SphereGeometry(0.09, 16, 16);
    const diodeMesh = new THREE.Mesh(diodeGeo, materials.coreDiodeMat);
    diodeMesh.position.z = 0.14;
    diodeMesh.name = `arc-inner-port-diode-${i}`;
    cornerGroup.add(diodeMesh);
    portDiodeMeshes.push(diodeMesh);

    // Realistic Local Point Light casting dynamic illumination on adjacent walls
    const vertexLight = new THREE.PointLight(
      materials.currentColor.getHex(),
      0.35,
      4.5,
      2.0
    );
    vertexLight.position.set(v.x, v.y, v.z + 0.25);
    vertexLight.name = `arc-vertex-light-${i}`;
    group.add(vertexLight);
    coreVertexLights.push(vertexLight);

    innerChassisGroup.add(cornerGroup);
  });

  group.add(innerChassisGroup);

  // =========================================================================
  // 1.5. A R C CENTRAL GLOWING TRIANGULAR LOGO (A, R at top, C at bottom)
  // =========================================================================
  const lettersGroup = new THREE.Group();
  lettersGroup.name = "arc-central-letters-logo";
  lettersGroup.position.set(0, 0.0, 0.24);

  // Floating Holographic Plane with Pure Glowing White A, R, C in a Triangle
  const hudGeo = new THREE.PlaneGeometry(2.3, 2.3);
  const hudMesh = new THREE.Mesh(hudGeo, materials.arcCenterLogoMat);
  hudMesh.name = "arc-central-hud-mesh";
  lettersGroup.add(hudMesh);

  group.add(lettersGroup);

  // =========================================================================
  // 2. THREE CORNER POWER CONDUITS (Outward Energy Feed to Outer Triangle)
  // =========================================================================
  const conduitsGroup = new THREE.Group();
  conduitsGroup.name = "arc-corner-conduits-group";
  const runnersGroup = new THREE.Group();
  runnersGroup.name = "arc-conduit-runners-group";
  const runners: THREE.Mesh[] = [];

  for (let i = 0; i < 3; i++) {
    const pStart = innerVertices[i].clone();
    const pEnd = outerVertices[i].clone();
    const pMid = pStart.clone().lerp(pEnd, 0.5).add(new THREE.Vector3(0, 0, 0.12));

    const curve = new THREE.QuadraticBezierCurve3(pStart, pMid, pEnd);

    // Heavy dark guide rail
    const railGeo = new THREE.TubeGeometry(curve, 24, 0.055, 8, false);
    const railMesh = new THREE.Mesh(railGeo, materials.anodizedBlack);
    conduitsGroup.add(railMesh);
    chamberAnodizedBlack.push(railMesh);

    // Titanium conduit clamp bands
    const bandPositions = [0.25, 0.5, 0.75];
    bandPositions.forEach((u) => {
      const pt = curve.getPoint(u);
      const tangent = curve.getTangent(u);
      const bandMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16),
        materials.brushedTitanium
      );
      bandMesh.position.copy(pt);
      bandMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      conduitsGroup.add(bandMesh);
      chamberBrushedTitanium.push(bandMesh);
    });

    // Glowing High-Voltage Energy Channel Core
    const energyTubeGeo = new THREE.TubeGeometry(curve, 24, 0.028, 8, false);
    const energyTubeMesh = new THREE.Mesh(energyTubeGeo, materials.neonTubeMat);
    conduitsGroup.add(energyTubeMesh);
    chamberNeonTube.push(energyTubeMesh);

    // Outer receiver terminal block at big triangle vertex
    const termGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.22, 16);
    const termMesh = new THREE.Mesh(termGeo, materials.brushedTitanium);
    termMesh.rotation.x = Math.PI / 2;
    termMesh.position.copy(pEnd);
    conduitsGroup.add(termMesh);
    chamberBrushedTitanium.push(termMesh);

    // Energy pulse runner mesh
    const runnerGeo = new THREE.SphereGeometry(0.085, 16, 16);
    const runnerMesh = new THREE.Mesh(runnerGeo, materials.neonTubeMat);
    runnerMesh.name = `arc-conduit-runner-${i}`;
    runnerMesh.position.copy(pStart);
    runnersGroup.add(runnerMesh);
    runners.push(runnerMesh);
  }

  group.add(conduitsGroup);
  group.add(runnersGroup);

  // Merge 39 static meshes into 4 draw calls by material
  group.updateMatrixWorld(true);

  const mergeChamberSection = (
    meshes: THREE.Mesh[],
    material: THREE.Material,
    targetParent: THREE.Object3D,
    mergedName: string
  ) => {
    if (meshes.length === 0) return;
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
    const disposed = new Set<THREE.BufferGeometry>();
    for (const mesh of meshes) {
      mesh.parent?.remove(mesh);
      if (mesh.geometry && !disposed.has(mesh.geometry)) {
        disposed.add(mesh.geometry);
        mesh.geometry.dispose();
      }
    }
    if (mergedGeo) {
      const mergedMesh = new THREE.Mesh(mergedGeo, material);
      mergedMesh.name = mergedName;
      mergedMesh.updateMatrix();
      mergedMesh.matrixAutoUpdate = false;
      targetParent.add(mergedMesh);
    }
  };

  mergeChamberSection(
    chamberDarkCarbon,
    materials.darkCarbon,
    innerChassisGroup,
    "arc-merged-chamber-darkCarbon"
  );
  mergeChamberSection(
    chamberAnodizedBlack,
    materials.anodizedBlack,
    group,
    "arc-merged-chamber-anodizedBlack"
  );
  mergeChamberSection(
    chamberBrushedTitanium,
    materials.brushedTitanium,
    group,
    "arc-merged-chamber-brushedTitanium"
  );
  mergeChamberSection(
    chamberNeonTube,
    materials.neonTubeMat,
    conduitsGroup,
    "arc-merged-chamber-neonTubeMat"
  );

  const apertureInnerRim = new THREE.Mesh();
  apertureInnerRim.visible = false;

  const triangularCoreMesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    materials.singularityCoreEmissiveMat
  );
  triangularCoreMesh.name = "arc-triangular-core-mesh";
  triangularCoreMesh.visible = false;
  group.add(triangularCoreMesh);

  return {
    group,
    shell,
    clamps,
    triangularCoreMesh,
    apertureInnerRim,
    portsGroup,
    conduitsGroup,
    runnersGroup,
    runners,
    portDiodeMeshes,
    coreVertexLights,
  };
}

