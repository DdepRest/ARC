import * as THREE from "three";
import {
  createBrushedMetalTexture,
  createCarbonFiberTexture,
  createHolographicReticleTexture,
  createTriangularReticleTexture,
  createArcCenterLogoTexture,
  clearStaticTextureCache,
} from "../reactorTextures";

import { themeColors, themeAccentHex, getThemeTextures } from "./reactor-theme";
import type { GraphicsConfig } from "../../../features/settings/logic/graphics-presets";

export interface ReactorMaterials {
  brushedMetalMap: THREE.CanvasTexture;
  carbonFiberMap: THREE.CanvasTexture;
  glowParticleMap: THREE.CanvasTexture;
  holoReticleMap: THREE.CanvasTexture;
  triangularReticleMap: THREE.CanvasTexture;
  plasmaEnergyMap: THREE.CanvasTexture;
  arcCenterLogoMap: THREE.CanvasTexture;

  anodizedBlack: THREE.MeshStandardMaterial;
  brushedTitanium: THREE.MeshStandardMaterial;
  ringFrameMat: THREE.MeshStandardMaterial;
  darkCarbon: THREE.MeshStandardMaterial;
  copperWinding: THREE.MeshStandardMaterial;
  microMeshMat: THREE.MeshStandardMaterial;
  heatTintedMetal: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshPhysicalMaterial;
  outerGlassRingMat: THREE.MeshStandardMaterial;
  darkGlassOuter: THREE.MeshStandardMaterial;
  darkGlassInner: THREE.MeshStandardMaterial;

  singularityFacetedMat: THREE.MeshStandardMaterial;
  singularityCoreEmissiveMat: THREE.MeshStandardMaterial;
  singularityInnerWireMat: THREE.MeshBasicMaterial;
  singularityPointMat: THREE.MeshBasicMaterial;
  plasmaVortexMat: THREE.MeshStandardMaterial;
  energyWaveMat: THREE.MeshBasicMaterial;
  energyArcMat: THREE.LineBasicMaterial;
  coronaMat: THREE.MeshBasicMaterial;
  criticalWhite: THREE.MeshStandardMaterial;

  neonTubeMat: THREE.MeshStandardMaterial;
  coreDiodeMat: THREE.MeshStandardMaterial;
  arcCenterLogoMat: THREE.MeshBasicMaterial;

  currentColor: THREE.Color;
  targetColor: THREE.Color;

  applyGraphicsConfig: (config: GraphicsConfig, maxHwAnisotropy?: number) => void;
  dispose: () => void;
}

