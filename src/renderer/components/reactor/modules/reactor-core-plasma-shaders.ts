import * as THREE from 'three';

export interface CorePlasmaMaterialTargets {
  singularityCoreEmissiveMat: THREE.MeshStandardMaterial;
  singularityPointMat: THREE.MeshBasicMaterial;
  plasmaOuterEnvelopeMat: THREE.MeshStandardMaterial;
  plasmaVortexMat: THREE.MeshStandardMaterial;
}

export interface CorePlasmaTextureSet {
  thermalMap: THREE.CanvasTexture;
  hotCoreMap: THREE.CanvasTexture;
  outerEnvelopeMap: THREE.CanvasTexture;
}

export interface CorePlasmaShaderUniforms {
  body: {
    uCoreThermalMap: { value: THREE.CanvasTexture };
    uCoreRadius: { value: number };
    uDetailLevel: { value: number };
    uEmissiveGain: { value: number };
  };
  hotCore: {
    uHotGain: { value: number };
  };
  envelope: {
    uDetailLevel: { value: number };
    uEnvelopeGain: { value: number };
  };
  vortex: {
    uDetailLevel: { value: number };
    uVortexGain: { value: number };
  };
}

export const CORE_PLASMA_SHADER_CONFIG = {
  cacheVersion: 'v2',
  detailLevel: { balanced: 0.60, cinematic: 1.0 },
  bodyGain: { balanced: 1.85, cinematic: 2.20 },
  hotCoreGain: { balanced: 1.38, cinematic: 1.62 },
  envelopeGain: { balanced: 1.15, cinematic: 1.35 },
  vortexGain: { balanced: 1.08, cinematic: 1.28 },
} as const;

export const NOOP_BEFORE_COMPILE = (): void => {};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Isolated CPU mirror of the 4-stop thermal blackbody color ramp used in the main plasma shader.
 * Evaluates isolated emission ramp chromaticity/weights only; does NOT model full GPU framebuffer,
 * MeshStandardMaterial lighting, PMREM, AO, transparency ordering, or Bloom.
 */
export function evaluateThermalRampRgb(
  heat: number,
  hue: [number, number, number]
): [number, number, number] {
  const h = Math.max(0, Math.min(1, heat));
  const cDeep: [number, number, number] = [hue[0] * 0.78, hue[1] * 0.78, hue[2] * 0.78];
  const cMid = mix3(hue, [1.0, 0.34, 0.06], 0.54);
  const cHot = mix3(hue, [1.0, 0.72, 0.24], 0.74);
  const cCore = mix3(hue, [1.0, 0.94, 0.82], 0.86);

  let rgb = mix3(cDeep, cMid, smoothstep(0.06, 0.42, h));
  rgb = mix3(rgb, cHot, smoothstep(0.42, 0.76, h));
  rgb = mix3(rgb, cCore, smoothstep(0.76, 0.96, h));
  return rgb;
}

/**
 * Installs genuine Eco static-texture fallback with zero custom GLSL injection.
 * Preserves existing material instances and cached texture references.
 */
export function installEcoCoreFallback(
  materials: CorePlasmaMaterialTargets,
  textures: CorePlasmaTextureSet
): void {
  const { singularityCoreEmissiveMat, singularityPointMat, plasmaOuterEnvelopeMat, plasmaVortexMat } = materials;
  const ver = CORE_PLASMA_SHADER_CONFIG.cacheVersion;

  singularityCoreEmissiveMat.emissiveMap = textures.thermalMap;
  singularityCoreEmissiveMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
  singularityCoreEmissiveMat.customProgramCacheKey = () => `arc-plasma-body-eco-static-${ver}`;
  singularityCoreEmissiveMat.needsUpdate = true;

  singularityPointMat.map = textures.hotCoreMap;
  singularityPointMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
  singularityPointMat.customProgramCacheKey = () => `arc-hot-core-eco-static-${ver}`;
  singularityPointMat.needsUpdate = true;

  plasmaOuterEnvelopeMat.emissiveMap = textures.outerEnvelopeMap;
  plasmaOuterEnvelopeMat.vertexColors = true;
  plasmaOuterEnvelopeMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
  plasmaOuterEnvelopeMat.customProgramCacheKey = () => `arc-plasma-envelope-eco-static-${ver}`;
  plasmaOuterEnvelopeMat.needsUpdate = true;

  plasmaVortexMat.emissiveMap = textures.thermalMap;
  plasmaVortexMat.vertexColors = true;
  plasmaVortexMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
  plasmaVortexMat.customProgramCacheKey = () => `arc-plasma-vortex-eco-static-${ver}`;
  plasmaVortexMat.needsUpdate = true;
}

