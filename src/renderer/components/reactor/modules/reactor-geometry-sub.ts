import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import {
  ensureUv2,
  createBeveledTrapezoid,
  mergeGeometryBatch,
} from "./reactor-geometry-primitives";
export { buildTrenches } from "./reactor-geometry-trenches";

export function buildCornerClamps(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials,
  _apothem: number
): void {
  // Positioned strictly at the 3 true triangle vertices (-90°, 30°, 150°) at r = 4.46
  // Precision-machined vertex couplings bridging the upper power bridge, diagonal conduits, and outer substations
  const clampDist = 4.46;

  const baseBlockGeo = createBeveledTrapezoid(1.10, 0.88, 0.70, 0.42, 0.036, 0.036);
  const yokeGeo = createBeveledTrapezoid(1.02, 0.84, 0.12, 0.44, 0.022, 0.022);
  const outerBridgeBracketGeo = createBeveledTrapezoid(0.68, 0.56, 0.38, 0.24, 0.020, 0.020);
  const ceramicCradleGeo = createBeveledTrapezoid(0.76, 0.64, 0.48, 0.075, 0.016, 0.016);
  const carbonCapGeo = createBeveledTrapezoid(0.62, 0.52, 0.36, 0.065, 0.014, 0.014);
  const copperPinGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.14, 12);
  copperPinGeo.rotateX(Math.PI / 2);
  ensureUv2(copperPinGeo);
  const slitGeo = new THREE.BoxGeometry(0.28, 0.020, 0.024);
  const pistonGeo = new THREE.CylinderGeometry(0.040, 0.044, 0.74, 12);
  ensureUv2(pistonGeo);

  const pistonInst = new THREE.InstancedMesh(pistonGeo, materials.ringFrameMat, 6);
  pistonInst.name = "arc-instanced-pistons";
  let pistonIdx = 0;

  const dummyClamp = new THREE.Object3D();
  const dummyPiston = new THREE.Object3D();
  dummyClamp.add(dummyPiston);

  const clampAnodizedBlack: THREE.Mesh[] = [];
  const clampRingFrame: THREE.Mesh[] = [];
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

    // 1. Beveled Obsidian Vertex Bridge Block
    const blockMesh = new THREE.Mesh(baseBlockGeo, materials.anodizedBlack);
    blockMesh.position.z = 0.0;
    clampGroup.add(blockMesh);
    clampAnodizedBlack.push(blockMesh);

    // 2. Recessed Dark Gunmetal Rear Coupling Bracket bridging clamp cleanly into outer substation & carrier rail
    const bridgeBracket = new THREE.Mesh(outerBridgeBracketGeo, materials.ringFrameMat);
    bridgeBracket.position.set(0, -0.34, -0.22);
    clampGroup.add(bridgeBracket);
    clampRingFrame.push(bridgeBracket);

    // 3. Twin Slim Wrap-Around Gunmetal Caliper Yokes locking adjacent bridge/conduit ends
    for (let side = -1; side <= 1; side += 2) {
      const yokeMesh = new THREE.Mesh(yokeGeo, materials.ringFrameMat);
      yokeMesh.position.set(0, side * 0.35, 0.03);
      clampGroup.add(yokeMesh);
      clampRingFrame.push(yokeMesh);
    }

    // 4. Elevated Matte Dark Ceramic HV Isolator Deck + Obsidian Carbon Cap
    const ceramicPad = new THREE.Mesh(ceramicCradleGeo, materials.darkCeramic);
    ceramicPad.position.z = 0.24;
    clampGroup.add(ceramicPad);
    clampDarkCeramic.push(ceramicPad);

    const capMesh = new THREE.Mesh(carbonCapGeo, materials.darkCarbon);
    capMesh.position.z = 0.31;
    clampGroup.add(capMesh);
    clampDarkCarbon.push(capMesh);

    // 5. Symmetric Burnished Copper Grounding Studs
    for (let side = -1; side <= 1; side += 2) {
      const pin = new THREE.Mesh(copperPinGeo, materials.copperWinding);
      pin.position.set(side * 0.32, 0, 0.27);
      clampGroup.add(pin);
      clampCopper.push(pin);
    }

    // 6. Single Centered Recessed Reactor-Red Indicator Slit
    const slitMesh = new THREE.Mesh(slitGeo, materials.neonTubeMat);
    slitMesh.position.set(0, 0, 0.35);
    clampGroup.add(slitMesh);
    clampNeonTube.push(slitMesh);

    // 7. Symmetric Pair of Instanced Structural Tie-Rods linking clamp to outer node cradle
    for (let p = -1; p <= 1; p += 2) {
      dummyPiston.position.set(p * 0.42, -0.14, -0.22);
      dummyPiston.rotation.set(Math.PI / 2, 0, 0);
      dummyClamp.updateMatrixWorld(true);
      pistonInst.setMatrixAt(pistonIdx++, dummyPiston.matrixWorld);
    }

    const clampLight = new THREE.PointLight(materials.currentColor.getHex(), 0.22, 2.8, 2.1);
    clampLight.position.set(0, 0, 0.54);
    clampLight.name = `arc-clamp-light-${i}`;
    clampGroup.add(clampLight);

    reactorGroup.add(clampGroup);
  }

  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(clampAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-clamps-anodizedBlack");
  mergeGeometryBatch(clampRingFrame, materials.ringFrameMat, reactorGroup, "arc-merged-clamps-ringFrameMat");
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
