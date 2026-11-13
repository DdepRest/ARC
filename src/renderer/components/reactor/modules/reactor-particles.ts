import * as THREE from "three";
import type { ReactorMaterials } from "./reactor-materials";

export interface ReactorParticles {
  containmentLattice: THREE.LineSegments;
  dataNodes: THREE.Points;
  sparksSystem: THREE.Points;
  dustParticles: THREE.Points;
  hudOrbitals: THREE.Group;
  hudLabels: THREE.Sprite[];
  dispose: () => void;
}

export function createHUDLabel(text: string, position: THREE.Vector3): THREE.Sprite | undefined {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = 256;
  canvas.height = 64;

  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, 256, 64);

  ctx.font =
    text.length === 1
      ? 'bold 48px "Inter", sans-serif'
      : 'bold 24px "Inter", sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = text.length === 1 ? "center" : "left";
  ctx.fillText(text, text.length === 1 ? 128 : 0, 45);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(4, 1, 1);
  return sprite;
}

function createSoftMoteTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    // Neutral white radial profile so vertexColors & theme accent tint 100% accurately across all 5 themes
    grad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.16, "rgba(255, 255, 255, 0.92)");
    grad.addColorStop(0.36, "rgba(255, 255, 255, 0.46)");
    grad.addColorStop(0.64, "rgba(255, 255, 255, 0.12)");
    grad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBokehOrbTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    // Neutral white soft bokeh profile so theme color controls hue without red contamination
    grad.addColorStop(0.0, "rgba(255, 255, 255, 0.78)");
    grad.addColorStop(0.24, "rgba(255, 255, 255, 0.44)");
    grad.addColorStop(0.52, "rgba(255, 255, 255, 0.18)");
    grad.addColorStop(0.78, "rgba(255, 255, 255, 0.06)");
    grad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates evenly distributed coordinates across the exact 12-deg camera frustum
 * (x in [-halfW..+halfW], y in [-halfH..+halfH]) with clearance only for the central A R C logo.
 */
function sampleFullScreenCell(
  index: number,
  cols: number,
  rows: number,
  halfW: number,
  halfH: number,
): [number, number] {
  const col = index % cols;
  const row = Math.floor(index / cols) % rows;
  const cellW = (halfW * 2) / cols;
  const cellH = (halfH * 2) / rows;
  let x = -halfW + (col + 0.12 + Math.random() * 0.76) * cellW;
  let y = -halfH + (row + 0.12 + Math.random() * 0.76) * cellH;

  // Keep only the central A R C letters (r < 1.38) clear
  if (x * x + y * y < 1.92) {
    const ang = Math.atan2(y, x);
    const pushR = 1.60 + Math.random() * 0.75;
    x = Math.cos(ang) * pushR;
    y = Math.sin(ang) * pushR;
  }
  return [x, y];
}