/**
 * Installs single-pass procedural thermal shaders for Balanced and Cinematic tiers.
 * Replaces `#include <emissivemap_fragment>` cleanly so `emissiveMap` is never applied twice,
 * and samples raw `map` UVs before `diffuseColor` tinting so scrolling plasma turbulence stays active.
 */
export function installProceduralCoreShaders(
  tier: 'balanced' | 'cinematic',
  materials: CorePlasmaMaterialTargets,
  textures: CorePlasmaTextureSet,
  uniforms: CorePlasmaShaderUniforms,
  coreBodyRadius: number
): void {
  const { singularityCoreEmissiveMat, singularityPointMat, plasmaOuterEnvelopeMat, plasmaVortexMat } = materials;
  const ver = CORE_PLASMA_SHADER_CONFIG.cacheVersion;

  uniforms.body.uDetailLevel.value = CORE_PLASMA_SHADER_CONFIG.detailLevel[tier];
  uniforms.body.uEmissiveGain.value = CORE_PLASMA_SHADER_CONFIG.bodyGain[tier];
  uniforms.hotCore.uHotGain.value = CORE_PLASMA_SHADER_CONFIG.hotCoreGain[tier];
  uniforms.envelope.uDetailLevel.value = CORE_PLASMA_SHADER_CONFIG.detailLevel[tier];
  uniforms.envelope.uEnvelopeGain.value = CORE_PLASMA_SHADER_CONFIG.envelopeGain[tier];
  uniforms.vortex.uDetailLevel.value = CORE_PLASMA_SHADER_CONFIG.detailLevel[tier];
  uniforms.vortex.uVortexGain.value = CORE_PLASMA_SHADER_CONFIG.vortexGain[tier];

  // 1. Main Triangular Plasma Body (single-pass replacement of emissivemap_fragment)
  singularityCoreEmissiveMat.emissiveMap = textures.thermalMap;
  singularityCoreEmissiveMat.customProgramCacheKey = () => `arc-plasma-body-${tier}-${ver}`;
  singularityCoreEmissiveMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCoreThermalMap = uniforms.body.uCoreThermalMap;
    shader.uniforms.uCoreRadius = uniforms.body.uCoreRadius;
    shader.uniforms.uDetailLevel = uniforms.body.uDetailLevel;
    shader.uniforms.uEmissiveGain = uniforms.body.uEmissiveGain;

    if (shader.vertexShader.includes('#include <common>')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec2 vArcCoreLocal;`
      );
    }
    if (shader.vertexShader.includes('#include <begin_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvArcCoreLocal = position.xy / max(0.001, ${coreBodyRadius.toFixed(4)});`
      );
    }
    if (shader.fragmentShader.includes('#include <common>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uCoreThermalMap;
        uniform float uDetailLevel;
        uniform float uEmissiveGain;
        varying vec2 vArcCoreLocal;`
      );
    }
    if (shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `/* ARC-057: single-pass procedural thermal emission (replaces emissivemap_fragment) */
        float arcDrive = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
        if (arcDrive > 0.0005) {
          vec3 arcHue = totalEmissiveRadiance / arcDrive;
          vec2 arcCenteredUv = clamp(vArcCoreLocal * 0.46 + 0.5, 0.01, 0.99);
          vec3 arcThermal = texture2D(uCoreThermalMap, arcCenteredUv).rgb;
          float arcRawTurb = 0.42;
          #ifdef USE_MAP
            vec3 arcMapSample = texture2D(map, vMapUv).rgb;
            arcRawTurb = max(arcMapSample.r, max(arcMapSample.g, arcMapSample.b));
          #endif
          float arcMapHeat = pow(max(arcThermal.r, 0.0001), 0.48);
          float arcRadial = clamp(1.0 - length(vArcCoreLocal) * 0.84, 0.0, 1.0);
          float arcHeat = clamp(
            arcMapHeat * 0.62 + arcRadial * 0.34 + (arcRawTurb - 0.42) * 0.26 * uDetailLevel,
            0.0,
            1.0
          );
          vec3 cDeep = arcHue * 0.78;
          vec3 cMid = mix(arcHue, vec3(1.0, 0.34, 0.06), 0.54);
          vec3 cHot = mix(arcHue, vec3(1.0, 0.72, 0.24), 0.74);
          vec3 cCore = mix(arcHue, vec3(1.0, 0.94, 0.82), 0.86);
          vec3 arcRamp = mix(cDeep, cMid, smoothstep(0.06, 0.42, arcHeat));
          arcRamp = mix(arcRamp, cHot, smoothstep(0.42, 0.76, arcHeat));
          arcRamp = mix(arcRamp, cCore, smoothstep(0.76, 0.96, arcHeat));
          float arcFacing = pow(saturate(dot(normalize(vNormal), normalize(vViewPosition))), 0.45);
          float arcEnergy = mix(0.76, uEmissiveGain, smoothstep(0.05, 0.92, arcHeat)) * mix(0.84, 1.0, arcFacing);
          totalEmissiveRadiance = arcRamp * arcDrive * arcEnergy;
        } else {
          totalEmissiveRadiance = vec3(0.0);
        }`
      );
    }
  };
  singularityCoreEmissiveMat.needsUpdate = true;

  // 2. White-Hot Compact Singularity Core (r = 0.145)
  singularityPointMat.map = textures.hotCoreMap;
  singularityPointMat.customProgramCacheKey = () => `arc-hot-core-${tier}-${ver}`;
  singularityPointMat.onBeforeCompile = (shader) => {
    shader.uniforms.uHotGain = uniforms.hotCore.uHotGain;
    if (shader.fragmentShader.includes('#include <common>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nuniform float uHotGain;`
      );
    }
    if (shader.fragmentShader.includes('#include <opaque_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float arcHotLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        outgoingLight *= mix(1.0, uHotGain, smoothstep(0.20, 0.84, arcHotLuma));
        #include <opaque_fragment>`
      );
    }
  };
  singularityPointMat.needsUpdate = true;

  // 3. Dedicated Outer Energy Envelope (renderOrder = 1, independent deep-crimson volumetric aura)
  plasmaOuterEnvelopeMat.emissiveMap = textures.outerEnvelopeMap;
  plasmaOuterEnvelopeMat.vertexColors = true;
  plasmaOuterEnvelopeMat.customProgramCacheKey = () => `arc-plasma-envelope-${tier}-${ver}`;
  plasmaOuterEnvelopeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailLevel = uniforms.envelope.uDetailLevel;
    shader.uniforms.uEnvelopeGain = uniforms.envelope.uEnvelopeGain;
    if (shader.fragmentShader.includes('#include <common>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nuniform float uDetailLevel;\nuniform float uEnvelopeGain;`
      );
    }
    if (shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `/* ARC-057: independent outer-envelope emission (replaces emissivemap_fragment) */
        float arcEnvRawTurb = 0.48;
        #ifdef USE_MAP
          vec3 arcEnvTex = texture2D(map, vMapUv).rgb;
          arcEnvRawTurb = max(arcEnvTex.r, max(arcEnvTex.g, arcEnvTex.b));
        #endif
        float arcEnvMod = (0.76 + 0.42 * uDetailLevel * arcEnvRawTurb) * uEnvelopeGain;
        #ifdef USE_COLOR
          totalEmissiveRadiance *= vColor.rgb * arcEnvMod;
        #else
          totalEmissiveRadiance *= arcEnvMod;
        #endif`
      );
    }
  };
  plasmaOuterEnvelopeMat.needsUpdate = true;

  // 4. Independent Front Containment Field (renderOrder = 4, crisp magnetic filament arcs)
  plasmaVortexMat.emissiveMap = textures.thermalMap;
  plasmaVortexMat.vertexColors = true;
  plasmaVortexMat.customProgramCacheKey = () => `arc-plasma-vortex-${tier}-${ver}`;
  plasmaVortexMat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailLevel = uniforms.vortex.uDetailLevel;
    shader.uniforms.uVortexGain = uniforms.vortex.uVortexGain;
    if (shader.fragmentShader.includes('#include <common>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nuniform float uDetailLevel;\nuniform float uVortexGain;`
      );
    }
    if (shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `/* ARC-057: independent front containment-field filaments (replaces emissivemap_fragment) */
        float arcVortexRaw = 0.45;
        #ifdef USE_MAP
          vec3 arcVortexTex = texture2D(map, vMapUv).rgb;
          arcVortexRaw = max(arcVortexTex.r, max(arcVortexTex.g, arcVortexTex.b));
        #endif
        float arcFilament = mix(0.62, 1.32, smoothstep(0.18, 0.82, arcVortexRaw));
        float arcVortexMod = mix(0.85, arcFilament, 0.45 + 0.55 * uDetailLevel) * uVortexGain;
        #ifdef USE_COLOR
          totalEmissiveRadiance *= vColor.rgb * arcVortexMod;
        #else
          totalEmissiveRadiance *= arcVortexMod;
        #endif`
      );
    }
  };
  plasmaVortexMat.needsUpdate = true;
}
