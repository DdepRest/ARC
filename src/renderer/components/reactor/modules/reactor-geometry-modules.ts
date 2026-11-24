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

  // Shared tri-symmetric compact structural cradle & shroud geometries (25-30% leaner)
  const cradleGeo = createBeveledPolygon(
    [
      [-1.08, -0.44],
      [1.08, -0.44],
      [0.92, 0.42],
      [0.52, 0.62],
      [-0.52, 0.62],
      [-0.92, 0.42],
    ],
    0.46,
    0.045,
    0.045
  );
  const shroudGeo = createBeveledTrapezoid(1.56, 1.18, 0.64, 0.34, 0.035, 0.035);
  const barrierGeo = createBeveledTrapezoid(1.70, 1.58, 0.16, 0.30, 0.02, 0.02);
  const cheekGeo = createBeveledTrapezoid(0.14, 0.10, 0.86, 0.30, 0.018, 0.018);
  const topLipGeo = createBeveledTrapezoid(1.12, 0.84, 0.22, 0.09, 0.018, 0.018);
  const ventSlitGeo = new THREE.BoxGeometry(0.96, 0.042, 0.04);

  const bayConfigs: Array<{ angle: number; role: 'thermal' | 'cryo' | 'ventral' }> = [
    { angle: Math.PI / 6, role: 'thermal' },       // 30° Upper-Right
    { angle: (5 * Math.PI) / 6, role: 'cryo' },    // 150° Upper-Left
    { angle: -Math.PI / 2, role: 'ventral' },      // 270° Bottom Ventral
  ];

  // Secondary micro-module geometries
  const finGeo = createBeveledTrapezoid(0.048, 0.04, 0.50, 0.24, 0.006, 0.006);
  const cylGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.12, 18);
  cylGeo.rotateZ(Math.PI / 2);
  ensureUv2(cylGeo);
  const bandGeo = new THREE.TorusGeometry(0.15, 0.022, 8, 18);
  bandGeo.rotateY(Math.PI / 2);
  ensureUv2(bandGeo);
  const endCapGeo = createBeveledHexagon(0.14, 0.08, 0.016, 0.016);
  const keelGeo = createBeveledTrapezoid(0.24, 0.14, 0.82, 0.20, 0.025, 0.025);
  const exhaustGlowGeo = new THREE.BoxGeometry(0.16, 0.28, 0.08);

  for (const cfg of bayConfigs) {
    const g = new THREE.Group();
    // Recessed to z = -0.34 so the continuous 360° optical glass ring at z = +0.04 passes cleanly in front
    g.position.set(Math.cos(cfg.angle) * 5.06, Math.sin(cfg.angle) * 5.06, -0.34);
    g.rotation.z = cfg.angle - Math.PI / 2; // local +Y points radially OUTWARD

    // 1. Unified Tri-Symmetric Obsidian Anodized Structural Cradle
    const cradle = new THREE.Mesh(cradleGeo, materials.anodizedBlack);
    cradle.position.z = -0.14;
    g.add(cradle);
    anodized.push(cradle);

    // 2. Unified Dark Heat-Tinted Outer Shroud tucked tightly into chassis (max r ~5.64)
    const shroud = new THREE.Mesh(shroudGeo, materials.heatTintedMetal);
    shroud.position.set(0, 0.26, 0.04);
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
      cheek.position.set(side * 0.84, 0.14, 0.08);
      g.add(cheek);
      titanium.push(cheek);
    }
    const topLip = new THREE.Mesh(topLipGeo, materials.brushedTitanium);
    topLip.position.set(0, 0.50, 0.22);
    g.add(topLip);
    titanium.push(topLip);

    // 5. Recessed Controlled Reactor-Red Thermal/Energy Vent Slit
    const ventSlit = new THREE.Mesh(ventSlitGeo, materials.neonTubeMat);
    ventSlit.position.set(0, -0.02, 0.24);
    g.add(ventSlit);
    neon.push(ventSlit);

    // 6. Subtle Lateral Coolant/Conduit Pipes tying substation cleanly into flanking nacelles
    for (let side = -1; side <= 1; side += 2) {
      const pipeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.82, -0.06, -0.02),
        new THREE.Vector3(side * 1.28, -0.24, -0.16),
        new THREE.Vector3(side * 1.66, -0.60, -0.24),
      ]);
      const pipe = new THREE.Mesh(
        new THREE.TubeGeometry(pipeCurve, 12, 0.046, 8, false),
        materials.ringFrameMat
      );
      g.add(pipe);
      anodized.push(pipe);
    }

    // 7. Restrained, Purposeful Secondary Engineering Detail inside the unified footprint
    if (cfg.role === 'thermal') {
      // 5 flush dark burnished copper thermal louver fins inside the bay cassette
      for (let f = -2; f <= 2; f++) {
        const fin = new THREE.Mesh(finGeo, materials.copperWinding);
        fin.position.set(f * 0.22, 0.24, 0.20);
        g.add(fin);
        copper.push(fin);
      }
    } else if (cfg.role === 'cryo') {
      // Flush compact twin carbon-wrapped micro cryo-capacitors nestled inside bay shroud
      for (let row = 0; row < 2; row++) {
        const yOff = row === 0 ? 0.10 : 0.40;
        const zOff = row === 0 ? 0.20 : 0.14;
        const cyl = new THREE.Mesh(cylGeo, materials.darkCarbon);
        cyl.position.set(0, yOff, zOff);
        g.add(cyl);
        carbon.push(cyl);

        for (const xBand of [-0.34, 0.0, 0.34]) {
          const band = new THREE.Mesh(bandGeo, row === 0 ? materials.darkCeramic : materials.brushedTitanium);
          band.position.set(xBand, yOff, zOff);
          g.add(band);
          if (row === 0) ceramic.push(band);
          else titanium.push(band);
        }

        for (const side of [-1, 1]) {
          const cap = new THREE.Mesh(endCapGeo, materials.brushedTitanium);
          cap.rotation.y = Math.PI / 2;
          cap.position.set(side * 0.58, yOff, zOff);
          g.add(cap);
          titanium.push(cap);
        }
      }
      const busbar = new THREE.Mesh(
        createBeveledTrapezoid(0.68, 0.58, 0.08, 0.06, 0.01, 0.01),
        materials.copperWinding
      );
      busbar.position.set(0, -0.22, 0.22);
      g.add(busbar);
      copper.push(busbar);
    } else {
      // Sleek centered ventral stabilizer fin + twin subtle exhaust core slits
      const keel = new THREE.Mesh(keelGeo, materials.darkCarbon);
      keel.position.set(0, 0.22, 0.22);
      g.add(keel);
      carbon.push(keel);

      for (let side = -1; side <= 1; side += 2) {
        const glow = new THREE.Mesh(exhaustGlowGeo, materials.neonTubeMat);
        glow.position.set(side * 0.42, 0.20, 0.23);
        glow.rotation.z = -side * 0.12;
        g.add(glow);
        neon.push(glow);
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
