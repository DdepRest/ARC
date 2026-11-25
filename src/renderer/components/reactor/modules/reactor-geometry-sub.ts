import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import {
  ensureUv2,
  createBeveledTrapezoid,
  createBeveledHexagon,
  mergeGeometryBatch,
} from "./reactor-geometry-primitives";

export function buildTrenches(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials,
  lighting: ReactorLighting,
  apothem: number
): void {
  const trenchLength = 6.50;

  // Sleek beveled obsidian waveguide walls locking flush into the 3 corner clamps
  const innerWallGeo = createBeveledTrapezoid(trenchLength - 0.96, trenchLength - 1.36, 0.30, 0.42, 0.036, 0.036);
  const outerWallGeo = createBeveledTrapezoid(trenchLength - 0.36, trenchLength - 0.80, 0.30, 0.42, 0.036, 0.036);
  const innerRailGeo = createBeveledTrapezoid(trenchLength - 1.30, trenchLength - 1.56, 0.06, 0.045, 0.012, 0.012);
  const outerRailGeo = createBeveledTrapezoid(trenchLength - 0.72, trenchLength - 1.02, 0.06, 0.045, 0.012, 0.012);
  const floorGeo = createBeveledTrapezoid(trenchLength - 0.50, trenchLength - 0.82, 0.72, 0.18, 0.018, 0.018);
  const ceramicBedGeo = createBeveledTrapezoid(trenchLength - 1.16, trenchLength - 1.28, 0.13, 0.12, 0.014, 0.014);
  const tubeGeo = new THREE.CylinderGeometry(0.054, 0.054, trenchLength - 1.85, 18);
  ensureUv2(tubeGeo);
  const collarGeo = new THREE.CylinderGeometry(0.108, 0.112, 0.12, 16);
  ensureUv2(collarGeo);
  const collarSlotGeo = new THREE.TorusGeometry(0.112, 0.014, 10, 18);
  ensureUv2(collarSlotGeo);
  const capGeo = createBeveledHexagon(0.12, 0.20, 0.018, 0.018);
  const gantrySpanGeo = createBeveledTrapezoid(0.24, 0.18, 1.04, 0.13, 0.018, 0.018);
  const gantryLegGeo = createBeveledTrapezoid(0.18, 0.14, 0.16, 0.36, 0.014, 0.014);
  const gantryCapGeo = createBeveledTrapezoid(0.10, 0.075, 0.88, 0.055, 0.01, 0.01);

  const collarInst = new THREE.InstancedMesh(collarGeo, materials.ringFrameMat, 24);
  const collarSlotInst = new THREE.InstancedMesh(collarSlotGeo, materials.copperWinding, 24);
  collarInst.name = "arc-instanced-collars";
  collarSlotInst.name = "arc-instanced-collar-slots";
  let collarIdx = 0;

  const dummyEdge = new THREE.Object3D();
  const dummyPart = new THREE.Object3D();
  dummyEdge.add(dummyPart);

  const trenchAnodizedBlack: THREE.Mesh[] = [];
  const trenchDarkCarbon: THREE.Mesh[] = [];
  const trenchDarkCeramic: THREE.Mesh[] = [];
  const trenchNeonTube: THREE.Mesh[] = [];
  const trenchBrushedTitanium: THREE.Mesh[] = [];
  const trenchRingFrame: THREE.Mesh[] = [];

  for (let i = 0; i < 3; i++) {
    const edgeAngle = ((Math.PI * 2) / 3) * i;
    const edgeGroup = new THREE.Group();
    edgeGroup.name = `arc-trench-${i}`;
    edgeGroup.rotation.z = edgeAngle;

    dummyEdge.position.set(0, 0, 0);
    dummyEdge.rotation.set(0, 0, edgeAngle);

    // Refined beveled waveguide containment cheek walls
    const innerWall = new THREE.Mesh(innerWallGeo, materials.anodizedBlack);
    innerWall.position.set(0, apothem - 0.38, 0.04);
    edgeGroup.add(innerWall);
    trenchAnodizedBlack.push(innerWall);

    const outerWall = new THREE.Mesh(outerWallGeo, materials.anodizedBlack);
    outerWall.position.set(0, apothem + 0.38, 0.04);
    edgeGroup.add(outerWall);
    trenchAnodizedBlack.push(outerWall);

    // Fine brushed-titanium pinstripe edge highlights crowning the dark walls
    const innerRail = new THREE.Mesh(innerRailGeo, materials.brushedTitanium);
    innerRail.position.set(0, apothem - 0.38, 0.28);
    edgeGroup.add(innerRail);
    trenchBrushedTitanium.push(innerRail);

    const outerRail = new THREE.Mesh(outerRailGeo, materials.brushedTitanium);
    outerRail.position.set(0, apothem + 0.38, 0.28);
    edgeGroup.add(outerRail);
    trenchBrushedTitanium.push(outerRail);

    // Recessed obsidian carbon channel floor + matte ceramic HV divider
    const floor = new THREE.Mesh(floorGeo, materials.darkCarbon);
    floor.position.set(0, apothem, -0.16);
    edgeGroup.add(floor);
    trenchDarkCarbon.push(floor);

    const ceramicDivider = new THREE.Mesh(ceramicBedGeo, materials.darkCeramic);
    ceramicDivider.position.set(0, apothem, -0.02);
    edgeGroup.add(ceramicDivider);
    trenchDarkCeramic.push(ceramicDivider);

    // Dual Plasma Waveguides with 4 Balanced Collars per Tube
    for (let t = -1; t <= 1; t += 2) {
      const tube = new THREE.Mesh(tubeGeo, materials.neonTubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0, apothem + t * 0.18, 0.14);
      edgeGroup.add(tube);
      trenchNeonTube.push(tube);

      for (let c = 0; c < 4; c++) {
        const xPos = -1.65 + c * 1.10;
        dummyPart.position.set(xPos, apothem + t * 0.18, 0.14);
        dummyPart.rotation.set(0, 0, Math.PI / 2);
        dummyEdge.updateMatrixWorld(true);
        collarInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);

        dummyPart.rotation.set(0, Math.PI / 2, 0);
        dummyEdge.updateMatrixWorld(true);
        collarSlotInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);
        collarIdx++;
      }

      const cap1 = new THREE.Mesh(capGeo, materials.ringFrameMat);
      cap1.rotation.y = Math.PI / 2;
      cap1.position.set((trenchLength - 1.85) / 2, apothem + t * 0.18, 0.14);
      edgeGroup.add(cap1);
      trenchRingFrame.push(cap1);

      const cap2 = new THREE.Mesh(capGeo, materials.ringFrameMat);
      cap2.rotation.y = Math.PI / 2;
      cap2.position.set(-(trenchLength - 1.85) / 2, apothem + t * 0.18, 0.14);
      edgeGroup.add(cap2);
      trenchRingFrame.push(cap2);
    }

    const softGlowLight = new THREE.PointLight(materials.currentColor.getHex(), 0.18, 2.8, 2.1);
    softGlowLight.position.set(0, apothem, 0.30);
    edgeGroup.add(softGlowLight);
    lighting.trenchLights.push(softGlowLight);

    // Compact Symmetric Twin Overhead Gantry Bridges seated cleanly on the waveguide cheek walls
    for (let x = -1; x <= 1; x += 2) {
      const span = new THREE.Mesh(gantrySpanGeo, materials.anodizedBlack);
      span.position.set(x * 1.65, apothem, 0.34);
      edgeGroup.add(span);
      trenchAnodizedBlack.push(span);

      const trim = new THREE.Mesh(gantryCapGeo, materials.brushedTitanium);
      trim.position.set(x * 1.65, apothem, 0.42);
      edgeGroup.add(trim);
      trenchBrushedTitanium.push(trim);

      for (let side = -1; side <= 1; side += 2) {
        const leg = new THREE.Mesh(gantryLegGeo, materials.anodizedBlack);
        leg.position.set(x * 1.65, apothem + side * 0.44, 0.16);
        edgeGroup.add(leg);
        trenchAnodizedBlack.push(leg);
      }
    }

    reactorGroup.add(edgeGroup);
  }

  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(trenchAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-trenches-anodizedBlack");
  mergeGeometryBatch(trenchDarkCarbon, materials.darkCarbon, reactorGroup, "arc-merged-trenches-darkCarbon");
  mergeGeometryBatch(trenchDarkCeramic, materials.darkCeramic, reactorGroup, "arc-merged-trenches-darkCeramic");
  mergeGeometryBatch(trenchNeonTube, materials.neonTubeMat, reactorGroup, "arc-merged-trenches-neonTubeMat");
  mergeGeometryBatch(trenchBrushedTitanium, materials.brushedTitanium, reactorGroup, "arc-merged-trenches-brushedTitanium");
  mergeGeometryBatch(trenchRingFrame, materials.ringFrameMat, reactorGroup, "arc-merged-trenches-ringFrameMat");

  for (const inst of [collarInst, collarSlotInst]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.updateMatrix();
    inst.matrixAutoUpdate = false;
    reactorGroup.add(inst);
  }
}