export function createReactorMaterials(initialTheme: string): ReactorMaterials {
  const hex = themeAccentHex(initialTheme);
  const currentColor = new THREE.Color(hex);
  const targetColor = new THREE.Color(hex);

  const brushedMetalMap = createBrushedMetalTexture(256, 256);
  const carbonFiberMap = createCarbonFiberTexture(256, 256);
  const holoReticleMap = createHolographicReticleTexture(512);
  const triangularReticleMap = createTriangularReticleTexture(512);
  const arcCenterLogoMap = createArcCenterLogoTexture(2048);

  const themeTextures = getThemeTextures(initialTheme);
  let plasmaEnergyMap = themeTextures.plasmaMap;
  let glowParticleMap = themeTextures.glowMap;

  const anodizedBlack = new THREE.MeshStandardMaterial({
    color: 0x050507,
    metalness: 0.94,
    roughness: 0.24,
    envMapIntensity: 0.5,
  });

  const brushedTitanium = new THREE.MeshStandardMaterial({
    color: 0x16181f,
    metalness: 0.90,
    roughness: 0.26,
    roughnessMap: brushedMetalMap,
    bumpMap: brushedMetalMap,
    bumpScale: 0.008,
    envMapIntensity: 1.0,
  });

  const ringFrameMat = new THREE.MeshStandardMaterial({
    color: 0x0e0f14,
    metalness: 0.95,
    roughness: 0.16,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    envMapIntensity: 0.8,
  });

  const darkCarbon = new THREE.MeshStandardMaterial({
    color: 0x060709,
    metalness: 0.88,
    roughness: 0.40,
    map: carbonFiberMap,
    bumpMap: carbonFiberMap,
    bumpScale: 0.025,
    envMapIntensity: 0.4,
  });

  const copperWinding = new THREE.MeshStandardMaterial({
    color: 0x583e26,
    metalness: 0.94,
    roughness: 0.24,
    envMapIntensity: 1.1,
  });

  const microMeshMat = new THREE.MeshStandardMaterial({
    color: 0x121318,
    metalness: 0.9,
    roughness: 0.15,
    wireframe: true,
  });

  const heatTintedMetal = new THREE.MeshStandardMaterial({
    color: 0x0b0c10,
    metalness: 0.98,
    roughness: 0.28,
    emissive: 0x060503,
    envMapIntensity: 0.7,
  });

  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x121015,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.88,
    ior: 1.54,
    thickness: 1.6,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  // Crystal Clear White Glass Outer Ring (Optimized for Overdraw)
  const outerGlassRingMat = new THREE.MeshStandardMaterial({
    color: 0x0e0c12,
    metalness: 0.9,
    roughness: 0.05,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const darkGlassOuter = new THREE.MeshStandardMaterial({
    color: 0x060608,
    metalness: 0.85,
    roughness: 0.10,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const darkGlassInner = new THREE.MeshStandardMaterial({
    color: 0x040406,
    metalness: 0.9,
    roughness: 0.12,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  // Stage 1 Singularity Materials - Engineered dark faceted crystal & saturated internal core
  const singularityFacetedMat = new THREE.MeshStandardMaterial({
    color: 0x050508,
    metalness: 0.95,
    roughness: 0.12,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    flatShading: true,
    transparent: true,
    opacity: 0.96,
  });

  const singularityCoreEmissiveMat = new THREE.MeshStandardMaterial({
    color: currentColor.getHex(),
    map: plasmaEnergyMap,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.25,
    metalness: 0.5,
    transparent: true,
    opacity: 0.95,
  });

  const singularityInnerWireMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(),
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  });

  const plasmaVortexMat = new THREE.MeshStandardMaterial({
    color: currentColor.getHex(),
    map: plasmaEnergyMap,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const energyWaveMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const energyArcMat = new THREE.LineBasicMaterial({
    color: currentColor.getHex(),
    transparent: true,
    opacity: 0.0,
    linewidth: 2,
    blending: THREE.AdditiveBlending,
  });

  const singularityPointMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });

  const coronaMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const criticalWhite = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
  });

  // Lamps / Neon Tubes / Waveguides: Crisp glowing glass plasma tubes with warm core highlight
  const neonTubeMat = new THREE.MeshStandardMaterial({
    color: 0x2b090e,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.2,
    metalness: 0.1,
  });

  // High-Output Emitter Diodes: Focused glowing diode crystal
  const coreDiodeMat = new THREE.MeshStandardMaterial({
    color: 0x2b090e,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.15,
    metalness: 0.1,
  });

  const arcCenterLogoMat = new THREE.MeshBasicMaterial({
    map: arcCenterLogoMap,
    color: 0xd4d4d8,
    transparent: true,
    opacity: 0.92,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const dispose = () => {
    clearStaticTextureCache();
    [
      anodizedBlack, brushedTitanium, ringFrameMat, darkCarbon, copperWinding,
      microMeshMat, heatTintedMetal, opticGlass, outerGlassRingMat, darkGlassOuter,
      darkGlassInner, singularityFacetedMat, singularityCoreEmissiveMat,
      singularityInnerWireMat, plasmaVortexMat, energyWaveMat, energyArcMat,
      singularityPointMat, coronaMat, criticalWhite, neonTubeMat, coreDiodeMat, arcCenterLogoMat,
    ].forEach((m) => m.dispose());
  };

  const applyGraphicsConfig = (config: GraphicsConfig, maxHwAnisotropy: number = 16) => {
    const aniso = Math.max(1, Math.min(config.anisotropy, maxHwAnisotropy));
    const minFilter = config.trilinearFiltering
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearMipmapNearestFilter;
    [holoReticleMap, triangularReticleMap, brushedMetalMap, carbonFiberMap, plasmaEnergyMap].forEach((tex) => {
      if (tex) {
        tex.anisotropy = aniso;
        tex.minFilter = minFilter;
        tex.needsUpdate = true;
      }
    });
    if (arcCenterLogoMap) {
      arcCenterLogoMap.anisotropy = Math.max(4, aniso);
      arcCenterLogoMap.minFilter = THREE.LinearMipmapLinearFilter;
      arcCenterLogoMap.needsUpdate = true;
    }

    const pmremMult = config.pmremQuality === "off" ? 0.75 : config.pmremQuality === "high" ? 1.02 : 1.0;
    const clampedEnv = Math.max(50, Math.min(150, config.envMapIntensity));
    const envScale = (0.85 + ((clampedEnv - 50) / 100) * 0.22) * pmremMult;
    anodizedBlack.envMapIntensity = 0.5 * envScale;
    brushedTitanium.envMapIntensity = 1.0 * envScale;
    ringFrameMat.envMapIntensity = 0.8 * envScale;
    darkCarbon.envMapIntensity = 0.4 * envScale;
    copperWinding.envMapIntensity = 1.1 * envScale;
    heatTintedMetal.envMapIntensity = 0.7 * envScale;
    neonTubeMat.envMapIntensity = 1.0 * envScale;
    coreDiodeMat.envMapIntensity = 1.0 * envScale;

    plasmaVortexMat.roughness = config.glslPlasmaShader ? 0.06 : 0.14;
    plasmaVortexMat.metalness = config.glslPlasmaShader ? 0.88 : 0.75;
  };

  return {
    brushedMetalMap,
    carbonFiberMap,
    glowParticleMap,
    holoReticleMap,
    triangularReticleMap,
    plasmaEnergyMap,
    arcCenterLogoMap,
    anodizedBlack,
    brushedTitanium,
    ringFrameMat,
    darkCarbon,
    copperWinding,
    microMeshMat,
    heatTintedMetal,
    opticGlass,
    outerGlassRingMat,
    darkGlassOuter,
    darkGlassInner,
    singularityFacetedMat,
    singularityCoreEmissiveMat,
    singularityInnerWireMat,
    singularityPointMat,
    plasmaVortexMat,
    energyWaveMat,
    energyArcMat,
    coronaMat,
    criticalWhite,
    neonTubeMat,
    coreDiodeMat,
    arcCenterLogoMat,
    currentColor,
    targetColor,
    applyGraphicsConfig,
    dispose,
  };
}

