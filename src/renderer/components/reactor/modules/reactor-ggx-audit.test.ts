import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildStudioSoftboxScene } from './reactor-environment';
import { DEFAULT_REACTOR_CAMERA } from './reactor-stage1-diagnostics';
import type { GraphicsPmremQuality } from '../../../features/settings/logic/graphics-presets';

interface ExtractedPanel {
  width: number;
  height: number;
  matrixWorld: THREE.Matrix4;
  normalWorld: THREE.Vector3;
  radianceLinear: [number, number, number];
  cornersWorld: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

const ANODIZED_ROUGHNESS = 0.38;
const ANODIZED_ALPHA = ANODIZED_ROUGHNESS * ANODIZED_ROUGHNESS; // 0.1444
const ANODIZED_METALNESS = 0.86;
const ANODIZED_ALBEDO_LINEAR: [number, number, number] = [
  0.0405 * 0.95,
  0.0405 * 0.98,
  0.0405 * 1.03,
];
const ANODIZED_F0: [number, number, number] = [
  0.04 * (1 - ANODIZED_METALNESS) + ANODIZED_ALBEDO_LINEAR[0] * ANODIZED_METALNESS,
  0.04 * (1 - ANODIZED_METALNESS) + ANODIZED_ALBEDO_LINEAR[1] * ANODIZED_METALNESS,
  0.04 * (1 - ANODIZED_METALNESS) + ANODIZED_ALBEDO_LINEAR[2] * ANODIZED_METALNESS,
];

const CAMERA_POS = new THREE.Vector3(...DEFAULT_REACTOR_CAMERA.position);
const FLAT_NORMAL = new THREE.Vector3(0, 0, 1);
const PROBES = {
  ul: new THREE.Vector3(-5, 5, 0),
  center: new THREE.Vector3(0, 0, 0),
  lr: new THREE.Vector3(5, -5, 0),
} as const;

function extractPanels(quality: GraphicsPmremQuality): { scene: THREE.Scene; panels: ExtractedPanel[] } {
  const scene = buildStudioSoftboxScene(quality);
  scene.updateMatrixWorld(true);
  const panels: ExtractedPanel[] = [];

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry as THREE.PlaneGeometry;
    const mat = obj.material as THREE.MeshBasicMaterial;
    const width = geo.parameters.width;
    const height = geo.parameters.height;
    const normalWorld = new THREE.Vector3(0, 0, 1).transformDirection(obj.matrixWorld).normalize();
    const hw = width * 0.5;
    const hh = height * 0.5;
    const cornersWorld: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
      new THREE.Vector3(-hw, -hh, 0).applyMatrix4(obj.matrixWorld),
      new THREE.Vector3(hw, -hh, 0).applyMatrix4(obj.matrixWorld),
      new THREE.Vector3(hw, hh, 0).applyMatrix4(obj.matrixWorld),
      new THREE.Vector3(-hw, hh, 0).applyMatrix4(obj.matrixWorld),
    ];
    panels.push({
      width,
      height,
      matrixWorld: obj.matrixWorld.clone(),
      normalWorld,
      radianceLinear: [mat.color.r, mat.color.g, mat.color.b],
      cornersWorld,
    });
  });

  return { scene, panels };
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}

/** Exact solid angle of a triangle seen from point P (Van Oosterom & Strackee, 1983). */
function triangleSolidAngle(p: THREE.Vector3, v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3): number {
  const a = v0.clone().sub(p).normalize();
  const b = v1.clone().sub(p).normalize();
  const c = v2.clone().sub(p).normalize();
  const crossBC = new THREE.Vector3().crossVectors(b, c);
  const num = Math.abs(a.dot(crossBC));
  const den = 1 + a.dot(b) + b.dot(c) + c.dot(a);
  return 2 * Math.atan2(num, den);
}

function exactPanelSolidAngle(p: THREE.Vector3, panel: ExtractedPanel): number {
  const [c0, c1, c2, c3] = panel.cornersWorld;
  return triangleSolidAngle(p, c0, c1, c2) + triangleSolidAngle(p, c0, c2, c3);
}

/**
 * Complete Cook-Torrance microfacet GGX specular BRDF (SOFTBOX-PANEL-ONLY SPECULAR CONTRIBUTION).
 * Explicitly excludes: PMREM background (0x030406), envMapIntensity, diffuse, direct lights,
 * hemisphere lighting, PMREM prefiltering / cubeUV sampling, ACES tone mapping, bloom/post-FX.
 */
