import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";
import type { ReactorLighting } from "./reactor-lighting";
import {
  ensureUv2,
  createBeveledTrapezoid,
  createBeveledHexagon,
  mergeGeometryBatch,
} from "./reactor-geometry-primitives";

type PrimaryModuleRole = "upper-bridge" | "left-conduit" | "right-conduit";

const PRIMARY_MODULE_LAYOUT: ReadonlyArray<{
  edgeAngle: number;
  radialAngle: number;
  role: PrimaryModuleRole;
}> = [
  { edgeAngle: 0, radialAngle: Math.PI / 2, role: "upper-bridge" },
  { edgeAngle: (Math.PI * 2) / 3, radialAngle: (7 * Math.PI) / 6, role: "left-conduit" },
  { edgeAngle: (Math.PI * 4) / 3, radialAngle: (11 * Math.PI) / 6, role: "right-conduit" },
];

/**
 * Builds the 3 primary radial perimeter structures aligned to the triangular frame:
 * - Upper (90°, edgeAngle 0): 3-layer Armored Power Bridge (load-bearing tapered housing,
 *   central stepped armored spine with symmetrical beveled plates, 2 recessed energy channels + 3 retainers)
 * - Lower-Left (210°) & Lower-Right (330°): Layered Armored Energy Conduits (tapered casing,
 *   ceramic central deck, raised titanium/gunmetal side rails, 1 continuous + 1 segmented recessed channel,
 *   machined end housings, and subtle functional deck differentiation).
 */