export function createReactorParticles(
  scene: THREE.Scene,
  reactorGroup: THREE.Group,
  _materials: ReactorMaterials,
  _graphicsQuality: string,
): ReactorParticles {
  const hudLabels: THREE.Sprite[] = [];
  const softMoteTex = createSoftMoteTexture(128);
  const bokehOrbTex = createBokehOrbTexture(128);

  // Containment Lattice (kept hidden for clean deep-black space background)
  const latticeGeo = new THREE.IcosahedronGeometry(40, 1);
  const latticeWire = new THREE.WireframeGeometry(latticeGeo);
  const latticeMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
  });
  const containmentLattice = new THREE.LineSegments(latticeWire, latticeMat);
  containmentLattice.visible = false;
  scene.add(containmentLattice);

  // Data Nodes (kept hidden)
  const nodesGeo = new THREE.BufferGeometry();
  const nodeCount = 30;
  const nodePos = new Float32Array(nodeCount * 3);
  const nodeColors = new Float32Array(nodeCount * 3);
  nodesGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
  nodesGeo.setAttribute("color", new THREE.BufferAttribute(nodeColors, 3));
  const nodesMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.0,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  const dataNodes = new THREE.Points(nodesGeo, nodesMat);
  dataNodes.visible = false;
  scene.add(dataNodes);

  // Reversible Ambient Deep-Space Nebula Veil (kept hidden by default to preserve crisp deep-black contrast and save fullscreen fragment fillrate)
  const nebulaUniforms = {
    uTime: { value: 0.0 },
    uColor: { value: new THREE.Color(_materials.currentColor.getHex()) },
    uIntensity: { value: 1.0 },
  };
  const nebulaGeo = new THREE.PlaneGeometry(34, 21);
  const nebulaMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const nebulaMesh = new THREE.Mesh(nebulaGeo, nebulaMat);
  nebulaMesh.position.set(0, 0, -2.5);
  nebulaMesh.renderOrder = -10;
  nebulaMesh.name = "arc-space-nebula";
  nebulaMesh.visible = false;
  scene.add(nebulaMesh);

  // Tier 2: Sparks System — 60 fine smoldering HDR embers spread evenly across the entire 16:9 screen [-14.5..+14.5] x [-8.3..+8.3]
  const sparkCount = 60;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkColors = new Float32Array(sparkCount * 3);
  const sparkVel = new Float32Array(sparkCount * 3);
  const sparkPhases = new Float32Array(sparkCount);
  const sparkFreqs = new Float32Array(sparkCount);

  const initColor = _materials.currentColor;

  for (let i = 0; i < sparkCount; i++) {
    const [x, y] = sampleFullScreenCell(i, 10, 6, 14.5, 8.3);
    sparkPos[i * 3] = x;
    sparkPos[i * 3 + 1] = y;
    sparkPos[i * 3 + 2] = -3.4 + Math.random() * 4.2;

    sparkVel[i * 3] = (Math.random() - 0.5) * 0.24;
    sparkVel[i * 3 + 1] = 0.16 + Math.random() * 0.28;
    sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    sparkPhases[i] = Math.random() * Math.PI * 2;
    sparkFreqs[i] = 0.55 + Math.random() * 0.75;

    sparkColors[i * 3] = initColor.r;
    sparkColors[i * 3 + 1] = initColor.g;
    sparkColors[i * 3 + 2] = initColor.b;
  }
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.44,
    map: softMoteTex,
    transparent: true,
    opacity: 0.90,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sparksSystem = new THREE.Points(sparkGeo, sparkMat);
  sparksSystem.frustumCulled = false;

  // Tier 1: Foreground Soft Bokeh System — 24 delicate micro-bokeh orbs distributed across the 6x4 widescreen grid
  const bokehCount = 24;
  const bokehGeo = new THREE.BufferGeometry();
  const bokehPos = new Float32Array(bokehCount * 3);
  const bokehColors = new Float32Array(bokehCount * 3);
  const bokehVel = new Float32Array(bokehCount * 3);
  const bokehPhases = new Float32Array(bokehCount);
  const bokehFreqs = new Float32Array(bokehCount);

  for (let i = 0; i < bokehCount; i++) {
    const [x, y] = sampleFullScreenCell(i, 6, 4, 14.3, 8.2);
    bokehPos[i * 3] = x;
    bokehPos[i * 3 + 1] = y;
    bokehPos[i * 3 + 2] = 1.2 + Math.random() * 2.5;

    bokehVel[i * 3] = (Math.random() - 0.5) * 0.16;
    bokehVel[i * 3 + 1] = 0.09 + Math.random() * 0.15;
    bokehVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    bokehPhases[i] = Math.random() * Math.PI * 2;
    bokehFreqs[i] = 0.32 + Math.random() * 0.42;

    bokehColors[i * 3] = initColor.r;
    bokehColors[i * 3 + 1] = initColor.g;
    bokehColors[i * 3 + 2] = initColor.b;
  }
  bokehGeo.setAttribute("position", new THREE.BufferAttribute(bokehPos, 3));
  bokehGeo.setAttribute("color", new THREE.BufferAttribute(bokehColors, 3));
  const bokehMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.78,
    map: bokehOrbTex,
    transparent: true,
    opacity: 0.46,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const bokehSystem = new THREE.Points(bokehGeo, bokehMat);
  bokehSystem.name = "arc-bokeh-orbs";
  bokehSystem.frustumCulled = false;
  bokehSystem.userData = {
    velocities: bokehVel,
    phases: bokehPhases,
    freqs: bokehFreqs,
  };
  sparksSystem.add(bokehSystem);

  sparksSystem.userData = {
    velocities: sparkVel,
    phases: sparkPhases,
    freqs: sparkFreqs,
    bokehSystem,
    nebulaUniforms,
    nebulaMesh,
  };
  scene.add(sparksSystem);

  // Tier 3: Dust Particles — 120 fine cosmic micro-dust motes spread evenly across the entire 15x8 widescreen [-14.7..+14.7] x [-8.4..+8.4]
  const dustCount = 120;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const dustPhases = new Float32Array(dustCount);
  const dustFreqs = new Float32Array(dustCount);

  for (let i = 0; i < dustCount; i++) {
    const [x, y] = sampleFullScreenCell(i, 15, 8, 14.7, 8.4);
    dustPos[i * 3] = x;
    dustPos[i * 3 + 1] = y;
    dustPos[i * 3 + 2] = -5.2 + Math.random() * 4.4;
    dustPhases[i] = Math.random() * Math.PI * 2;
    dustFreqs[i] = 0.40 + Math.random() * 0.55;

    dustColors[i * 3] = initColor.r;
    dustColors[i * 3 + 1] = initColor.g;
    dustColors[i * 3 + 2] = initColor.b;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.26,
    map: softMoteTex,
    transparent: true,
    opacity: 0.74,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dustParticles = new THREE.Points(dustGeo, dustMat);
  dustParticles.frustumCulled = false;
  dustParticles.userData = {
    initialPositions: new Float32Array(dustPos),
    phases: dustPhases,
    freqs: dustFreqs,
  };
  scene.add(dustParticles);

  // HUD Orbitals - Clean empty container preserved for system interface
  const hudOrbitals = new THREE.Group();
  hudOrbitals.name = "arc-hud-orbitals";
  reactorGroup.add(hudOrbitals);

  const dispose = () => {
    softMoteTex.dispose();
    bokehOrbTex.dispose();
    nebulaGeo.dispose();
    nebulaMat.dispose();
    bokehGeo.dispose();
    bokehMat.dispose();
    containmentLattice.geometry.dispose();
    if (Array.isArray(containmentLattice.material)) {
      containmentLattice.material.forEach((m) => m.dispose());
    } else {
      containmentLattice.material.dispose();
    }

    dataNodes.geometry.dispose();
    if (Array.isArray(dataNodes.material)) {
      dataNodes.material.forEach((m) => m.dispose());
    } else {
      dataNodes.material.dispose();
    }

    sparksSystem.geometry.dispose();
    if (Array.isArray(sparksSystem.material)) {
      sparksSystem.material.forEach((m) => m.dispose());
    } else {
      sparksSystem.material.dispose();
    }

    dustParticles.geometry.dispose();
    if (Array.isArray(dustParticles.material)) {
      dustParticles.material.forEach((m) => m.dispose());
    } else {
      dustParticles.material.dispose();
    }

    hudLabels.forEach((lbl) => {
      lbl.material.map?.dispose();
      lbl.material.dispose();
    });
  };

  return {
    containmentLattice,
    dataNodes,
    sparksSystem,
    dustParticles,
    hudOrbitals,
    hudLabels,
    dispose,
  };
}

