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
 * - Upper (90°, edgeAngle 0): Coherent Armored Power Bridge (1 primary titanium housing,
 *   1 raised stepped spine, 1 deep recessed graphite distribution cavity, 2 integrated red
 *   energy channels, 3 thin functional retaining bridges, compact end connectors).
 * - Lower-Left (210°) & Lower-Right (330°): Symmetrical Armored Energy Conduits (1 primary
 *   tapered housing, 1 recessed graphite channel bed, 2 raised gunmetal side rails,
 *   1 dominant continuous primary red conductor, 1 thinner less-luminous segmented indicator,
 *   twin slim retaining clamps, compact mechanical end connectors).
 */
export function buildTrenches(
  reactorGroup: THREE.Group,
  materials: ReactorMaterials,
  lighting: ReactorLighting,
  apothem: number
): void {
  const trenchLength = 6.50;

  // Shared primary tapered titanium housing walls & single deep recessed graphite-ceramic cavity bed
  const innerWallGeo = createBeveledTrapezoid(trenchLength - 0.96, trenchLength - 1.38, 0.30, 0.42, 0.036, 0.036);
  const outerWallGeo = createBeveledTrapezoid(trenchLength - 0.36, trenchLength - 0.84, 0.32, 0.42, 0.036, 0.036);
  const cavityBedGeo = createBeveledTrapezoid(trenchLength - 0.62, trenchLength - 0.96, 0.72, 0.16, 0.016, 0.016);

  // Compact mechanical end connections transitioning cleanly into the corner clamps + subtle copper contact
  const endCouplerGeo = createBeveledTrapezoid(0.54, 0.40, 0.92, 0.40, 0.028, 0.028);
  const endFlangeGeo = createBeveledTrapezoid(0.20, 0.16, 0.82, 0.43, 0.015, 0.015);
  const endCopperContactGeo = createBeveledTrapezoid(0.075, 0.062, 0.20, 0.05, 0.008, 0.008);
  const capGeo = createBeveledHexagon(0.10, 0.15, 0.014, 0.014);

  // Upper Armored Power Bridge — clean stepped spine + recessed distribution cavity + 3 thin retaining bridges
  const bridgeSpineBaseGeo = createBeveledTrapezoid(2.84, 2.46, 0.25, 0.15, 0.020, 0.020);
  const bridgeDistributionBedGeo = createBeveledTrapezoid(2.56, 2.26, 0.11, 0.08, 0.010, 0.010);
  const bridgeSpineRailGeo = createBeveledTrapezoid(2.48, 2.18, 0.062, 0.12, 0.014, 0.014);
  const bridgeSpineTrimGeo = createBeveledTrapezoid(2.34, 2.04, 0.036, 0.036, 0.008, 0.008);
  const bridgeRetainerSpanGeo = createBeveledTrapezoid(0.16, 0.13, 1.02, 0.085, 0.014, 0.014);
  const bridgeRetainerLegGeo = createBeveledTrapezoid(0.15, 0.11, 0.13, 0.32, 0.012, 0.012);

  // Diagonal Armored Energy Conduits — symmetrical raised structural side rails & clean divider rib
  const conduitCenterRibGeo = createBeveledTrapezoid(trenchLength - 1.56, trenchLength - 1.74, 0.044, 0.08, 0.008, 0.008);
  const conduitInnerRailGeo = createBeveledTrapezoid(trenchLength - 1.24, trenchLength - 1.54, 0.105, 0.11, 0.016, 0.016);
  const conduitOuterRailGeo = createBeveledTrapezoid(trenchLength - 0.74, trenchLength - 1.08, 0.105, 0.11, 0.016, 0.016);
  const conduitClampSpanGeo = createBeveledTrapezoid(0.17, 0.14, 1.00, 0.09, 0.014, 0.014);
  // Secondary segmented indicator channel: noticeably thinner (r = 0.022 vs primary r = 0.050)
  const conduitSegBarGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.90, 12);
  ensureUv2(conduitSegBarGeo);
  const conduitSegSleeveGeo = createBeveledTrapezoid(0.16, 0.13, 0.12, 0.10, 0.010, 0.010);

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

    // 1. Coherent Primary Load-Bearing Titanium Housing & Single Recessed Matte Graphite Cavity Bed
    addMesh(edgeGroup, innerWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem - 0.39, 0.06);
    addMesh(edgeGroup, outerWallGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem + 0.40, 0.06);
    addMesh(edgeGroup, cavityBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, -0.14);

    // Compact Mechanical End Connections integrated into the corner clamps + subtle copper contact
    for (const endSign of [-1, 1]) {
      addMesh(edgeGroup, endCouplerGeo, materials.anodizedBlack, trenchAnodizedBlack, endSign * 2.38, apothem, 0.06);
      addMesh(edgeGroup, endFlangeGeo, materials.ringFrameMat, trenchRingFrame, endSign * 2.58, apothem, 0.08);
      addMesh(edgeGroup, endCopperContactGeo, materials.copperWinding, trenchCopper, endSign * 2.22, apothem, 0.22);
    }

    if (mod.role === "upper-bridge") {
      // =========================================================================
      // UPPER POWER BRIDGE — CLEAN 6-ELEMENT PRECISION CONSTRUCTION
      // =========================================================================
      // Raised central stepped titanium spine + recessed inner graphite distribution cavity
      addMesh(edgeGroup, bridgeSpineBaseGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem, 0.13);
      addMesh(edgeGroup, bridgeDistributionBedGeo, materials.darkCeramic, trenchDarkCeramic, 0, apothem, 0.17);
      for (const side of [-1, 1]) {
        const wallY = apothem + side * 0.084;
        addMesh(edgeGroup, bridgeSpineRailGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, wallY, 0.21);
        addMesh(edgeGroup, bridgeSpineTrimGeo, materials.brushedTitanium, trenchBrushedTitanium, 0, wallY, 0.27);
      }

      // Two integrated red energy channels with collars & machined end caps
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

      // Three thin functional retaining bridges spanning the housing cleanly (no double-stacked trim)
      for (const rx of [-1.64, 0, 1.64]) {
        const spanZ = rx === 0 ? 0.28 : 0.26;
        addMesh(edgeGroup, bridgeRetainerSpanGeo, materials.ringFrameMat, trenchRingFrame, rx, apothem, spanZ);
        for (const side of [-1, 1]) {
          addMesh(edgeGroup, bridgeRetainerLegGeo, materials.anodizedBlack, trenchAnodizedBlack, rx, apothem + side * 0.44, 0.14);
        }
      }
    } else {
      // =========================================================================
      // DIAGONAL CONDUITS — CLEAN SYMMETRICAL ARMORED CONSTRUCTION (210° & 330°)
      // =========================================================================
      // Single recessed dark divider rib separating primary conductor from secondary indicator
      addMesh(edgeGroup, conduitCenterRibGeo, materials.anodizedBlack, trenchAnodizedBlack, 0, apothem + 0.02, 0.04);

      // Two raised dark-gunmetal structural side rails seated directly onto the tapered housing walls
      addMesh(edgeGroup, conduitInnerRailGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem - 0.39, 0.27);
      addMesh(edgeGroup, conduitOuterRailGeo, materials.ringFrameMat, trenchRingFrame, 0, apothem + 0.40, 0.27);

      // Primary continuous red conductor (visually dominant, r = 0.050) + 4 instanced collars & end caps
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

      // Secondary thinner segmented indicator channel (r = 0.022, lower luminance)
      const secondaryY = apothem + 0.17;
      for (const segX of [-1.32, 0, 1.32]) {
        addMesh(edgeGroup, conduitSegBarGeo, materials.coreDiodeMat, trenchSecondaryIndicator, segX, secondaryY, 0.06, Math.PI / 2);
      }
      for (const divX of [-0.66, 0.66]) {
        addMesh(edgeGroup, conduitSegSleeveGeo, materials.anodizedBlack, trenchAnodizedBlack, divX, secondaryY, 0.08);
      }

      // Twin slim retaining clamps tying the raised side rails across both channels
      for (const rx of [-1.64, 1.64]) {
        addMesh(edgeGroup, conduitClampSpanGeo, materials.ringFrameMat, trenchRingFrame, rx, apothem, 0.27);
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
