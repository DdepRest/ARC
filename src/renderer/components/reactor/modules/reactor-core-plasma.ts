import * as THREE from 'three';
import { createCoreThermalTexture, createHotCoreTexture } from '../reactorTextures';
import type { GraphicsConfig } from '../../../features/settings/logic/graphics-presets';

export type CorePlasmaShaderMode = 'eco' | 'balanced' | 'cinematic';

export interface CorePlasmaMaterialSet {
  singularityCoreEmissiveMat: THREE.MeshStandardMaterial;
  singularityPointMat: THREE.MeshBasicMaterial;
  plasmaVortexMat: THREE.MeshStandardMaterial;
}

export interface CorePlasmaController {
  thermalMap: THREE.CanvasTexture;
  hotCoreMap: THREE.CanvasTexture;
  getMode: () => CorePlasmaShaderMode;
  applyGraphicsConfig: (config: GraphicsConfig, maxAniso: number, minFilter: THREE.MinificationTextureFilter) => void;
}

const NOOP_BEFORE_COMPILE = (): void => {};

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
 * so outer envelope and containment field remain visually distinct while sharing plasmaVortexMat.
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
 * procedural thermal blackbody shaders for Balanced and Cinematic modes.
 * Preserves existing material instances across runtime preset switches.
 */
