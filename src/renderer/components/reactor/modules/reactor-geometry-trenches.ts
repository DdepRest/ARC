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

  // Shared primary load-bearing titanium housing & recessed cavity geometries
  const innerWallGeo = createBeveledTrapezoid(trenchLength - 0.96, trenchLength - 1.38, 0.30, 0.42, 0.036, 0.036);
  const outerWallGeo = createBeveledTrapezoid(trenchLength - 0.36, trenchLength - 0.84, 0.32, 0.42, 0.036, 0.036);
  const floorGeo = createBeveledTrapezoid(trenchLength - 0.50, trenchLength - 0.84, 0.74, 0.18, 0.018, 0.018);
  const channelBorderGeo = createBeveledTrapezoid(trenchLength - 1.46, trenchLength - 1.64, 0.038, 0.06, 0.008, 0.008);

  // Layered mechanical end connectors integrated into the existing corner clamps + subtle copper contacts
  const endCouplerGeo = createBeveledTrapezoid(0.56, 0.42, 0.94, 0.40, 0.03, 0.03);
  const endFlangeGeo = createBeveledTrapezoid(0.22, 0.18, 0.84, 0.44, 0.016, 0.016);
  const endConnectorCapGeo = createBeveledTrapezoid(0.16, 0.12, 0.64, 0.12, 0.012, 0.012);
  const endCopperContactGeo = createBeveledTrapezoid(0.085, 0.07, 0.24, 0.055, 0.008, 0.008);
  const capGeo = createBeveledHexagon(0.105, 0.16, 0.015, 0.015);

  // Upper Armored Power Bridge — 5 Functional Elements (reusable createBeveledTrapezoid shapes, controlled height)
  const bridgeOuterStepGeo = createBeveledTrapezoid(trenchLength - 1.06, trenchLength - 1.48, 0.13, 0.14, 0.016, 0.016);
  const bridgeSideArmorGeo = createBeveledTrapezoid(1.56, 1.32, 0.16, 0.14, 0.018, 0.018);
  const bridgeCeramicBedGeo = createBeveledTrapezoid(trenchLength - 1.18, trenchLength - 1.34, 0.52, 0.12, 0.014, 0.014);
  const bridgeSpineBaseGeo = createBeveledTrapezoid(2.86, 2.48, 0.26, 0.16, 0.022, 0.022);
  const bridgeInnerDistributionBedGeo = createBeveledTrapezoid(2.58, 2.28, 0.11, 0.09, 0.012, 0.012);
  const bridgeSpineWallGeo = createBeveledTrapezoid(2.52, 2.20, 0.068, 0.13, 0.014, 0.014);
  const bridgeSpineBevelLipGeo = createBeveledTrapezoid(2.36, 2.06, 0.046, 0.048, 0.010, 0.010);
  const bridgeChannelWallGeo = createBeveledTrapezoid(trenchLength - 1.54, trenchLength - 1.72, 0.034, 0.08, 0.008, 0.008);
  const bridgeRetainerSpanGeo = createBeveledTrapezoid(0.18, 0.14, 1.04, 0.09, 0.014, 0.014);
  const bridgeRetainerTrimGeo = createBeveledTrapezoid(0.085, 0.065, 0.88, 0.042, 0.008, 0.008);
  const bridgeRetainerLegGeo = createBeveledTrapezoid(0.16, 0.12, 0.14, 0.34, 0.012, 0.012);

  // Diagonal Armored Energy Conduits — Symmetrical reusable layered geometries
  const conduitDeckGeo = createBeveledTrapezoid(trenchLength - 1.22, trenchLength - 1.44, 0.48, 0.14, 0.015, 0.015);
  const conduitCenterDividerGeo = createBeveledTrapezoid(trenchLength - 1.52, trenchLength - 1.70, 0.040, 0.075, 0.008, 0.008);
  const conduitRailBedGeo = createBeveledTrapezoid(trenchLength - 1.12, trenchLength - 1.42, 0.13, 0.09, 0.012, 0.012);
  const conduitInnerRailGeo = createBeveledTrapezoid(trenchLength - 1.32, trenchLength - 1.60, 0.098, 0.10, 0.016, 0.016);
  const conduitOuterRailGeo = createBeveledTrapezoid(trenchLength - 0.78, trenchLength - 1.12, 0.098, 0.10, 0.016, 0.016);
  const conduitShoulderGeo = createBeveledTrapezoid(0.32, 0.24, 0.20, 0.13, 0.015, 0.015);
  const conduitClampSpanGeo = createBeveledTrapezoid(0.19, 0.15, 1.02, 0.10, 0.015, 0.015);
  const conduitClampTrimGeo = createBeveledTrapezoid(0.085, 0.065, 0.86, 0.044, 0.008, 0.008);
  // Secondary segmented indicator channel: noticeably thinner (r = 0.024 vs primary r = 0.050)
  const conduitSegBarGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.92, 12);
  ensureUv2(conduitSegBarGeo);
  const conduitSegSleeveGeo = createBeveledTrapezoid(0.18, 0.14, 0.14, 0.12, 0.012, 0.012);

  // Primary continuous recessed red energy conductor (r = 0.050) & instanced collars (16 total)
  const continuousTubeGeo = new THREE.CylinderGeometry(0.050, 0.050, trenchLength - 1.92, 18);
  ensureUv2(continuousTubeGeo);
  const collarGeo = new THREE.CylinderGeometry(0.094, 0.098, 0.105, 16);
  ensureUv2(collarGeo);
  const collarSlotGeo = new THREE.TorusGeometry(0.098, 0.012, 10, 18);
  ensureUv2(collarSlotGeo);

  const collarInst = new THREE.InstancedMesh(collarGeo, materials.ringFrameMat, 16);
  const collarSlotInst = new THREE.InstancedMesh(collarSlotGeo, materials.ringFrameMat, 16);
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
  const trenchSecondaryIndicator: THREE.Mesh[] = [];
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

    // 1. Primary Load-Bearing Tapered Titanium Housing & Recessed Structural Floor (shared across all 3 modules)
    addMesh(edgeGroup, innerWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem - 0.39, 0.06);
    addMesh(edgeGroup, outerWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem + 0.40, 0.06);
    addMesh(edgeGroup, floorGeo, materials.darkCarbon, trenchDarkCarbon, 0, apothem, -0.17);

    // Thin dark-gunmetal outer channel borders framing the internal cavity walls
    addMesh(edgeGroup, channelBorderGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem - 0.26, 0.13);
    addMesh(edgeGroup, channelBorderGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem + 0.26, 0.13);

    // Layered mechanical end connectors integrated into the corner clamps + subtle copper contacts at functional connection points
    for (const endSign of [-1, 1]) {
      addMesh(edgeGroup, endCouplerGeo, materials.anodizedBlack, trenchAnodizedBlack, endSign * 2.38, apothem, 0.06);
      addMesh(edgeGroup, endFlangeGeo, materials.ringFrameMat, trenchRingFrame, endSign * 2.58, apothem, 0.08);
      addMesh(edgeGroup, endConnectorCapGeo, materials.brushedTitanium, trenchBrushedTitanium, endSign * 2.28, apothem, 0.23);
      addMesh(edgeGroup, endCopperContactGeo, materials.copperWinding, trenchCopper, endSign * 2.18, apothem, 0.21);
    }

    if (mod.role === "upper-bridge") {
      // =========================================================================
      // UPPER MODULE — FIVE-ELEMENT STEPPED ARMORED POWER BRIDGE
      // 1. Primary load-bearing titanium housing (above)
      // 2. Raised central stepped spine (controlled height, beveled titanium edges)
      // 3. Deep graphite distribution channel recessed inside the spine
      // 4. Two recessed red energy conductors with dark channel walls
      // 5. Symmetrical side armor and three thin retaining bridges
      // =========================================================================
      // Recessed matte graphite ceramic channel bed + dark inner channel walls
      addMesh(edgeGroup, bridgeCeramicBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, -0.04);
      addMesh(edgeGroup, bridgeChannelWallGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem - 0.13, 0.11);
      addMesh(edgeGroup, bridgeChannelWallGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem + 0.13, 0.11);

      // Raised central stepped titanium spine + deeply recessed inner graphite distribution channel
      addMesh(edgeGroup, bridgeSpineBaseGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem, 0.14);
      addMesh(edgeGroup, bridgeInnerDistributionBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, 0.18);
      for (const side of [-1, 1]) {
        const wallY = apothem + side * 0.086;
        addMesh(edgeGroup, bridgeSpineWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, wallY, 0.22);
        addMesh(edgeGroup, bridgeSpineBevelLipGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, wallY, 0.285);
      }

      // Symmetrical side armor housings + gunmetal stepped shoulders
      addMesh(edgeGroup, bridgeOuterStepGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem + 0.42, 0.24);
      addMesh(edgeGroup, bridgeOuterStepGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem - 0.40, 0.22);
      for (const sideX of [-1.06, 1.06]) {
        addMesh(edgeGroup, bridgeSideArmorGeo, materials.anodizedBlack, trenchAnodizedBlack, sideX, apothem + 0.39, 0.20);
        addMesh(edgeGroup, bridgeSideArmorGeo, materials.anodizedBlack, trenchAnodizedBlack, sideX, apothem - 0.38, 0.19);
      }

      // Two internal recessed red energy conductors with collars & machined end caps
      for (let t = -1; t <= 1; t += 2) {
        const chY = apothem + t * 0.20;
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

      // Three thin precision-machined retaining bridges spanning the channels and stepped spine
      for (const rx of [-1.64, 0, 1.64]) {
        const spanZ = rx === 0 ? 0.29 : 0.27;
        addMesh(edgeGroup, bridgeRetainerSpanGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem, spanZ);
        addMesh(edgeGroup, bridgeRetainerTrimGeo, materials.ringFrameMat, trenchRingFrame, rx, apothem, spanZ + 0.055);
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, bridgeRetainerLegGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem + side * 0.44, 0.14);
        }
      }
    } else {
      // =========================================================================
      // DIAGONAL CONDUITS — SYMMETRICAL CONSTRUCTION (210° & 330° Identical Geometry & Weight)
      // - Tapered primary armored housing
      // - Two raised graphite/titanium side rails
      // - Recessed central graphite surface + thin metallic channel divider
      // - Visually dominant primary continuous red conductor
      // - Noticeably thinner & less luminous secondary segmented indicator channel
      // - Reinforced mechanical end connectors & twin retaining clamps
      // =========================================================================
      // Recessed central matte graphite ceramic bed + central metallic channel border
      addMesh(edgeGroup, conduitDeckGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, -0.02);
      addMesh(edgeGroup, conduitCenterDividerGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem + 0.02, 0.11);

      // Two raised graphite/titanium side rails & reinforced casing transition shoulders
      addMesh(edgeGroup, conduitRailBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem - 0.39, 0.19);
      addMesh(edgeGroup, conduitRailBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem + 0.40, 0.19);
      addMesh(edgeGroup, conduitInnerRailGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, apothem - 0.40, 0.28);
      addMesh(edgeGroup, conduitOuterRailGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, apothem + 0.41, 0.28);
      for (const sx of [-1.46, 1.46]) {
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, conduitShoulderGeo, materials.ringFrameMat, trenchRingFrame, sx, apothem + side * 0.42, 0.17);
        }
      }

      // Primary continuous red conductor (visually dominant, r = 0.050) + 4 instanced collars & machined end caps
      const primaryY = apothem - 0.15;
      addMesh(edgeGroup, continuousTubeGeo, materials.neonTubeMat, trenchNeonTube, 0, primaryY, 0.08, Math.PI / 2);
      for (let c = 0; c < 4; c++) {
        const xPos = -1.65 + c * 1.10;
        dummyPart.position.set(xPos, primaryY, 0.08);
        dummyPart.rotation.set(0, 0, Math.PI / 2);
        dummyEdge.updateMatrixWorld(true);
        collarInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);

        dummyPart.rotation.set(0, Math.PI / 2, 0);
        dummyEdge.updateMatrixWorld(true);
        collarSlotInst.setMatrixAt(collarIdx, dummyPart.matrixWorld);
        collarIdx++;
      }
      const capX = (trenchLength - 1.92) / 2;
      addMesh(edgeGroup, capGeo, materials.ringFrameMat, trenchRingFrame, capX, primaryY, 0.08, 0, Math.PI / 2);
      addMesh(edgeGroup, capGeo, materials.ringFrameMat, trenchRingFrame, -capX, primaryY, 0.08, 0, Math.PI / 2);

      // Secondary thin segmented indicator channel (r = 0.024, noticeably thinner and less luminous)
      const secondaryY = apothem + 0.17;
      for (const segX of [-1.32, 0, 1.32]) {
        addMesh(edgeGroup, conduitSegBarGeo, materials.coreDiodeMat, trenchSecondaryIndicator, segX, secondaryY, 0.06, Math.PI / 2);
      }
      for (const divX of [-0.66, 0.66]) {
        addMesh(edgeGroup, conduitSegSleeveGeo, materials.ringFrameMat, trenchRingFrame, divX, secondaryY, 0.09);
      }

      // Twin precision retaining clamps tying the raised side rails across both recessed channels
      for (const rx of [-1.64, 1.64]) {
        addMesh(edgeGroup, conduitClampSpanGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem, 0.28);
        addMesh(edgeGroup, conduitClampTrimGeo, materials.ringFrameMat, trenchRingFrame, rx, apothem, 0.34);
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, bridgeRetainerLegGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem + side * 0.44, 0.14);
        }
      }
    }

    // Localized red channel fill light illuminating nearby channel walls, bevels & connectors
    const softGlowLight = new THREE.PointLight(materials.currentColor.getHex(), 0.26, 3.3, 2.0);
    softGlowLight.position.set(0, apothem, 0.22);
    edgeGroup.add(softGlowLight);
    lighting.trenchLights.push(softGlowLight);

    reactorGroup.add(edgeGroup);
  });

  reactorGroup.updateMatrixWorld(true);

  mergeGeometryBatch(trenchAnodizedBlack, materials.anodizedBlack, reactorGroup, "arc-merged-trenches-anodizedBlack");
  mergeGeometryBatch(trenchDarkCarbon, materials.darkCarbon, reactorGroup, "arc-merged-trenches-darkCarbon");
  mergeGeometryBatch(trenchDarkCeramic, materials.darkCeramic, reactorGroup, "arc-merged-trenches-darkCeramic");
  mergeGeometryBatch(trenchNeonTube, materials.neonTubeMat, reactorGroup, "arc-merged-trenches-neonTubeMat");
  const secondaryIndicatorMat = materials.neonTubeMat.clone();
  mergeGeometryBatch(trenchSecondaryIndicator, secondaryIndicatorMat, reactorGroup, "arc-merged-trenches-secondaryIndicator");
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
