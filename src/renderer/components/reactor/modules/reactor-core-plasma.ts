import * as THREE from 'three';
import {
  createCoreThermalTexture,
  createHotCoreTexture,
  createOuterEnvelopeTexture,
} from '../reactorTextures';
import type { GraphicsConfig } from '../../../features/settings/logic/graphics-presets';
import {
  CORE_PLASMA_SHADER_CONFIG,
  installEcoCoreFallback,
  installProceduralCoreShaders,
  type CorePlasmaMaterialTargets,
  type CorePlasmaShaderUniforms,
} from './reactor-core-plasma-shaders';

export type CorePlasmaShaderMode = 'eco' | 'balanced' | 'cinematic';

export type CorePlasmaMaterialSet = CorePlasmaMaterialTargets;

export interface CorePlasmaController {
  thermalMap: THREE.CanvasTexture;
  hotCoreMap: THREE.CanvasTexture;
  outerEnvelopeMap: THREE.CanvasTexture;
  getMode: () => CorePlasmaShaderMode;
  applyGraphicsConfig: (
    config: GraphicsConfig,
    maxAniso: number,
    minFilter: THREE.MinificationTextureFilter
  ) => void;
}

/**
 * Resolves the active central plasma shader tier from GraphicsConfig.
 * Eco (glslPlasmaShader === false) strictly uses static thermal texture fallback without custom GLSL hooks.
 */
export function resolveCorePlasmaMode(config?: Partial<GraphicsConfig> | null): CorePlasmaShaderMode {
  if (!config || config.glslPlasmaShader === false) {
    return 'eco';
  }
  if (config.dynamicPointLights === 'full' || config.pmremQuality === 'high') {
    return 'cinematic';
  }
  return 'balanced';
}

/**
 * Constructs the four independent central plasma layer materials owned by ReactorMaterials:
 *  - singularityCoreEmissiveMat: main triangular plasma volume (NormalBlending, opacity 0.96)
 *  - singularityPointMat: compact white-hot singularity center (r = 0.145, AdditiveBlending)
 *  - plasmaOuterEnvelopeMat: dedicated rear deep-crimson envelope (AdditiveBlending, independent)
 *  - plasmaVortexMat: dedicated front containment filament field (AdditiveBlending, independent)
 */
