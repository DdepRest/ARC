import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import { createHUDLabel } from "./reactor-particles";
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
  const trenchLength = 6.9;

  // Deep industrial waveguide truss walls (real 3D thickness exposed from 3/4 camera)
  const innerWallGeo = createBeveledTrapezoid(trenchLength - 0.95, trenchLength - 1.45, 0.54, 0.72, 0.065, 0.065);
  const outerWallGeo = createBeveledTrapezoid(trenchLength + 0.65, trenchLength + 0.25, 0.54, 0.72, 0.065, 0.065);
  const innerRailGeo = createBeveledTrapezoid(trenchLength - 1.35, trenchLength - 1.65, 0.14, 0.10, 0.025, 0.025);
  const outerRailGeo = createBeveledTrapezoid(trenchLength + 0.25, trenchLength - 0.05, 0.14, 0.10, 0.025, 0.025);
  const floorGeo = createBeveledTrapezoid(trenchLength - 0.2, trenchLength + 0.1, 0.96, 0.24, 0.025, 0.025);
  const ceramicBedGeo = createBeveledTrapezoid(trenchLength - 1.15, trenchLength - 1.25, 0.18, 0.16, 0.02, 0.02);
  const tubeGeo = new THREE.CylinderGeometry(0.088, 0.088, trenchLength - 1.85, 20);
  ensureUv2(tubeGeo);
  const collarGeo = new THREE.CylinderGeometry(0.145, 0.15, 0.17, 16);
  ensureUv2(collarGeo);
  const collarSlotGeo = new THREE.TorusGeometry(0.15, 0.018, 10, 20);
  ensureUv2(collarSlotGeo);
  const capGeo = createBeveledHexagon(0.16, 0.28, 0.024, 0.024);
  const gantrySpanGeo = createBeveledTrapezoid(0.38, 0.28, 1.44, 0.24, 0.038, 0.038);
  const gantryLegGeo = createBeveledTrapezoid(0.34, 0.28, 0.24, 0.56, 0.025, 0.025);
  const gantryCapGeo = createBeveledTrapezoid(0.18, 0.12, 1.26, 0.12, 0.02, 0.02);

  const collarInst = new THREE.InstancedMesh(collarGeo, materials.brushedTitanium, 36);
  const collarSlotInst = new THREE.InstancedMesh(collarSlotGeo, materials.copperWinding, 36);
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

    // Deep beveled waveguide containment cheek walls
    const innerWall = new THREE.Mesh(innerWallGeo, materials.anodizedBlack);
    innerWall.position.set(0, apothem - 0.50, 0.06);
    edgeGroup.add(innerWall);
    trenchAnodizedBlack.push(innerWall);

    const outerWall = new THREE.Mesh(outerWallGeo, materials.anodizedBlack);
    outerWall.position.set(0, apothem + 0.50, 0.06);
    edgeGroup.add(outerWall);
    trenchAnodizedBlack.push(outerWall);

    // Brushed titanium beveled crest rails crowning the deep walls
    const innerRail = new THREE.Mesh(innerRailGeo, materials.brushedTitanium);
    innerRail.position.set(0, apothem - 0.50, 0.48);
    edgeGroup.add(innerRail);
    trenchBrushedTitanium.push(innerRail);

    const outerRail = new THREE.Mesh(outerRailGeo, materials.brushedTitanium);
    outerRail.position.set(0, apothem + 0.50, 0.48);
    edgeGroup.add(outerRail);
    trenchBrushedTitanium.push(outerRail);

    // Deep recessed carbon composite channel floor + ceramic HV divider
    const floor = new THREE.Mesh(floorGeo, materials.darkCarbon);
    floor.position.set(0, apothem, -0.22);
    edgeGroup.add(floor);
    trenchDarkCarbon.push(floor);

    const ceramicDivider = new THREE.Mesh(ceramicBedGeo, materials.darkCeramic);
    ceramicDivider.position.set(0, apothem, -0.02);
    edgeGroup.add(ceramicDivider);
    trenchDarkCeramic.push(ceramicDivider);

    // Dual Plasma Waveguides with Instanced Titanium Collars & Copper Induction Rings
    for (let t = -1; t <= 1; t += 2) {
      const tube = new THREE.Mesh(tubeGeo, materials.neonTubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0, apothem + t * 0.22, 0.16);
      edgeGroup.add(tube);
      trenchNeonTube.push(tube);

      for (let c = 0; c < 6; c++) {
        const xPos = -2.0 + c * 0.8;
        dummyPart.position.set(xPos, apothem + t * 0.22, 0.16);
        dummyPart.rotation.set(0, 0, Math.PI / 2);
        dummyEdge.updateMatrixWorld(true);
        collarInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);

        dummyPart.rotation.set(0, Math.PI / 2, 0);
        dummyEdge.updateMatrixWorld(true);
        collarSlotInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);
        collarIdx++;
      }

      const cap1 = new THREE.Mesh(capGeo, materials.brushedTitanium);
      cap1.rotation.y = Math.PI / 2;
      cap1.position.set((trenchLength - 1.85) / 2, apothem + t * 0.22, 0.16);
      edgeGroup.add(cap1);
      trenchBrushedTitanium.push(cap1);

      const cap2 = new THREE.Mesh(capGeo, materials.brushedTitanium);
      cap2.rotation.y = Math.PI / 2;
      cap2.position.set(-(trenchLength - 1.85) / 2, apothem + t * 0.22, 0.16);
      edgeGroup.add(cap2);
      trenchBrushedTitanium.push(cap2);
    }

    const softGlowLight = new THREE.PointLight(materials.currentColor.getHex(), 0.32, 3.5, 2.0);
    softGlowLight.position.set(0, apothem, 0.36);
    edgeGroup.add(softGlowLight);
    lighting.trenchLights.push(softGlowLight);

    // Heavy Elevated Overhead Gantry Bridges with side stanchions locking into walls
    for (let x = -1; x <= 1; x += 2) {
      const span = new THREE.Mesh(gantrySpanGeo, materials.anodizedBlack);
      span.position.set(x * 1.8, apothem, 0.56);
      edgeGroup.add(span);
      trenchAnodizedBlack.push(span);

      const trim = new THREE.Mesh(gantryCapGeo, materials.ringFrameMat);
      trim.position.set(x * 1.8, apothem, 0.70);
      edgeGroup.add(trim);
      trenchRingFrame.push(trim);

      for (let side = -1; side <= 1; side += 2) {
        const leg = new THREE.Mesh(gantryLegGeo, materials.anodizedBlack);
        leg.position.set(x * 1.8, apothem + side * 0.62, 0.24);
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
  apothem: number
): void {
  const clampDist = apothem / Math.cos(Math.PI / 3);

  // Massive multi-tier beveled containment pylons bolted straight through the 3 nacelles
  const baseBlockGeo = createBeveledTrapezoid(1.82, 1.38, 2.02, 0.72, 0.085, 0.085);
  const yokeGeo = createBeveledTrapezoid(1.74, 1.54, 0.26, 0.82, 0.048, 0.048);
  const ceramicCradleGeo = createBeveledTrapezoid(1.38, 1.14, 1.56, 0.14, 0.032, 0.032);
  const carbonCapGeo = createBeveledTrapezoid(1.14, 0.94, 1.24, 0.12, 0.028, 0.028);
  const copperPinGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.22, 12);
  copperPinGeo.rotateX(Math.PI / 2);
  ensureUv2(copperPinGeo);
  const slitGeo = new THREE.BoxGeometry(0.84, 0.038, 0.05);
  const indicatorGeo = new THREE.BoxGeometry(0.28, 0.055, 0.04);
  const pistonGeo = new THREE.CylinderGeometry(0.068, 0.078, 1.32, 12);
  ensureUv2(pistonGeo);

  const pistonInst = new THREE.InstancedMesh(pistonGeo, materials.brushedTitanium, 12);
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
    const vAngle = Math.PI / 2 + ((Math.PI * 2) / 3) * i;
    const clampGroup = new THREE.Group();
    clampGroup.name = `arc-corner-clamp-${i}`;
    clampGroup.position.set(Math.cos(vAngle) * clampDist, Math.sin(vAngle) * clampDist, 0.08);
    clampGroup.rotation.z = vAngle + Math.PI / 2;

    dummyClamp.position.copy(clampGroup.position);
    dummyClamp.rotation.set(0, 0, clampGroup.rotation.z);

    // 1. Deep Beveled Anodized Titanium Main Pylon Block anchored into nacelle
    const blockMesh = new THREE.Mesh(baseBlockGeo, materials.anodizedBlack);
    blockMesh.position.z = 0.02;
    clampGroup.add(blockMesh);
    clampAnodizedBlack.push(blockMesh);

    // 2. Twin Deep Wrap-Around Brushed Titanium Caliper Yokes
    for (let side = -1; side <= 1; side += 2) {
      const yokeMesh = new THREE.Mesh(yokeGeo, materials.brushedTitanium);
      yokeMesh.position.set(0, side * 0.86, 0.08);
      clampGroup.add(yokeMesh);
      clampBrushedTitanium.push(yokeMesh);
    }

    // 3. Elevated Matte Dark Ceramic HV Isolator Deck + Carbon Armored Cap
    const ceramicPad = new THREE.Mesh(ceramicCradleGeo, materials.darkCeramic);
    ceramicPad.position.z = 0.44;
    clampGroup.add(ceramicPad);
    clampDarkCeramic.push(ceramicPad);

    const capMesh = new THREE.Mesh(carbonCapGeo, materials.darkCarbon);
    capMesh.position.z = 0.56;
    clampGroup.add(capMesh);
    clampDarkCarbon.push(capMesh);

    // 4. Copper Alloy Thermal Grounding Studs
    for (let side = -1; side <= 1; side += 2) {
      for (let row = -1; row <= 1; row += 2) {
        const pin = new THREE.Mesh(copperPinGeo, materials.copperWinding);
        pin.position.set(side * 0.56, row * 0.44, 0.48);
        clampGroup.add(pin);
        clampCopper.push(pin);
      }
    }

    // 5. Recessed Guarded Plasma Indicator Slits
    for (let g = -1; g <= 1; g++) {
      const slitMesh = new THREE.Mesh(slitGeo, materials.neonTubeMat);
      slitMesh.position.set(0, g * 0.28, 0.64);
      clampGroup.add(slitMesh);
      clampNeonTube.push(slitMesh);
    }

    const indicator = new THREE.Mesh(indicatorGeo, materials.neonTubeMat);
    indicator.position.set(0, -0.56, 0.62);
    clampGroup.add(indicator);
    clampNeonTube.push(indicator);

    // 6. Technical Serial HUD Badge
    const serial = createHUDLabel(`LOCK-${10 + i} // SECURE`, new THREE.Vector3(0, -1.28, 0.66));
    if (serial) {
      serial.scale.set(1.4, 0.35, 1);
      clampGroup.add(serial);
    }

    // 7. Instanced Long Hydraulic Tie-Rods locking pylon deep through the nacelle hull
    for (let p = -1; p <= 1; p += 2) {
      for (let p2 = -1; p2 <= 1; p2 += 2) {
        dummyPiston.position.set(p * 0.74, p2 * 0.96, -0.32);
        dummyPiston.rotation.set(Math.PI / 2, 0, 0);
        dummyClamp.updateMatrixWorld(true);
        pistonInst.setMatrixAt(pistonIdx++, dummyPiston.matrixWorld);
      }
    }

    const clampLight = new THREE.PointLight(materials.currentColor.getHex(), 0.48, 4.0, 2.0);
    clampLight.position.set(0, 0, 0.80);
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

  // Deep structural riser pedestal bolting each process node straight onto the radial I-beam spar
  const riserGeo = createBeveledTrapezoid(0.46, 0.36, 0.44, 0.56, 0.025, 0.025);
  const ceramicPadGeo = createBeveledTrapezoid(0.54, 0.48, 0.38, 0.10, 0.018, 0.018);
  const housingGeo = createBeveledTrapezoid(0.50, 0.44, 0.32, 0.18, 0.028, 0.028);

  for (let i = 0; i < 6; i++) {
    const angle = ((Math.PI * 2) / 6) * i + Math.PI / 6;
    const moduleGroup = new THREE.Group();
    moduleGroup.name = `arc-process-node-${i}`;

    const rNode = 3.82;
    moduleGroup.position.set(Math.cos(angle) * rNode, Math.sin(angle) * rNode, -0.02);
    moduleGroup.rotation.z = angle + Math.PI / 2;

    // Structural riser stanchion anchored solidly into the radial I-beam spar at z = -0.58
    const riser = new THREE.Mesh(riserGeo, materials.anodizedBlack);
    riser.position.z = -0.34;
    moduleGroup.add(riser);
    nodeAnodizedMeshes.push(riser);

    const ceramicPad = new THREE.Mesh(ceramicPadGeo, materials.darkCeramic);
    ceramicPad.position.z = -0.02;
    moduleGroup.add(ceramicPad);
    nodeCeramicMeshes.push(ceramicPad);

    const box = new THREE.Mesh(housingGeo, materials.brushedTitanium);
    box.position.z = 0.12;
    moduleGroup.add(box);
    nodeTitaniumMeshes.push(box);

    // Armored feeder conduit physically routing outward (-Y) into nacelle / substation bulkhead
    const conduitCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.18, 0.06),
      new THREE.Vector3(0, -0.62, -0.14),
      new THREE.Vector3(0, -1.16, -0.36),
    ]);
    const conduitMesh = new THREE.Mesh(
      new THREE.TubeGeometry(conduitCurve, 12, 0.048, 8, false),
      materials.anodizedBlack
    );
    moduleGroup.add(conduitMesh);
    nodeAnodizedMeshes.push(conduitMesh);

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16), materials.neonTubeMat.clone());
    panel.name = `arc-node-screen-${i}`;
    panel.position.set(0, 0, 0.24);
    moduleGroup.add(panel);

    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.22), materials.criticalWhite.clone());
    led.name = `arc-node-led-${i}`;
    led.position.set(0.24, 0, 0.12);
    led.rotation.y = Math.PI / 2;
    moduleGroup.add(led);

    signalSystem.add(moduleGroup);
  }

  reactorGroup.add(signalSystem);
  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(nodeTitaniumMeshes, materials.brushedTitanium, signalSystem, "arc-merged-processNodes-brushedTitanium");
  mergeGeometryBatch(nodeAnodizedMeshes, materials.anodizedBlack, signalSystem, "arc-merged-processNodes-anodizedBlack");
  mergeGeometryBatch(nodeCeramicMeshes, materials.darkCeramic, signalSystem, "arc-merged-processNodes-darkCeramic");
}
