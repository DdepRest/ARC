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
 * Builds the functional asymmetric outer industrial modules that break radial disc symmetry
 * and anchor the 3 radial conduit terminals (30°, 150°, 270°) into real structural substations:
 * 1. Upper-Right (30°): Heavy Thermal Condenser & Copper Radiator Bank + coolant manifolds
 * 2. Upper-Left (150°): Twin-Cylinder HV Cryo-Capacitor Pod + angled armor cowling
 * 3. Bottom Ventral (270°): Ventral Stabilizer Spine & Twin Exhaust Deflector Keel
 * 4. Asymmetric Nacelle Flank Lugs (118° & 346°): Pressure manifold & auxiliary intake pods
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

  // =========================================================================
  // 1. UPPER-RIGHT (30°): Heavy Thermal Condenser & Copper Radiator Bank
  // =========================================================================
  {
    const a = Math.PI / 6; // 30°
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * 5.28, Math.sin(a) * 5.28, -0.34);
    g.rotation.z = a - Math.PI / 2; // local +Y points radially OUTWARD

    // Heavy stepped base cradle bolted across the open bay
    const cradle = new THREE.Mesh(
      createBeveledPolygon(
        [
          [-1.55, -0.62],
          [1.55, -0.62],
          [1.32, 0.72],
          [0.72, 1.02],
          [-0.95, 0.94],
          [-1.42, 0.42],
        ],
        0.72,
        0.07,
        0.07
      ),
      materials.anodizedBlack
    );
    cradle.position.z = -0.18;
    g.add(cradle);
    anodized.push(cradle);

    // Protruding heat-tinted radiator shroud reaching outward to r ~6.32
    const shroud = new THREE.Mesh(
      createBeveledTrapezoid(2.25, 1.72, 1.05, 0.56, 0.055, 0.055),
      materials.heatTintedMetal
    );
    shroud.position.set(0.08, 0.42, 0.14);
    g.add(shroud);
    heatMetal.push(shroud);

    // Ceramic thermal barrier collar separating shroud from main frame
    const barrier = new THREE.Mesh(
      createBeveledTrapezoid(2.42, 2.28, 0.24, 0.46, 0.025, 0.025),
      materials.darkCeramic
    );
    barrier.position.set(0.0, -0.22, 0.12);
    g.add(barrier);
    ceramic.push(barrier);

    // Brushed titanium armored top hood & side clamp ribs
    const hood = new THREE.Mesh(
      createBeveledTrapezoid(1.68, 1.18, 0.46, 0.16, 0.03, 0.03),
      materials.brushedTitanium
    );
    hood.position.set(0.08, 0.72, 0.44);
    g.add(hood);
    titanium.push(hood);

    for (let side = -1; side <= 1; side += 2) {
      const cheek = new THREE.Mesh(
        createBeveledTrapezoid(0.24, 0.18, 1.24, 0.52, 0.025, 0.025),
        materials.brushedTitanium
      );
      cheek.position.set(side * 1.18, 0.22, 0.18);
      g.add(cheek);
      titanium.push(cheek);
    }

    // 7 physical stacked copper alloy radiator fins inside open louver bay
    const finGeo = createBeveledTrapezoid(0.065, 0.055, 0.84, 0.44, 0.008, 0.008);
    for (let f = -3; f <= 3; f++) {
      const fin = new THREE.Mesh(finGeo, materials.copperWinding);
      fin.position.set(0.08 + f * 0.22, 0.34, 0.34);
      g.add(fin);
      copper.push(fin);
    }

    // Subtle recessed thermal vent glow strip
    const ventStrip = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.055, 0.05), materials.neonTubeMat);
    ventStrip.position.set(0.08, 0.02, 0.46);
    g.add(ventStrip);
    neon.push(ventStrip);

    // Twin armored coolant pipes plumbing condenser laterally into adjacent nacelles
    for (let side = -1; side <= 1; side += 2) {
      const pipeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.15, -0.05, 0.08),
        new THREE.Vector3(side * 1.72, -0.36, -0.18),
        new THREE.Vector3(side * 2.15, -0.92, -0.32),
      ]);
      const pipe = new THREE.Mesh(
        new THREE.TubeGeometry(pipeCurve, 14, 0.075, 10, false),
        materials.ringFrameMat
      );
      g.add(pipe);
      titanium.push(pipe);
    }

    modGroup.add(g);
  }

  // =========================================================================
  // 2. UPPER-LEFT (150°): Twin-Cylinder HV Cryo-Capacitor & Telemetry Pod
  // =========================================================================
  {
    const a = (5 * Math.PI) / 6; // 150°
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * 5.18, Math.sin(a) * 5.18, -0.26);
    g.rotation.z = a - Math.PI / 2; // local +Y outward

    // Angled armored mounting deck
    const deck = new THREE.Mesh(
      createBeveledPolygon(
        [
          [-1.36, -0.58],
          [1.36, -0.58],
          [1.18, 0.62],
          [-0.65, 0.88],
          [-1.28, 0.48],
        ],
        0.58,
        0.06,
        0.06
      ),
      materials.anodizedBlack
    );
    deck.position.z = -0.22;
    g.add(deck);
    anodized.push(deck);

    // Twin heavy carbon-wrapped HV pressure cylinders mounted parallel to tangent
    const cylGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.72, 20);
    cylGeo.rotateZ(Math.PI / 2);
    ensureUv2(cylGeo);
    const bandGeo = new THREE.TorusGeometry(0.295, 0.036, 10, 22);
    bandGeo.rotateY(Math.PI / 2);
    ensureUv2(bandGeo);
    const endCapGeo = createBeveledHexagon(0.28, 0.14, 0.025, 0.025);

    for (let row = 0; row < 2; row++) {
      const yOff = row === 0 ? 0.08 : 0.68;
      const zOff = row === 0 ? 0.22 : 0.02;
      const cyl = new THREE.Mesh(cylGeo, materials.darkCarbon);
      cyl.position.set(-0.08, yOff, zOff);
      g.add(cyl);
      carbon.push(cyl);

      for (const xBand of [-0.54, 0.0, 0.44]) {
        const band = new THREE.Mesh(bandGeo, row === 0 ? materials.darkCeramic : materials.brushedTitanium);
        band.position.set(-0.08 + xBand, yOff, zOff);
        g.add(band);
        if (row === 0) ceramic.push(band);
        else titanium.push(band);
      }

      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(endCapGeo, materials.brushedTitanium);
        cap.rotation.y = Math.PI / 2;
        cap.position.set(-0.08 + side * 0.88, yOff, zOff);
        g.add(cap);
        titanium.push(cap);
      }
    }

    // Asymmetric armored blast deflector shield on left side of pod
    const shield = new THREE.Mesh(
      createBeveledTrapezoid(0.58, 0.42, 1.32, 0.22, 0.035, 0.035),
      materials.brushedTitanium
    );
    shield.position.set(-0.98, 0.34, 0.34);
    shield.rotation.y = 0.22;
    g.add(shield);
    titanium.push(shield);

    // Copper busbar rail linking cylinders to the 150° terminal
    const busbar = new THREE.Mesh(
      createBeveledTrapezoid(0.95, 0.82, 0.12, 0.09, 0.015, 0.015),
      materials.copperWinding
    );
    busbar.position.set(0.18, -0.34, 0.36);
    g.add(busbar);
    copper.push(busbar);

    modGroup.add(g);
  }

  // =========================================================================
  // 3. BOTTOM VENTRAL (270°): Heavy Stabilizer Spine & Twin Exhaust Deflector Keel
  // =========================================================================
  {
    const a = -Math.PI / 2; // 270°
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * 5.22, Math.sin(a) * 5.22, -0.38);
    g.rotation.z = a - Math.PI / 2; // local +Y points straight DOWN (outward)

    // Stepped ventral spine chassis
    const spine = new THREE.Mesh(
      createBeveledPolygon(
        [
          [-1.42, -0.58],
          [1.42, -0.58],
          [1.12, 0.56],
          [0.52, 1.04],
          [-0.52, 1.04],
          [-1.12, 0.56],
        ],
        0.84,
        0.075,
        0.075
      ),
      materials.anodizedBlack
    );
    spine.position.z = -0.14;
    g.add(spine);
    anodized.push(spine);

    // Central keel ridge (brushed titanium)
    const keel = new THREE.Mesh(
      createBeveledTrapezoid(0.46, 0.28, 1.48, 0.36, 0.04, 0.04),
      materials.brushedTitanium
    );
    keel.position.set(0, 0.28, 0.36);
    g.add(keel);
    titanium.push(keel);

    // Twin angled heat-tinted exhaust deflector chutes flanking the keel
    for (let side = -1; side <= 1; side += 2) {
      const chute = new THREE.Mesh(
        createBeveledTrapezoid(0.56, 0.44, 0.86, 0.48, 0.04, 0.04),
        materials.heatTintedMetal
      );
      chute.position.set(side * 0.72, 0.22, 0.18);
      chute.rotation.z = -side * 0.14;
      g.add(chute);
      heatMetal.push(chute);

      const coreGlow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.14), materials.neonTubeMat);
      coreGlow.position.set(side * 0.72, 0.24, 0.42);
      coreGlow.rotation.z = -side * 0.14;
      g.add(coreGlow);
      neon.push(coreGlow);

      const ceramicPad = new THREE.Mesh(
        createBeveledTrapezoid(0.62, 0.54, 0.22, 0.32, 0.02, 0.02),
        materials.darkCeramic
      );
      ceramicPad.position.set(side * 0.72, -0.32, 0.26);
      g.add(ceramicPad);
      ceramic.push(ceramicPad);
    }

    modGroup.add(g);
  }

  // =========================================================================
  // 4. ASYMMETRIC NACELLE FLANK LUGS (118° & 346°)
  // =========================================================================
  const lugs: Array<{ angle: number; radius: number; width: number }> = [
    { angle: (118 * Math.PI) / 180, radius: 5.88, width: 0.92 },
    { angle: (346 * Math.PI) / 180, radius: 5.86, width: 1.08 },
  ];
  for (const lug of lugs) {
    const lg = new THREE.Group();
    lg.position.set(Math.cos(lug.angle) * lug.radius, Math.sin(lug.angle) * lug.radius, -0.22);
    lg.rotation.z = lug.angle - Math.PI / 2;

    const body = new THREE.Mesh(
      createBeveledTrapezoid(lug.width, lug.width * 0.74, 0.56, 0.52, 0.045, 0.045),
      materials.anodizedBlack
    );
    lg.add(body);
    anodized.push(body);

    const cap = new THREE.Mesh(
      createBeveledTrapezoid(lug.width * 0.68, lug.width * 0.52, 0.34, 0.16, 0.025, 0.025),
      materials.darkCarbon
    );
    cap.position.set(0, 0.08, 0.30);
    lg.add(cap);
    carbon.push(cap);

    const trim = new THREE.Mesh(
      createBeveledTrapezoid(lug.width * 0.36, lug.width * 0.28, 0.44, 0.12, 0.018, 0.018),
      materials.copperWinding
    );
    trim.position.set(0, 0.12, 0.38);
    lg.add(trim);
    copper.push(trim);

    modGroup.add(lg);
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
