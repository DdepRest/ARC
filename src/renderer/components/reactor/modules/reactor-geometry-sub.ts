import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import { createHUDLabel } from "./reactor-particles";
import { ensureUv2 } from "./reactor-geometry-details";

function mergeStaticMeshBatch(
  meshes: THREE.Mesh[],
  material: THREE.Material,
  targetParent: THREE.Object3D,
  name: string
): void {
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

  const disposedOriginals = new Set<THREE.BufferGeometry>();
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    if (mesh.geometry && !disposedOriginals.has(mesh.geometry)) {
      disposedOriginals.add(mesh.geometry);
      mesh.geometry.dispose();
    }
  }

  if (mergedGeo) {
    ensureUv2(mergedGeo);
    const mergedMesh = new THREE.Mesh(mergedGeo, material);
    mergedMesh.name = name;
    mergedMesh.updateMatrix();
    mergedMesh.matrixAutoUpdate = false;
    targetParent.add(mergedMesh);
  }
}

export function buildTrenches(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials,
  lighting: ReactorLighting,
  apothem: number
): void {
  const trenchLength = 7.0;

  // Pre-instantiate geometries for sharing (Memory Optimization)
  const innerWallGeo = new THREE.BoxGeometry(trenchLength - 1.0, 0.6, 0.6, 2, 2, 2);
  const outerWallGeo = new THREE.BoxGeometry(trenchLength + 1.0, 0.6, 0.6, 2, 2, 2);
  const floorGeo = new THREE.BoxGeometry(trenchLength, 1.0, 0.15);
  const tubeGeo = new THREE.CylinderGeometry(0.1, 0.1, trenchLength - 1.8, 32);
  const collarGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24);
  const collarSlotGeo = new THREE.TorusGeometry(0.155, 0.015, 8, 24);
  const capGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.28, 24);
  const ribBaseGeo = new THREE.BoxGeometry(0.28, 1.2, 0.18);
  const ribTrimGeo = new THREE.BoxGeometry(0.14, 1.2, 0.24);

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

    // Dark Matter Monolithic Channel Walls
    const innerWall = new THREE.Mesh(innerWallGeo, materials.anodizedBlack);
    innerWall.position.set(0, apothem - 0.5, 0.25);
    edgeGroup.add(innerWall);
    trenchAnodizedBlack.push(innerWall);

    const outerWall = new THREE.Mesh(outerWallGeo, materials.anodizedBlack);
    outerWall.position.set(0, apothem + 0.5, 0.25);
    edgeGroup.add(outerWall);
    trenchAnodizedBlack.push(outerWall);

    const floor = new THREE.Mesh(floorGeo, materials.darkCarbon);
    floor.position.set(0, apothem, -0.05);
    edgeGroup.add(floor);
    trenchDarkCarbon.push(floor);

    // Dual Plasma Waveguides with Magnetic Emitter Rings
    for (let t = -1; t <= 1; t += 2) {
      const tube = new THREE.Mesh(tubeGeo, materials.neonTubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0, apothem + t * 0.22, 0.16);
      edgeGroup.add(tube);
      trenchNeonTube.push(tube);

      // 6 High-tech Magnetic Emitter Collars (Instanced across all 3 trenches)
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
      cap1.rotation.z = Math.PI / 2;
      cap1.position.set((trenchLength - 1.8) / 2, apothem + t * 0.22, 0.16);
      edgeGroup.add(cap1);
      trenchBrushedTitanium.push(cap1);

      const cap2 = cap1.clone();
      cap2.position.set(-(trenchLength - 1.8) / 2, apothem + t * 0.22, 0.16);
      edgeGroup.add(cap2);
      trenchBrushedTitanium.push(cap2);
    }

    // Single centered PointLight per trench (replaces 2 overlapping lights 0.44 units apart -> 3 fewer PBR PointLights per pixel)
    const softGlowLight = new THREE.PointLight(
      materials.currentColor.getHex(),
      0.32,
      3.5,
      2.0
    );
    softGlowLight.position.set(0, apothem, 0.32);
    edgeGroup.add(softGlowLight);
    lighting.trenchLights.push(softGlowLight);

    // Heavy Structural Cross-Ribs
    for (let x = -1; x <= 1; x += 2) {
      const ribBase = new THREE.Mesh(ribBaseGeo, materials.anodizedBlack);
      ribBase.position.set(x * 1.8, apothem, 0.5);

      const ribTrim = new THREE.Mesh(ribTrimGeo, materials.ringFrameMat);
      ribTrim.position.set(x * 1.8, apothem, 0.54);

      edgeGroup.add(ribBase);
      edgeGroup.add(ribTrim);
      trenchAnodizedBlack.push(ribBase);
      trenchRingFrame.push(ribTrim);
    }

    reactorGroup.add(edgeGroup);
  }

  reactorGroup.updateMatrixWorld(true);

  mergeStaticMeshBatch(trenchAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-trenches-anodizedBlack");
  mergeStaticMeshBatch(trenchDarkCarbon, materials.darkCarbon, reactorGroup, "arc-merged-trenches-darkCarbon");
  mergeStaticMeshBatch(trenchNeonTube, materials.neonTubeMat, reactorGroup, "arc-merged-trenches-neonTubeMat");
  mergeStaticMeshBatch(trenchBrushedTitanium, materials.brushedTitanium, reactorGroup, "arc-merged-trenches-brushedTitanium");
  mergeStaticMeshBatch(trenchRingFrame, materials.ringFrameMat, reactorGroup, "arc-merged-trenches-ringFrameMat");

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
  
  // Pre-instantiate geometries for sharing (Memory Optimization)
  const blockGeo = new THREE.BoxGeometry(1.6, 2.2, 0.45, 2, 2, 2);
  const plateGeo = new THREE.BoxGeometry(1.65, 0.2, 0.55);
  const capGeo = new THREE.BoxGeometry(1.3, 1.7, 0.1);
  const ceramicPadGeo = new THREE.BoxGeometry(1.44, 1.88, 0.05);
  const slitGeo = new THREE.BoxGeometry(1.1, 0.04, 0.05);
  const indicatorGeo = new THREE.BoxGeometry(0.3, 0.06, 0.02);
  const pistonGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.95, 16);

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
  const clampNeonTube: THREE.Mesh[] = [];

  for (let i = 0; i < 3; i++) {
    const vAngle = Math.PI / 2 + ((Math.PI * 2) / 3) * i;
    const clampGroup = new THREE.Group();
    clampGroup.name = `arc-corner-clamp-${i}`;
    clampGroup.position.set(
      Math.cos(vAngle) * clampDist,
      Math.sin(vAngle) * clampDist,
      0.35
    );
    clampGroup.rotation.z = vAngle + Math.PI / 2;

    dummyClamp.position.copy(clampGroup.position);
    dummyClamp.rotation.set(0, 0, clampGroup.rotation.z);

    // 1. Massive Sleek Monolith Block (Anodized Black)
    const blockMesh = new THREE.Mesh(blockGeo, materials.anodizedBlack);
    blockMesh.position.z = 0.25;
    clampGroup.add(blockMesh);
    clampAnodizedBlack.push(blockMesh);

    // 2. Heavy Titanium Side Anchor Plates
    for (let side = -1; side <= 1; side += 2) {
      const plateMesh = new THREE.Mesh(plateGeo, materials.brushedTitanium);
      plateMesh.position.set(0, side * 0.95, 0.3);
      clampGroup.add(plateMesh);
      clampBrushedTitanium.push(plateMesh);
    }

    // 3. Matte Dark Ceramic Thermal Insulator Pad + Dark Carbon Cap Plate
    const ceramicPad = new THREE.Mesh(ceramicPadGeo, materials.darkCeramic);
    ceramicPad.position.z = 0.48;
    clampGroup.add(ceramicPad);
    clampDarkCeramic.push(ceramicPad);

    const capMesh = new THREE.Mesh(capGeo, materials.darkCarbon);
    capMesh.position.z = 0.53;
    clampGroup.add(capMesh);
    clampDarkCarbon.push(capMesh);

    // 4. Glowing Data Grooves (3 sleek neon slits matching trench waveguides)
    for (let g = -1; g <= 1; g++) {
      const slitMesh = new THREE.Mesh(slitGeo, materials.neonTubeMat);
      slitMesh.position.set(0, g * 0.3, 0.56);
      clampGroup.add(slitMesh);
      clampNeonTube.push(slitMesh);
    }

    // 5. Monolith Status Indicator (Very minimal glowing accent)
    const indicator = new THREE.Mesh(indicatorGeo, materials.neonTubeMat);
    indicator.position.z = 0.58;
    clampGroup.add(indicator);
    clampNeonTube.push(indicator);

    // 6. Crisp HUD Technical Monolith Badge
    const serial = createHUDLabel(
      `LOCK-${10 + i} // SECURE`,
      new THREE.Vector3(0, -1.2, 0.45)
    );
    if (serial) {
      serial.scale.set(1.4, 0.35, 1);
      clampGroup.add(serial);
    }

    // 7. Dark Titanium Anchor Pins to the floor (InstancedMesh x12)
    for (let p = -1; p <= 1; p += 2) {
      for (let p2 = -1; p2 <= 1; p2 += 2) {
        dummyPiston.position.set(p * 0.7, p2 * 1.05, 0);
        dummyPiston.rotation.set(Math.PI / 2, 0, 0);
        dummyClamp.updateMatrixWorld(true);
        pistonInst.setMatrixAt(pistonIdx++, dummyPiston.matrixWorld);
      }
    }

    // 8. Monolith Local Glow Light
    const clampLight = new THREE.PointLight(materials.currentColor.getHex(), 0.5, 4.0, 2.0);
    clampLight.position.set(0, 0, 0.65);
    clampLight.name = `arc-clamp-light-${i}`;
    clampGroup.add(clampLight);

    reactorGroup.add(clampGroup);
  }

  reactorGroup.updateMatrixWorld(true);

  mergeStaticMeshBatch(clampAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-clamps-anodizedBlack");
  mergeStaticMeshBatch(clampBrushedTitanium, materials.brushedTitanium, reactorGroup, "arc-merged-clamps-brushedTitanium");
  mergeStaticMeshBatch(clampDarkCarbon, materials.darkCarbon, reactorGroup, "arc-merged-clamps-darkCarbon");
  mergeStaticMeshBatch(clampDarkCeramic, materials.darkCeramic, reactorGroup, "arc-merged-clamps-darkCeramic");
  mergeStaticMeshBatch(clampNeonTube, materials.neonTubeMat, reactorGroup, "arc-merged-clamps-neonTubeMat");

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

  const nodeBoxMeshes: THREE.Mesh[] = [];

  // 6 Outer Process Nodes positioned on the outer perimeter (r = 3.8)
  for (let i = 0; i < 6; i++) {
    const angle = ((Math.PI * 2) / 6) * i + Math.PI / 6;
    const moduleGroup = new THREE.Group();
    moduleGroup.name = `arc-process-node-${i}`;

    const boxGeo = new THREE.BoxGeometry(0.5, 0.35, 0.2);
    const box = new THREE.Mesh(boxGeo, materials.brushedTitanium);
    moduleGroup.add(box);
    nodeBoxMeshes.push(box);

    const panelGeo = new THREE.PlaneGeometry(0.36, 0.18);
    const panel = new THREE.Mesh(panelGeo, materials.neonTubeMat.clone());
    panel.name = `arc-node-screen-${i}`;
    panel.position.set(0, 0, 0.11);
    moduleGroup.add(panel);

    const ledGeo = new THREE.PlaneGeometry(0.04, 0.25);
    const led = new THREE.Mesh(ledGeo, materials.criticalWhite.clone());
    led.name = `arc-node-led-${i}`;
    led.position.set(0.24, 0, 0);
    led.rotation.y = Math.PI / 2;
    moduleGroup.add(led);

    moduleGroup.position.set(
      Math.cos(angle) * 3.8,
      Math.sin(angle) * 3.8,
      0.65
    );
    moduleGroup.rotation.z = angle + Math.PI / 2;
    signalSystem.add(moduleGroup);
  }

  reactorGroup.add(signalSystem);
  reactorGroup.updateMatrixWorld(true);

  mergeStaticMeshBatch(
    nodeBoxMeshes,
    materials.brushedTitanium,
    signalSystem,
    "arc-merged-processNodes-brushedTitanium"
  );
}