function integrateSoftboxPanelOnlySpecular(
  probePos: THREE.Vector3,
  panels: ExtractedPanel[],
  gridM: number
): { rgb: [number, number, number]; luma: number; panelSolidAngles: number[] } {
  const V = CAMERA_POS.clone().sub(probePos).normalize();
  const NoV = FLAT_NORMAL.dot(V);
  if (NoV <= 1e-8) {
    return { rgb: [0, 0, 0], luma: 0, panelSolidAngles: panels.map(() => 0) };
  }

  const a2 = ANODIZED_ALPHA * ANODIZED_ALPHA;
  const g1V = (2 * NoV) / (NoV + Math.sqrt(a2 + (1 - a2) * NoV * NoV));
  let loR = 0;
  let loG = 0;
  let loB = 0;
  const panelSolidAngles: number[] = [];

  const localPt = new THREE.Vector3();
  const worldPt = new THREE.Vector3();
  const L = new THREE.Vector3();
  const H = new THREE.Vector3();

  for (const panel of panels) {
    const dArea = (panel.width / gridM) * (panel.height / gridM);
    let omegaSum = 0;

    for (let iy = 0; iy < gridM; iy++) {
      const yLocal = ((iy + 0.5) / gridM - 0.5) * panel.height;
      for (let ix = 0; ix < gridM; ix++) {
        const xLocal = ((ix + 0.5) / gridM - 0.5) * panel.width;
        localPt.set(xLocal, yLocal, 0);
        worldPt.copy(localPt).applyMatrix4(panel.matrixWorld);

        L.subVectors(worldPt, probePos);
        const dist2 = L.lengthSq();
        if (dist2 <= 1e-8) continue;
        L.multiplyScalar(1 / Math.sqrt(dist2));

        // Double-sided studio softbox panel
        const emitterCos = Math.abs(panel.normalWorld.dot(L));
        if (emitterCos <= 1e-8) continue;
        const dOmega = (emitterCos * dArea) / dist2;
        omegaSum += dOmega;

        const NoL = FLAT_NORMAL.dot(L);
        if (NoL <= 1e-8) continue;

        H.addVectors(V, L);
        const hLen = H.length();
        if (hLen <= 1e-8) continue;
        H.multiplyScalar(1 / hLen);

        const NoH = Math.max(0, FLAT_NORMAL.dot(H));
        const VoH = Math.max(0, V.dot(H));

        const denomD = NoH * NoH * (a2 - 1) + 1;
        const D = a2 / (Math.PI * Math.max(1e-12, denomD * denomD));
        const g1L = (2 * NoL) / (NoL + Math.sqrt(a2 + (1 - a2) * NoL * NoL));
        const G = g1V * g1L;
        const oneMinusVoH5 = Math.pow(1 - VoH, 5);
        const brdfDenom = Math.max(1e-8, 4 * NoV * NoL);
        const common = ((D * G) / brdfDenom) * NoL * dOmega;

        const fR = ANODIZED_F0[0] + (1 - ANODIZED_F0[0]) * oneMinusVoH5;
        const fG = ANODIZED_F0[1] + (1 - ANODIZED_F0[1]) * oneMinusVoH5;
        const fB = ANODIZED_F0[2] + (1 - ANODIZED_F0[2]) * oneMinusVoH5;

        loR += panel.radianceLinear[0] * fR * common;
        loG += panel.radianceLinear[1] * fG * common;
        loB += panel.radianceLinear[2] * fB * common;
      }
    }
    panelSolidAngles.push(omegaSum);
  }

  const luma = 0.2126 * loR + 0.7152 * loG + 0.0722 * loB;
  return { rgb: [loR, loG, loB], luma, panelSolidAngles };
}