export function buildCornerClamps(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials,
  _apothem: number
): void {
  // Positioned strictly at the 3 true triangle vertices (-90°, 30°, 150°) at r = 4.46
  // Physically interlocks the upper horizontal module (90°) and the two lower diagonal modules (210°, 330°)
  const clampDist = 4.46;

  const baseBlockGeo = createBeveledTrapezoid(1.06, 0.84, 0.66, 0.40, 0.036, 0.036);
  const yokeGeo = createBeveledTrapezoid(0.98, 0.82, 0.12, 0.42, 0.022, 0.022);
  const ceramicCradleGeo = createBeveledTrapezoid(0.76, 0.64, 0.48, 0.075, 0.016, 0.016);
  const carbonCapGeo = createBeveledTrapezoid(0.62, 0.52, 0.36, 0.065, 0.014, 0.014);
  const copperPinGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.14, 12);
  copperPinGeo.rotateX(Math.PI / 2);
  ensureUv2(copperPinGeo);
  const slitGeo = new THREE.BoxGeometry(0.28, 0.020, 0.024);
  const pistonGeo = new THREE.CylinderGeometry(0.040, 0.044, 0.68, 12);
  ensureUv2(pistonGeo);

  const pistonInst = new THREE.InstancedMesh(pistonGeo, materials.ringFrameMat, 6);
  pistonInst.name = "arc-instanced-pistons";
  let pistonIdx = 0;

  const dummyClamp = new THREE.Object3D();
  const dummyPiston = new THREE.Object3D();
  dummyClamp.add(dummyPiston);

  const clampAnodizedBlack: THREE.Mesh[] = [];
  const clampBrushedTitanium: THREE.Mesh[] = [];
  const clampDarkCarbon: THREE.Mesh[] = [];
  const clampDarkCeramic: THREE.Mesh[] = [];
  const clampCopper: THREE.Mesh[] = [];
  const clampNeonTube: THREE.Mesh[] = [];

  for (let i = 0; i < 3; i++) {
    const vAngle = -Math.PI / 2 + ((Math.PI * 2) / 3) * i;
    const clampGroup = new THREE.Group();
    clampGroup.name = `arc-corner-clamp-${i}`;
    clampGroup.position.set(Math.cos(vAngle) * clampDist, Math.sin(vAngle) * clampDist, 0.02);
    clampGroup.rotation.z = vAngle + Math.PI / 2;

    dummyClamp.position.copy(clampGroup.position);
    dummyClamp.rotation.set(0, 0, clampGroup.rotation.z);

    // 1. Sleek Beveled Obsidian Vertex Bridge Block
    const blockMesh = new THREE.Mesh(baseBlockGeo, materials.anodizedBlack);
    blockMesh.position.z = 0.0;
    clampGroup.add(blockMesh);
    clampAnodizedBlack.push(blockMesh);

    // 2. Twin Slim Wrap-Around Dark-Titanium Caliper Yokes locking adjacent trenches
    for (let side = -1; side <= 1; side += 2) {
      const yokeMesh = new THREE.Mesh(yokeGeo, materials.brushedTitanium);
      yokeMesh.position.set(0, side * 0.34, 0.03);
      clampGroup.add(yokeMesh);
      clampBrushedTitanium.push(yokeMesh);
    }

    // 3. Elevated Matte Dark Ceramic HV Isolator Deck + Obsidian Carbon Cap
    const ceramicPad = new THREE.Mesh(ceramicCradleGeo, materials.darkCeramic);
    ceramicPad.position.z = 0.24;
    clampGroup.add(ceramicPad);
    clampDarkCeramic.push(ceramicPad);

    const capMesh = new THREE.Mesh(carbonCapGeo, materials.darkCarbon);
    capMesh.position.z = 0.31;
    clampGroup.add(capMesh);
    clampDarkCarbon.push(capMesh);

    // 4. Symmetric Burnished Copper Grounding Studs
    for (let side = -1; side <= 1; side += 2) {
      const pin = new THREE.Mesh(copperPinGeo, materials.copperWinding);
      pin.position.set(side * 0.32, 0, 0.27);
      clampGroup.add(pin);
      clampCopper.push(pin);
    }

    // 5. Single Centered Recessed Reactor-Red Indicator Slit
    const slitMesh = new THREE.Mesh(slitGeo, materials.neonTubeMat);
    slitMesh.position.set(0, 0, 0.35);
    clampGroup.add(slitMesh);
    clampNeonTube.push(slitMesh);

    // 6. Symmetric Pair of Instanced Tie-Rods
    for (let p = -1; p <= 1; p += 2) {
      dummyPiston.position.set(p * 0.44, 0, -0.20);
      dummyPiston.rotation.set(Math.PI / 2, 0, 0);
      dummyClamp.updateMatrixWorld(true);
      pistonInst.setMatrixAt(pistonIdx++, dummyPiston.matrixWorld);
    }

    const clampLight = new THREE.PointLight(materials.currentColor.getHex(), 0.24, 3.0, 2.1);
    clampLight.position.set(0, 0, 0.56);
    clampLight.name = `arc-clamp-light-${i}`;
    clampGroup.add(clampLight);

    reactorGroup.add(clampGroup);
  }

  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(clampAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-clamps-anodizedBlack");
  mergeGeometryBatch(clampBrushedTitanium, materials.brushedTitanium, reactorGroup, "arc-merged-clamps-brushedTitanium");
  mergeGeometryBatch(clampDarkCarbon, materials.darkCarbon, reactorGroup, "arc-merged-clamps-darkCarbon");
  mergeGeometryBatch(clampDarkCeramic, materials.darkCeramic, reactorGroup, "arc-merged-clamps-darkCeramic");
  mergeGeometryBatch(clampCopper, materials.copperWinding, reactorGroup, "arc-merged-clamps-copperWinding");
  mergeGeometryBatch(clampNeonTube, materials.neonTubeMat, reactorGroup, "arc-merged-clamps-neonTubeMat");

  pistonInst.instanceMatrix.needsUpdate = true;
  pistonInst.computeBoundingSphere();
  pistonInst.updateMatrix();
  pistonInst.matrixAutoUpdate = false;
  reactorGroup.add(pistonInst);
}

