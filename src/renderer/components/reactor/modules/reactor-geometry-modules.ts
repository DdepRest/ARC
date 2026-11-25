import * as THREE from 'three';
import type { ReactorMaterials } from './reactor-materials';
import {
  ensureUv2,
  createBeveledTrapezoid,
  createBeveledPolygon,
  createBeveledHexagon,
  mergeGeometryBatch,
} from './reactor-geometry-primitives';

/**
 * Builds 3 balanced, tightly integrated tri-symmetric outer substations at 30°, 150°, 270°
 * aligned with the 3 radial power bridges and outer open bays.
 *
 * Primary silhouette & structural mass are strictly tri-symmetric and ~28% more compact
 * than Stage I.1 (irregular flank lugs removed; optical accelerator ring passes cleanly across).
 * Restrained, purposeful secondary engineering details differentiate each bay:
 * - Upper-Right (30°): Compact flush 5-fin dark burnished copper thermal louver cassette
 * - Upper-Left (150°): Flush twin micro cryo-capacitor cylinders & copper busbar
 * - Bottom Ventral (270°): Sleek centered ventral stabilizer fin & twin exhaust vents
 */
export function buildAsymmetricOuterModules(
  outerEnvelope: THREE.Group,
  materials: ReactorMaterials
): void {
  const modGroup = new THREE.Group();
  modGroup.name = 'arc-asymmetric-outer-modules';

  const anodized: THREE.Mesh[] = [];
  const titanium: THREE.Mesh[] = [];
  const carbon: THREE.Mesh[] = [];
  const ceramic: THREE.Mesh[] = [];
  const copper: THREE.Mesh[] = [];
  const heatMetal: THREE.Mesh[] = [];
  const neon: THREE.Mesh[] = [];

  // Shared tri-symmetric compact structural cradle & shroud geometries (balanced visual mass across all 3 bays)
  const cradleGeo = createBeveledPolygon(
    [
      [-0.88, -0.36],
      [0.88, -0.36],
      [0.76, 0.38],
      [0.44, 0.54],
      [-0.44, 0.54],
      [-0.76, 0.38],
    ],
    0.40,
    0.038,
    0.038
  );
  const shroudGeo = createBeveledTrapezoid(1.32, 1.00, 0.56, 0.30, 0.03, 0.03);
  const barrierGeo = createBeveledTrapezoid(1.40, 1.26, 0.14, 0.26, 0.018, 0.018);
  const cheekGeo = createBeveledTrapezoid(0.12, 0.09, 0.76, 0.26, 0.015, 0.015);
  const topLipGeo = createBeveledTrapezoid(0.94, 0.72, 0.19, 0.08, 0.015, 0.015);
  const ventSlitGeo = new THREE.BoxGeometry(0.64, 0.028, 0.030);

  const bayConfigs: Array<{ angle: number; role: 'thermal' | 'cryo' | 'ventral' }> = [
    { angle: Math.PI / 6, role: 'thermal' },       // 30° Upper-Right
    { angle: (5 * Math.PI) / 6, role: 'cryo' },    // 150° Upper-Left
    { angle: -Math.PI / 2, role: 'ventral' },      // 270° Bottom Ventral
  ];

  // Shared cassette & subtle functional insert geometries (identical visual mass and contrast across all 3 bays)
  const coreDeckGeo = createBeveledTrapezoid(0.84, 0.72, 0.40, 0.13, 0.016, 0.016);
  const busbarGeo = createBeveledTrapezoid(0.54, 0.46, 0.06, 0.045, 0.01, 0.01);
  const endCapGeo = createBeveledHexagon(0.088, 0.052, 0.012, 0.012);
  const finGeo = createBeveledTrapezoid(0.042, 0.034, 0.34, 0.15, 0.006, 0.006);
  const cylGeo = new THREE.CylinderGeometry(0.064, 0.064, 0.52, 14);
  cylGeo.rotateZ(Math.PI / 2);
  ensureUv2(cylGeo);
  const keelGeo = createBeveledTrapezoid(0.10, 0.075, 0.36, 0.15, 0.012, 0.012);

  for (const cfg of bayConfigs) {
    const g = new THREE.Group();
    // Recessed to r = 5.10, z = -0.38 so the continuous 360° optical glass ring at z = +0.04 stands cleanly distinct
    g.position.set(Math.cos(cfg.angle) * 5.10, Math.sin(cfg.angle) * 5.10, -0.38);
    g.rotation.z = cfg.angle - Math.PI / 2; // local +Y points radially OUTWARD

    // 1. Unified Tri-Symmetric Obsidian Anodized Structural Cradle
    const cradle = new THREE.Mesh(cradleGeo, materials.anodizedBlack);
    cradle.position.z = -0.14;
    g.add(cradle);
    anodized.push(cradle);

    // 2. Unified Dark Heat-Tinted Outer Shroud tucked tightly into chassis (max r ~5.62)
    const shroud = new THREE.Mesh(shroudGeo, materials.heatTintedMetal);
    shroud.position.set(0, 0.24, 0.04);
    g.add(shroud);
    heatMetal.push(shroud);

    // 3. Matte Dark Ceramic Thermal Isolation Collar
    const barrier = new THREE.Mesh(barrierGeo, materials.darkCeramic);
    barrier.position.set(0, -0.18, 0.02);
    g.add(barrier);
    ceramic.push(barrier);

    // 4. Restrained Slim Brushed-Titanium Framing Cheeks & Top Rim Lip
    for (let side = -1; side <= 1; side += 2) {
      const cheek = new THREE.Mesh(cheekGeo, materials.brushedTitanium);
      cheek.position.set(side * 0.72, 0.13, 0.08);
      g.add(cheek);
      titanium.push(cheek);
    }
    const topLip = new THREE.Mesh(topLipGeo, materials.brushedTitanium);
    topLip.position.set(0, 0.48, 0.21);
    g.add(topLip);
    titanium.push(topLip);

    // 5. Unified Dark-Carbon Core Cassette Deck, Brushed-Titanium End Caps & Burnished Copper Busbar
    const coreDeck = new THREE.Mesh(coreDeckGeo, materials.darkCarbon);
    coreDeck.position.set(0, 0.23, 0.13);
    g.add(coreDeck);
    carbon.push(coreDeck);

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(endCapGeo, materials.brushedTitanium);
      cap.rotation.y = Math.PI / 2;
      cap.position.set(side * 0.44, 0.23, 0.15);
      g.add(cap);
      titanium.push(cap);
    }

    const busbar = new THREE.Mesh(busbarGeo, materials.copperWinding);
    busbar.position.set(0, -0.18, 0.18);
    g.add(busbar);
    copper.push(busbar);

    // 6. Recessed Controlled Reactor-Red Thermal/Energy Vent Slit (identical across all 3 bays)
    const ventSlit = new THREE.Mesh(ventSlitGeo, materials.neonTubeMat);
    ventSlit.position.set(0, -0.02, 0.20);
    g.add(ventSlit);
    neon.push(ventSlit);

    // 7. Subtle Functional Differentiation Recessed Inside the Unified Cassette Footprint
    if (cfg.role === 'thermal') {
      // 3 flush burnished copper & ceramic thermal louver ribs
      for (const f of [-1, 0, 1]) {
        const fin = new THREE.Mesh(finGeo, f === 0 ? materials.darkCeramic : materials.copperWinding);
        fin.position.set(f * 0.22, 0.24, 0.18);
        g.add(fin);
        if (f === 0) ceramic.push(fin);
        else copper.push(fin);
      }
    } else if (cfg.role === 'cryo') {
      // Twin flush horizontal micro cryo-cells + center copper coupling rib
      for (const yOff of [0.16, 0.32]) {
        const cyl = new THREE.Mesh(cylGeo, materials.darkCeramic);
        cyl.position.set(0, yOff, 0.17);
        g.add(cyl);
        ceramic.push(cyl);
      }
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(finGeo, materials.copperWinding);
        strap.position.set(side * 0.20, 0.24, 0.18);
        g.add(strap);
        copper.push(strap);
      }
    } else {
      // Centered ventral ceramic stabilizer rib + twin flanking copper damper ribs
      const keel = new THREE.Mesh(keelGeo, materials.darkCeramic);
      keel.position.set(0, 0.24, 0.18);
      g.add(keel);
      ceramic.push(keel);

      for (const side of [-1, 1]) {
        const innerVane = new THREE.Mesh(finGeo, materials.copperWinding);
        innerVane.position.set(side * 0.22, 0.24, 0.18);
        g.add(innerVane);
        copper.push(innerVane);
      }
    }

    modGroup.add(g);
  }

  outerEnvelope.add(modGroup);
  outerEnvelope.updateMatrixWorld(true);

  mergeGeometryBatch(anodized, materials.anodizedBlack, modGroup, 'arc-merged-outerMods-anodizedBlack');
  mergeGeometryBatch(titanium, materials.brushedTitanium, modGroup, 'arc-merged-outerMods-brushedTitanium');
  mergeGeometryBatch(carbon, materials.darkCarbon, modGroup, 'arc-merged-outerMods-darkCarbon');
  mergeGeometryBatch(ceramic, materials.darkCeramic, modGroup, 'arc-merged-outerMods-darkCeramic');
  mergeGeometryBatch(copper, materials.copperWinding, modGroup, 'arc-merged-outerMods-copperWinding');
  mergeGeometryBatch(heatMetal, materials.heatTintedMetal, modGroup, 'arc-merged-outerMods-heatTintedMetal');
  mergeGeometryBatch(neon, materials.neonTubeMat, modGroup, 'arc-merged-outerMods-neonTubeMat');
}