export function createCorePlasmaController(
  materials: CorePlasmaMaterialSet,
  coreBodyRadius = 0.54,
  initialMode: CorePlasmaShaderMode = 'balanced'
): CorePlasmaController {
  const thermalMap = createCoreThermalTexture(512);
  const hotCoreMap = createHotCoreTexture(256);

  const bodyUniforms = {
    uCoreThermalMap: { value: thermalMap },
    uCoreRadius: { value: coreBodyRadius },
    uDetailLevel: { value: 0.65 },
    uEmissiveGain: { value: 1.95 },
  };
  const hotCoreUniforms = {
    uHotGain: { value: 1.65 },
  };
  const vortexUniforms = {
    uDetailLevel: { value: 0.65 },
  };

  let activeMode: CorePlasmaShaderMode | null = null;

  const installEcoFallback = () => {
    const { singularityCoreEmissiveMat, singularityPointMat, plasmaVortexMat } = materials;

    singularityCoreEmissiveMat.emissiveMap = thermalMap;
    singularityCoreEmissiveMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
    singularityCoreEmissiveMat.customProgramCacheKey = () => 'arc-plasma-body-eco-static-v1';
    singularityCoreEmissiveMat.needsUpdate = true;

    singularityPointMat.map = hotCoreMap;
    singularityPointMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
    singularityPointMat.customProgramCacheKey = () => 'arc-hot-core-eco-static-v1';
    singularityPointMat.needsUpdate = true;

    plasmaVortexMat.emissiveMap = thermalMap;
    plasmaVortexMat.vertexColors = true;
    plasmaVortexMat.onBeforeCompile = NOOP_BEFORE_COMPILE;
    plasmaVortexMat.customProgramCacheKey = () => 'arc-plasma-vortex-eco-static-v1';
    plasmaVortexMat.needsUpdate = true;
  };

  const installProceduralShaders = (tier: 'balanced' | 'cinematic') => {
    const { singularityCoreEmissiveMat, singularityPointMat, plasmaVortexMat } = materials;
    const isCinematic = tier === 'cinematic';

    bodyUniforms.uDetailLevel.value = isCinematic ? 1.0 : 0.60;
    bodyUniforms.uEmissiveGain.value = isCinematic ? 2.35 : 1.90;
    hotCoreUniforms.uHotGain.value = isCinematic ? 1.95 : 1.62;
    vortexUniforms.uDetailLevel.value = isCinematic ? 1.0 : 0.60;

    singularityCoreEmissiveMat.emissiveMap = thermalMap;
    singularityCoreEmissiveMat.customProgramCacheKey = () => `arc-plasma-body-${tier}-v1`;
    singularityCoreEmissiveMat.onBeforeCompile = (shader) => {
      shader.uniforms.uCoreThermalMap = bodyUniforms.uCoreThermalMap;
      shader.uniforms.uCoreRadius = bodyUniforms.uCoreRadius;
      shader.uniforms.uDetailLevel = bodyUniforms.uDetailLevel;
      shader.uniforms.uEmissiveGain = bodyUniforms.uEmissiveGain;

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
          `#include <emissivemap_fragment>
          float arcDrive = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
          if (arcDrive > 0.0005) {
            vec3 arcHue = totalEmissiveRadiance / arcDrive;
            vec2 arcCenteredUv = clamp(vArcCoreLocal * 0.46 + 0.5, 0.01, 0.99);
            vec3 arcThermal = texture2D(uCoreThermalMap, arcCenteredUv).rgb;
            float arcTurb = dot(diffuseColor.rgb, vec3(0.3333));
            float arcRadial = clamp(1.0 - length(vArcCoreLocal) * 0.88, 0.0, 1.0);
            float arcHeat = clamp(arcThermal.r * 0.52 + arcThermal.g * 0.36 + arcRadial * 0.24 + (arcTurb - 0.32) * 0.26 * uDetailLevel, 0.0, 1.0);
            vec3 cDeep = arcHue * 0.36;
            vec3 cMid = arcHue * 1.05;
            vec3 cHot = mix(arcHue, vec3(1.0, 0.52, 0.16), 0.56);
            vec3 cCore = mix(arcHue, vec3(1.0, 0.92, 0.78), 0.78);
            vec3 arcRamp = mix(cDeep, cMid, smoothstep(0.08, 0.44, arcHeat));
            arcRamp = mix(arcRamp, cHot, smoothstep(0.44, 0.78, arcHeat));
            arcRamp = mix(arcRamp, cCore, smoothstep(0.78, 0.98, arcHeat));
            float arcFacing = pow(saturate(dot(normalize(vNormal), normalize(vViewPosition))), 0.55);
            float arcEnergy = mix(0.46, uEmissiveGain, smoothstep(0.06, 0.94, arcHeat)) * mix(0.74, 1.0, arcFacing);
            totalEmissiveRadiance = arcRamp * arcDrive * arcEnergy;
          } else {
            totalEmissiveRadiance = vec3(0.0);
          }`
        );
      }
    };
    singularityCoreEmissiveMat.needsUpdate = true;

    singularityPointMat.map = hotCoreMap;
    singularityPointMat.customProgramCacheKey = () => `arc-hot-core-${tier}-v1`;
    singularityPointMat.onBeforeCompile = (shader) => {
      shader.uniforms.uHotGain = hotCoreUniforms.uHotGain;
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
          outgoingLight *= mix(1.0, uHotGain, smoothstep(0.24, 0.86, arcHotLuma));
          #include <opaque_fragment>`
        );
      }
    };
    singularityPointMat.needsUpdate = true;

    plasmaVortexMat.emissiveMap = thermalMap;
    plasmaVortexMat.vertexColors = true;
    plasmaVortexMat.customProgramCacheKey = () => `arc-plasma-vortex-${tier}-v1`;
    plasmaVortexMat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetailLevel = vortexUniforms.uDetailLevel;
      if (shader.fragmentShader.includes('#include <common>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>\nuniform float uDetailLevel;`
        );
      }
      if (shader.fragmentShader.includes('#include <emissivemap_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          #ifdef USE_COLOR
            float arcVortexTurb = 0.68 + (0.48 * uDetailLevel) * dot(diffuseColor.rgb, vec3(0.3333));
            totalEmissiveRadiance *= vColor.rgb * arcVortexTurb;
            diffuseColor.a *= clamp(max(vColor.r, max(vColor.g, vColor.b)), 0.0, 1.0);
          #endif`
        );
      }
    };
    plasmaVortexMat.needsUpdate = true;
  };

  const applyMode = (nextMode: CorePlasmaShaderMode) => {
    if (nextMode === activeMode) return;
    activeMode = nextMode;
    if (nextMode === 'eco') {
      installEcoFallback();
    } else {
      installProceduralShaders(nextMode);
    }
  };

  applyMode(initialMode);

  const applyGraphicsConfig = (
    config: GraphicsConfig,
    maxAniso: number,
    minFilter: THREE.MinificationTextureFilter
  ) => {
    const aniso = Math.max(1, Math.min(config.anisotropy, maxAniso));
    for (const tex of [thermalMap, hotCoreMap]) {
      tex.anisotropy = aniso;
      tex.minFilter = minFilter;
      tex.needsUpdate = true;
    }
    applyMode(resolveCorePlasmaMode(config));
  };

  return {
    thermalMap,
    hotCoreMap,
    getMode: () => activeMode ?? 'eco',
    applyGraphicsConfig,
  };
}