export function buildFiberOpticsAndDataModules(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials
): void {
  const signalSystem = new THREE.Group();
  signalSystem.name = "arc-signal-system";

  const nodeTitaniumMeshes: THREE.Mesh[] = [];
  const nodeAnodizedMeshes: THREE.Mesh[] = [];
  const nodeCeramicMeshes: THREE.Mesh[] = [];

  // Compact obsidian riser & telemetry housing bolted cleanly onto each 60-degree radial spar
  const riserGeo = createBeveledTrapezoid(0.24, 0.20, 0.24, 0.36, 0.016, 0.016);
  const ceramicPadGeo = createBeveledTrapezoid(0.32, 0.26, 0.22, 0.065, 0.012, 0.012);
  const housingGeo = createBeveledTrapezoid(0.30, 0.24, 0.19, 0.11, 0.016, 0.016);

  for (let i = 0; i < 6; i++) {
    const angle = ((Math.PI * 2) / 6) * i + Math.PI / 6;
    const moduleGroup = new THREE.Group();
    moduleGroup.name = `arc-process-node-${i}`;

    const rNode = 3.74;
    moduleGroup.position.set(Math.cos(angle) * rNode, Math.sin(angle) * rNode, -0.18);
    moduleGroup.rotation.z = angle + Math.PI / 2;

    const riser = new THREE.Mesh(riserGeo, materials.anodizedBlack);
    riser.position.z = -0.26;
    moduleGroup.add(riser);
    nodeAnodizedMeshes.push(riser);

    const ceramicPad = new THREE.Mesh(ceramicPadGeo, materials.darkCeramic);
    ceramicPad.position.z = -0.04;
    moduleGroup.add(ceramicPad);
    nodeCeramicMeshes.push(ceramicPad);

    const box = new THREE.Mesh(housingGeo, materials.ringFrameMat);
    box.position.z = 0.06;
    moduleGroup.add(box);
    nodeTitaniumMeshes.push(box);

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.048), materials.neonTubeMat.clone());
    panel.name = `arc-node-screen-${i}`;
    panel.position.set(0, 0.025, 0.13);
    moduleGroup.add(panel);

    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.024), materials.criticalWhite.clone());
    led.name = `arc-node-led-${i}`;
    led.position.set(0, -0.035, 0.13);
    moduleGroup.add(led);

    signalSystem.add(moduleGroup);
  }

  reactorGroup.add(signalSystem);
  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(nodeTitaniumMeshes, materials.ringFrameMat, signalSystem, "arc-merged-processNodes-brushedTitanium");
  mergeGeometryBatch(nodeAnodizedMeshes, materials.anodizedBlack, signalSystem, "arc-merged-processNodes-anodizedBlack");
  mergeGeometryBatch(nodeCeramicMeshes, materials.darkCeramic, signalSystem, "arc-merged-processNodes-darkCeramic");
}