describe('ARC-055 — Cook-Torrance GGX Softbox-Panel-Only Specular Audit', () => {
  it('1. verifies PMREM backdrop 0x030406 and active panel configuration across Eco, Balanced, High', () => {
    const expectedCounts: Record<GraphicsPmremQuality, number> = {
      eco: 6,      // #1, #2, #3, #4, #5a, #5b
      standard: 8, // + #6, #7
      high: 9,     // + #8
    };

    for (const quality of ['eco', 'standard', 'high'] as GraphicsPmremQuality[]) {
      const { scene, panels } = extractPanels(quality);
      expect((scene.background as THREE.Color).getHex()).toBe(0x030406);
      expect(panels.length).toBe(expectedCounts[quality]);

      // Verify panel #5a (index 4) and #5b (index 5) approved dimensions and positions
      const p5a = panels[4];
      const p5b = panels[5];
      expect(p5a.width).toBeCloseTo(7.6, 4);
      expect(p5a.height).toBeCloseTo(3.8, 4);
      expect(p5b.width).toBeCloseTo(5.4, 4);
      expect(p5b.height).toBeCloseTo(2.0, 4);

      // Verify #5a and #5b do not overlap in world-space angular coverage from origin
      let minAngleDeg = Infinity;
      for (const a of p5a.cornersWorld) {
        for (const b of p5b.cornersWorld) {
          const deg = THREE.MathUtils.radToDeg(a.clone().normalize().angleTo(b.clone().normalize()));
          if (deg < minAngleDeg) minAngleDeg = deg;
        }
      }
      expect(minAngleDeg).toBeGreaterThan(25);
      disposeScene(scene);
    }
  });

  it('2. validates softbox-panel-only Cook-Torrance GGX convergence (32x32 vs 64x64) and UL > Center > LR asymmetry', () => {
    for (const quality of ['eco', 'standard', 'high'] as GraphicsPmremQuality[]) {
      const { scene, panels } = extractPanels(quality);

      const res32 = {
        ul: integrateSoftboxPanelOnlySpecular(PROBES.ul, panels, 32),
        center: integrateSoftboxPanelOnlySpecular(PROBES.center, panels, 32),
        lr: integrateSoftboxPanelOnlySpecular(PROBES.lr, panels, 32),
      };
      const res64 = {
        ul: integrateSoftboxPanelOnlySpecular(PROBES.ul, panels, 64),
        center: integrateSoftboxPanelOnlySpecular(PROBES.center, panels, 64),
        lr: integrateSoftboxPanelOnlySpecular(PROBES.lr, panels, 64),
      };

      // Solid-angle quadrature error vs exact analytical planar solid angle (≤ 0.05%)
      let maxSolidAngleErrPct = 0;
      for (const [probeKey, probePos] of Object.entries(PROBES) as Array<[keyof typeof PROBES, THREE.Vector3]>) {
        for (let i = 0; i < panels.length; i++) {
          const exact = exactPanelSolidAngle(probePos, panels[i]);
          if (exact <= 1e-8) continue;
          const err32 = (Math.abs(res32[probeKey].panelSolidAngles[i] - exact) / exact) * 100;
          const err64 = (Math.abs(res64[probeKey].panelSolidAngles[i] - exact) / exact) * 100;
          maxSolidAngleErrPct = Math.max(maxSolidAngleErrPct, err32, err64);
        }
      }
      expect(maxSolidAngleErrPct, `${quality} max solid-angle error %`).toBeLessThanOrEqual(0.05);

      // Relative specular luminance change between 32x32 and 64x64 (≤ 0.05%)
      let maxLumaDeltaPct = 0;
      for (const k of ['ul', 'center', 'lr'] as const) {
        const l32 = res32[k].luma;
        const l64 = res64[k].luma;
        expect(l64).toBeGreaterThan(0);
        const relPct = (Math.abs(l64 - l32) / l64) * 100;
        maxLumaDeltaPct = Math.max(maxLumaDeltaPct, relPct);
      }
      expect(maxLumaDeltaPct, `${quality} max luminance convergence %`).toBeLessThanOrEqual(0.05);

      // UL/LR ratio convergence (≤ 0.005) and monotonic asymmetric gradient (UL > Center > LR, ratio > 2.5)
      const ratio32 = res32.ul.luma / res32.lr.luma;
      const ratio64 = res64.ul.luma / res64.lr.luma;
      expect(Math.abs(ratio64 - ratio32), `${quality} UL/LR ratio convergence`).toBeLessThanOrEqual(0.005);
      expect(res64.ul.luma).toBeGreaterThan(res64.center.luma);
      expect(res64.center.luma).toBeGreaterThan(res64.lr.luma);
      expect(ratio64, `${quality} UL/LR ratio`).toBeGreaterThan(2.5);

      disposeScene(scene);
    }
  });
});