export function createCorePlasmaMaterials(
  initialColorHex: number,
  plasmaEnergyMap: THREE.CanvasTexture
): CorePlasmaMaterialSet {
  const singularityCoreEmissiveMat = new THREE.MeshStandardMaterial({
    color: 0x2a080c,
    map: plasmaEnergyMap,
    emissive: initialColorHex,
    emissiveIntensity: 0.0,
    roughness: 0.28,
    metalness: 0.25,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });

  // White-Hot Compact Plasma Singularity Heart (transparent: true so center raycast hits triangularCoreMesh)
  const singularityPointMat = new THREE.MeshBasicMaterial({
    color: 0xfff3f0,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Dedicated Rear Outer Energy Envelope (renderOrder = 1, independent from front containment field)
  const plasmaOuterEnvelopeMat = new THREE.MeshStandardMaterial({
    color: initialColorHex,
    map: plasmaEnergyMap,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.14,
    metalness: 0.20,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  // Dedicated Front Containment Field (renderOrder = 4, crisp magnetic filament arcs)
  const plasmaVortexMat = new THREE.MeshStandardMaterial({
    color: initialColorHex,
    map: plasmaEnergyMap,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.10,
    metalness: 0.80,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  return {
    singularityCoreEmissiveMat,
    singularityPointMat,
    plasmaOuterEnvelopeMat,
    plasmaVortexMat,
  };
}

/**
 * Projects centered triangular plasma UVs onto extruded core geometries without touching
 * global box-projected PBR UVs. Maps geometric center (0, 0) to exact UV (0.5, 0.5) on
 * front/back faces and smoothly maps beveled sidewalls into the perimeter band without stretching.
 */
export function applyCenteredPlasmaUvs(
  geo: THREE.BufferGeometry,
  outerRadius: number
): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  if (!pos || !norm) return geo;

  const safeRadius = Math.max(0.001, outerRadius);
  const invSpan = 0.46 / safeRadius;
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nz = Math.abs(norm.getZ(i));

    let u: number;
    let v: number;
    if (nz >= 0.42) {
      u = 0.5 + x * invSpan;
      v = 0.5 + y * invSpan;
    } else {
      const r = Math.hypot(x, y);
      const dirX = r > 1e-5 ? x / r : 1.0;
      const dirY = r > 1e-5 ? y / r : 0.0;
      const radialFrac = Math.min(0.47, Math.max(0.36, (r / safeRadius) * 0.46 - Math.abs(z) * 0.12));
      u = 0.5 + dirX * radialFrac;
      v = 0.5 + dirY * radialFrac;
    }

    uvs[i * 2] = Math.min(0.995, Math.max(0.005, u));
    uvs[i * 2 + 1] = Math.min(0.995, Math.max(0.005, v));
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));
  return geo;
}

/**
 * Bakes smooth radial vertex-color weights onto annular or solid plasma envelope geometries
 * for radial falloff shaping on plasmaOuterEnvelopeMat and plasmaVortexMat.
 */
export function bakeRadialPlasmaVertexColors(
  geo: THREE.BufferGeometry,
  innerRadius: number,
  outerRadius: number,
  innerRgb: [number, number, number],
  outerRgb: [number, number, number]
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!pos) return geo;

  const span = Math.max(0.001, outerRadius - innerRadius);
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    const t = Math.min(1, Math.max(0, (r - innerRadius) / span));
    const smoothT = t * t * (3 - 2 * t);
    colors[i * 3] = innerRgb[0] + (outerRgb[0] - innerRgb[0]) * smoothT;
    colors[i * 3 + 1] = innerRgb[1] + (outerRgb[1] - innerRgb[1]) * smoothT;
    colors[i * 3 + 2] = innerRgb[2] + (outerRgb[2] - innerRgb[2]) * smoothT;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Configures central plasma materials with a genuine Eco static-texture fallback and
 * single-pass procedural thermal shaders for Balanced and Cinematic modes.
 * Preserves existing material instances across runtime preset switches.
 */
export function createCorePlasmaController(
  materials: CorePlasmaMaterialSet,
  coreBodyRadius = 0.54,
  initialMode: CorePlasmaShaderMode = 'balanced'
): CorePlasmaController {
  const thermalMap = createCoreThermalTexture(512);
  const hotCoreMap = createHotCoreTexture(256);
  const outerEnvelopeMap = createOuterEnvelopeTexture(256);
  const textures = { thermalMap, hotCoreMap, outerEnvelopeMap };

  const uniforms: CorePlasmaShaderUniforms = {
    body: {
      uCoreThermalMap: { value: thermalMap },
      uCoreRadius: { value: coreBodyRadius },
      uDetailLevel: { value: CORE_PLASMA_SHADER_CONFIG.detailLevel.balanced },
      uEmissiveGain: { value: CORE_PLASMA_SHADER_CONFIG.bodyGain.balanced },
    },
    hotCore: {
      uHotGain: { value: CORE_PLASMA_SHADER_CONFIG.hotCoreGain.balanced },
    },
    envelope: {
      uDetailLevel: { value: CORE_PLASMA_SHADER_CONFIG.detailLevel.balanced },
      uEnvelopeGain: { value: CORE_PLASMA_SHADER_CONFIG.envelopeGain.balanced },
    },
    vortex: {
      uDetailLevel: { value: CORE_PLASMA_SHADER_CONFIG.detailLevel.balanced },
      uVortexGain: { value: CORE_PLASMA_SHADER_CONFIG.vortexGain.balanced },
    },
  };

  let activeMode: CorePlasmaShaderMode | null = null;

  const applyMode = (nextMode: CorePlasmaShaderMode) => {
    if (nextMode === activeMode) return;
    activeMode = nextMode;
    if (nextMode === 'eco') {
      installEcoCoreFallback(materials, textures);
    } else {
      installProceduralCoreShaders(nextMode, materials, textures, uniforms, coreBodyRadius);
    }
  };

  applyMode(initialMode);

  const applyGraphicsConfig = (
    config: GraphicsConfig,
    maxAniso: number,
    minFilter: THREE.MinificationTextureFilter
  ) => {
    const aniso = Math.max(1, Math.min(config.anisotropy, maxAniso));
    for (const tex of [thermalMap, hotCoreMap, outerEnvelopeMap]) {
      tex.anisotropy = aniso;
      tex.minFilter = minFilter;
      tex.needsUpdate = true;
    }
    applyMode(resolveCorePlasmaMode(config));
  };

  return {
    thermalMap,
    hotCoreMap,
    outerEnvelopeMap,
    getMode: () => activeMode ?? 'eco',
    applyGraphicsConfig,
  };
}