export function buildTrenches(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials,
  lighting: ReactorLighting,
  apothem: number
): void {
  const trenchLength = 6.50;

  // Shared primary casing & recessed cavity geometries (reused across modules)
  const innerWallGeo = createBeveledTrapezoid(trenchLength - 0.96, trenchLength - 1.38, 0.30, 0.44, 0.036, 0.036);
  const outerWallGeo = createBeveledTrapezoid(trenchLength - 0.36, trenchLength - 0.84, 0.32, 0.44, 0.036, 0.036);
  const floorGeo = createBeveledTrapezoid(trenchLength - 0.50, trenchLength - 0.84, 0.74, 0.18, 0.018, 0.018);
  const channelBorderGeo = createBeveledTrapezoid(trenchLength - 1.46, trenchLength - 1.64, 0.042, 0.06, 0.008, 0.008);
  const endCouplerGeo = createBeveledTrapezoid(0.56, 0.42, 0.94, 0.42, 0.03, 0.03);
  const endFlangeGeo = createBeveledTrapezoid(0.22, 0.18, 0.84, 0.46, 0.016, 0.016);
  const endCopperRingGeo = createBeveledTrapezoid(0.10, 0.10, 0.52, 0.10, 0.01, 0.01);
  const capGeo = createBeveledHexagon(0.11, 0.18, 0.016, 0.016);

  // Upper Armored Power Bridge dedicated layered geometries
  const bridgeOuterStepGeo = createBeveledTrapezoid(trenchLength - 1.05, trenchLength - 1.48, 0.14, 0.16, 0.018, 0.018);
  const bridgeCeramicBedGeo = createBeveledTrapezoid(trenchLength - 1.18, trenchLength - 1.32, 0.22, 0.14, 0.015, 0.015);
  const bridgeSpineBaseGeo = createBeveledTrapezoid(2.38, 1.98, 0.42, 0.24, 0.028, 0.028);
  const bridgeArmorPlateGeo = createBeveledTrapezoid(0.84, 0.66, 0.50, 0.15, 0.022, 0.022);
  const bridgeSpineKeystoneGeo = createBeveledTrapezoid(0.42, 0.34, 0.56, 0.16, 0.018, 0.018);
  const bridgeSpineCrestGeo = createBeveledTrapezoid(1.66, 1.36, 0.14, 0.09, 0.014, 0.014);
  const bridgeCopperBusGeo = createBeveledTrapezoid(0.28, 0.24, 0.34, 0.06, 0.01, 0.01);
  const bridgeRetainerSpanGeo = createBeveledTrapezoid(0.26, 0.20, 1.06, 0.14, 0.018, 0.018);
  const bridgeRetainerTrimGeo = createBeveledTrapezoid(0.11, 0.085, 0.90, 0.055, 0.01, 0.01);
  const bridgeRetainerLegGeo = createBeveledTrapezoid(0.18, 0.14, 0.16, 0.38, 0.014, 0.014);

  // Diagonal Armored Energy Conduit dedicated layered geometries (shared symmetrically by left & right)
  const conduitDeckGeo = createBeveledTrapezoid(trenchLength - 1.24, trenchLength - 1.46, 0.20, 0.18, 0.016, 0.016);
  const conduitInnerRailGeo = createBeveledTrapezoid(trenchLength - 1.34, trenchLength - 1.62, 0.095, 0.10, 0.016, 0.016);
  const conduitOuterRailGeo = createBeveledTrapezoid(trenchLength - 0.78, trenchLength - 1.12, 0.095, 0.10, 0.016, 0.016);
  const conduitShoulderGeo = createBeveledTrapezoid(0.32, 0.24, 0.22, 0.14, 0.016, 0.016);
  const conduitClampSpanGeo = createBeveledTrapezoid(0.24, 0.18, 1.04, 0.14, 0.018, 0.018);
  const conduitClampTrimGeo = createBeveledTrapezoid(0.10, 0.075, 0.88, 0.055, 0.01, 0.01);
  const conduitSegBarGeo = new THREE.CylinderGeometry(0.044, 0.044, 1.02, 14);
  ensureUv2(conduitSegBarGeo);
  const conduitSegSleeveGeo = createBeveledTrapezoid(0.22, 0.18, 0.24, 0.18, 0.014, 0.014);
  const conduitCopperStrapGeo = createBeveledTrapezoid(0.22, 0.18, 0.18, 0.06, 0.01, 0.01);
  const conduitBaffleRibGeo = createBeveledTrapezoid(0.24, 0.20, 0.16, 0.08, 0.01, 0.01);

  // Continuous recessed plasma waveguide tube & instanced collars (4 per continuous channel: 2 on bridge + 1 each diagonal = 16)
  const continuousTubeGeo = new THREE.CylinderGeometry(0.048, 0.048, trenchLength - 1.92, 18);
  ensureUv2(continuousTubeGeo);
  const collarGeo = new THREE.CylinderGeometry(0.096, 0.100, 0.11, 16);
  ensureUv2(collarGeo);
  const collarSlotGeo = new THREE.TorusGeometry(0.100, 0.013, 10, 18);
  ensureUv2(collarSlotGeo);

  const collarInst = new THREE.InstancedMesh(collarGeo, materials.ringFrameMat, 16);
  const collarSlotInst = new THREE.InstancedMesh(collarSlotGeo, materials.copperWinding, 16);
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
  const trenchCopper: THREE.Mesh[] = [];

  const addMesh = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    bucket: THREE.Mesh[],
    x: number,
    y: number,
    z: number,
    rotZ = 0,
    rotY = 0
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rotZ) m.rotation.z = rotZ;
    if (rotY) m.rotation.y = rotY;
    parent.add(m);
    bucket.push(m);
    return m;
  };

  PRIMARY_MODULE_LAYOUT.forEach((mod, i) => {
    const edgeGroup = new THREE.Group();
    edgeGroup.name = `arc-trench-${i}`;
    edgeGroup.rotation.z = mod.edgeAngle;

    dummyEdge.position.set(0, 0, 0);
    dummyEdge.rotation.set(0, 0, mod.edgeAngle);

    // 1. Primary Load-Bearing Tapered Armor Casing & Deep Recessed Cavity Floor (all 3 modules)
    addMesh(edgeGroup, innerWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem - 0.39, 0.06);
    addMesh(edgeGroup, outerWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem + 0.40, 0.06);
    addMesh(edgeGroup, floorGeo, materials.darkCarbon, trenchDarkCarbon, 0, apothem, -0.17);

    // Recessed thin dark-gunmetal channel borders framing the internal cavity walls
    addMesh(edgeGroup, channelBorderGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem - 0.25, 0.14);
    addMesh(edgeGroup, channelBorderGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem + 0.25, 0.14);

    // Machined mechanical end connection housings transitioning into the corner clamps
    for (const endSign of [-1, 1]) {
      const endX = endSign * 2.38;
      addMesh(edgeGroup, endCouplerGeo, materials.anodizedBlack, trenchAnodizedBlack, endX, apothem, 0.06);
      addMesh(edgeGroup, endFlangeGeo, materials.ringFrameMat, trenchRingFrame, endSign * 2.58, apothem, 0.08);
      addMesh(edgeGroup, endCopperRingGeo, materials.copperWinding, trenchCopper, endSign * 2.22, apothem, 0.24);
    }

    if (mod.role === "upper-bridge") {
      // ==========================================
      // UPPER MODULE — 3-LAYER ARMORED POWER BRIDGE
      // ==========================================
      // A. Primary body stepped machined outer shoulders & recessed matte ceramic cavity bed
      addMesh(edgeGroup, bridgeOuterStepGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem + 0.42, 0.26);
      addMesh(edgeGroup, bridgeOuterStepGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem - 0.40, 0.24);
      addMesh(edgeGroup, bridgeCeramicBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, -0.04);

      // B. Central Armored Spine: raised stepped ridge + 2 symmetrical beveled armor plates + machined crest
      addMesh(edgeGroup, bridgeSpineBaseGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem, 0.16);
      for (const side of [-1, 1]) {
        addMesh(edgeGroup, bridgeArmorPlateGeo, materials.anodizedBlack, trenchAnodizedBlack, side * 0.64, apothem, 0.28);
      }
      addMesh(edgeGroup, bridgeSpineKeystoneGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, 0.30);
      addMesh(edgeGroup, bridgeSpineCrestGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, apothem, 0.37);
      addMesh(edgeGroup, bridgeCopperBusGeo, materials.copperWinding, trenchCopper, 0, apothem, 0.39);

      // C. Two deeply recessed horizontal red energy channels with collars & 3 structural retainers
      for (let t = -1; t <= 1; t += 2) {
        const chY = apothem + t * 0.18;
        addMesh(edgeGroup, continuousTubeGeo, materials.neonTubeMat, trenchNeonTube, 0, chY, 0.07, Math.PI / 2);

        for (let c = 0; c < 4; c++) {
          const xPos = -1.68 + c * 1.12;
          dummyPart.position.set(xPos, chY, 0.07);
          dummyPart.rotation.set(0, 0, Math.PI / 2);
          dummyEdge.updateMatrixWorld(true);
          collarInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);

          dummyPart.rotation.set(0, Math.PI / 2, 0);
          dummyEdge.updateMatrixWorld(true);
          collarSlotInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);
          collarIdx++;
        }

        const capX = (trenchLength - 1.92) / 2;
        addMesh(edgeGroup, capGeo, materials.ringFrameMat, trenchRingFrame, capX, chY, 0.07, 0, Math.PI / 2);
        addMesh(edgeGroup, capGeo, materials.ringFrameMat, trenchRingFrame, -capX, chY, 0.07, 0, Math.PI / 2);
      }

      // 3 Structural Retainers segmenting the upper bridge channels (center keystone clamp + 2 flank bridge retainers)
      for (const rx of [-1.66, 0, 1.66]) {
        const spanZ = rx === 0 ? 0.33 : 0.31;
        addMesh(edgeGroup, bridgeRetainerSpanGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem, spanZ);
        addMesh(edgeGroup, bridgeRetainerTrimGeo, materials.ringFrameMat, trenchRingFrame, rx, apothem, spanZ + 0.085);
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, bridgeRetainerLegGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem + side * 0.45, 0.15);
        }
      }
    } else {
      // ==========================================
      // DIAGONAL MODULES — LAYERED ARMORED ENERGY CONDUITS (Equal Mass & Proportions)
      // ==========================================
      // 1. Matte dark graphite ceramic central deck surface
      addMesh(edgeGroup, conduitDeckGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, 0.04);

      // 2. Two raised machined titanium/gunmetal side reinforcement rails + casing transition shoulders
      addMesh(edgeGroup, conduitInnerRailGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, apothem - 0.40, 0.30);
      addMesh(edgeGroup, conduitOuterRailGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, apothem + 0.41, 0.30);
      for (const sx of [-1.45, 1.45]) {
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, conduitShoulderGeo, materials.ringFrameMat, trenchRingFrame, sx, apothem + side * 0.42, 0.18);
        }
      }

      // 3A. Inner Recessed Channel: Primary continuous red energy line + 4 precision collars
      const primaryY = apothem - 0.18;
      addMesh(edgeGroup, continuousTubeGeo, materials.neonTubeMat, trenchNeonTube, 0, primaryY, 0.07, Math.PI / 2);
      for (let c = 0; c < 4; c++) {
        const xPos = -1.65 + c * 1.10;
        dummyPart.position.set(xPos, primaryY, 0.07);
        dummyPart.rotation.set(0, 0, Math.PI / 2);
        dummyEdge.updateMatrixWorld(true);
        collarInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);

        dummyPart.rotation.set(0, Math.PI / 2, 0);
        dummyEdge.updateMatrixWorld(true);
        collarSlotInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);
        collarIdx++;
      }
      const capX = (trenchLength - 1.92) / 2;
      addMesh(edgeGroup, capGeo, materials.ringFrameMat, trenchRingFrame, capX, primaryY, 0.07, 0, Math.PI / 2);
      addMesh(edgeGroup, capGeo, materials.ringFrameMat, trenchRingFrame, -capX, primaryY, 0.07, 0, Math.PI / 2);

      // 3B. Outer Recessed Channel: Secondary segmented indicator channel (3 armored recessed optical bars)
      const secondaryY = apothem + 0.18;
      for (const segX of [-1.32, 0, 1.32]) {
        addMesh(edgeGroup, conduitSegBarGeo, materials.neonTubeMat, trenchNeonTube, segX, secondaryY, 0.07, Math.PI / 2);
      }
      for (const divX of [-0.66, 0.66]) {
        addMesh(edgeGroup, conduitSegSleeveGeo, materials.ringFrameMat, trenchRingFrame, divX, secondaryY, 0.11);
      }

      // Twin structural conduit clamps tying side rails cleanly across both recessed channels
      for (const rx of [-1.64, 1.64]) {
        addMesh(edgeGroup, conduitClampSpanGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem, 0.32);
        addMesh(edgeGroup, conduitClampTrimGeo, materials.brushedTitanium, trenchBrushedTitanium, rx, apothem, 0.40);
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, bridgeRetainerLegGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem + side * 0.44, 0.16);
        }
      }

      // 4. Subtle Functional Deck Differentiation (identical footprint & visual weight on left vs right)
      if (mod.role === "left-conduit") {
        // Left conduit (210°): twin burnished copper phase-coupling straps on central ceramic deck
        for (const cx of [-0.52, 0.52]) {
          addMesh(edgeGroup, conduitCopperStrapGeo, materials.copperWinding, trenchCopper, cx, apothem, 0.15);
        }
      } else {
        // Right conduit (330°): twin dark-gunmetal thermal baffle ribs in identical central deck pocket
        for (const cx of [-0.52, 0.52]) {
          addMesh(edgeGroup, conduitBaffleRibGeo, materials.ringFrameMat, trenchRingFrame, cx, apothem, 0.15);
        }
      }
    }

    // Restrained local red channel fill light (stays subtle and localized inside the recessed cavity)
    const softGlowLight = new THREE.PointLight(materials.currentColor.getHex(), 0.16, 2.6, 2.2);
    softGlowLight.position.set(0, apothem, 0.28);
    edgeGroup.add(softGlowLight);
    lighting.trenchLights.push(softGlowLight);

    reactorGroup.add(edgeGroup);
  });

  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(trenchAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-trenches-anodizedBlack");
  mergeGeometryBatch(trenchDarkCarbon, materials.darkCarbon, reactorGroup, "arc-merged-trenches-darkCarbon");
  mergeGeometryBatch(trenchDarkCeramic, materials.darkCeramic, reactorGroup, "arc-merged-trenches-darkCeramic");
  mergeGeometryBatch(trenchNeonTube, materials.neonTubeMat, reactorGroup, "arc-merged-trenches-neonTubeMat");
  mergeGeometryBatch(trenchBrushedTitanium, materials.brushedTitanium, reactorGroup, "arc-merged-trenches-brushedTitanium");
  mergeGeometryBatch(trenchRingFrame, materials.ringFrameMat, reactorGroup, "arc-merged-trenches-ringFrameMat");
  mergeGeometryBatch(trenchCopper, materials.copperWinding, reactorGroup, "arc-merged-trenches-copperWinding");

  for (const inst of [collarInst, collarSlotInst]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.updateMatrix();
    inst.matrixAutoUpdate = false;
    reactorGroup.add(inst);
  }
}
