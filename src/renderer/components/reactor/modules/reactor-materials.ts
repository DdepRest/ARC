import * as THREE from 'three';
import {
  createHolographicReticleTexture,
  createTriangularReticleTexture,
  createArcCenterLogoTexture,
} from '../reactorTextures';
import { themeAccentHex, getThemeTextures } from './reactor-theme';
import type { GraphicsConfig } from '../../../features/settings/logic/graphics-presets';
import type { GpuCapabilities } from './reactor-gpu-capabilities';
import type { ReactorPbrTextureBundle } from './reactor-texture-registry';

export interface ReactorMaterials {
  glowParticleMap: THREE.CanvasTexture;
  holoReticleMap: THREE.CanvasTexture;
  triangularReticleMap: THREE.CanvasTexture;
  plasmaEnergyMap: THREE.CanvasTexture;
  arcCenterLogoMap: THREE.CanvasTexture;

  anodizedBlack: THREE.MeshStandardMaterial;
  brushedTitanium: THREE.MeshPhysicalMaterial;
  ringFrameMat: THREE.MeshStandardMaterial;
  darkCarbon: THREE.MeshPhysicalMaterial;
  darkCeramic: THREE.MeshStandardMaterial;
  copperWinding: THREE.MeshStandardMaterial;
  microMeshMat: THREE.MeshStandardMaterial;
  heatTintedMetal: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshPhysicalMaterial;
  outerGlassRingMat: THREE.MeshPhysicalMaterial;
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

  applyPbrBundle: (bundle: ReactorPbrTextureBundle) => void;
  applyGraphicsConfig: (config: GraphicsConfig, caps?: GpuCapabilities | null) => void;
  dispose: () => void;
}

export function createReactorMaterials(
  initialTheme: string,
  initialPbrBundle?: ReactorPbrTextureBundle | null
): ReactorMaterials {
  const hex = themeAccentHex(initialTheme);
  const currentColor = new THREE.Color(hex);
  const targetColor = new THREE.Color(hex);

  const holoReticleMap = createHolographicReticleTexture(512);
  const triangularReticleMap = createTriangularReticleTexture(512);
  const arcCenterLogoMap = createArcCenterLogoTexture(2048);
  const { plasmaMap: plasmaEnergyMap, glowMap: glowParticleMap } = getThemeTextures(initialTheme);

  // 1. Anodized Titanium — cool dark bead-blasted machined graphite metal.
  // Fallback scalar roughness (0.37) is promoted to 1.0 once roughnessMap binds (no double-multiply).
  const anodizedBlack = new THREE.MeshStandardMaterial({
    color: 0x6c727e,
    metalness: 0.88,
    roughness: 0.37,
    normalScale: new THREE.Vector2(0.55, 0.55),
    aoMapIntensity: 0.8,
    envMapIntensity: 1.05,
  });

  // 2. Brushed Titanium — cool satin aerospace alloy with directional anisotropic sheen
  const brushedTitanium = new THREE.MeshPhysicalMaterial({
    color: 0xb4bcc8,
    metalness: 0.94,
    roughness: 0.28,
    anisotropy: 0.65,
    anisotropyRotation: 0.0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.32,
    normalScale: new THREE.Vector2(0.42, 0.42),
    aoMapIntensity: 0.7,
    envMapIntensity: 1.32,
  });

  // 3. Structural Ring Trim — machined gunmetal steel
  const ringFrameMat = new THREE.MeshStandardMaterial({
    color: 0x6a7280,
    metalness: 0.92,
    roughness: 0.3,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.15,
  });

  // 4. Carbon Composite — 3K 2x2 diagonal twill weave with controlled resin clearcoat
  const darkCarbon = new THREE.MeshPhysicalMaterial({
    color: 0x4b5059,
    metalness: 0.14,
    roughness: 0.42,
    clearcoat: 0.28,
    clearcoatRoughness: 0.3,
    normalScale: new THREE.Vector2(0.75, 0.75),
    aoMapIntensity: 0.85,
    envMapIntensity: 0.85,
  });

  // 5. Technical Ceramic — matte dark dielectric providing sharp contrast next to metals
  const darkCeramic = new THREE.MeshStandardMaterial({
    color: 0x555a63,
    metalness: 0.06,
    roughness: 0.7,
    normalScale: new THREE.Vector2(0.38, 0.38),
    envMapIntensity: 0.45,
  });

  // 6. Copper Alloy — burnished industrial copper for windings, busbars & heat-sink fins
  const copperWinding = new THREE.MeshStandardMaterial({
    color: 0xd98f64,
    metalness: 0.95,
    roughness: 0.3,
    normalScale: new THREE.Vector2(0.38, 0.38),
    envMapIntensity: 1.35,
  });

  const microMeshMat = new THREE.MeshStandardMaterial({
    color: 0x3b404c,
    metalness: 0.88,
    roughness: 0.28,
    wireframe: true,
  });

  const heatTintedMetal = new THREE.MeshStandardMaterial({
    color: 0x625750, metalness: 0.91, roughness: 0.38, emissive: 0x000000,
    normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.08,
  });

  // 7. Optical Protective Glass — Fresnel clearcoat; physical transmission strictly on HW GPUs
  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x1e2430, metalness: 0.02, roughness: 0.06, ior: 1.52, reflectivity: 0.9,
    clearcoat: 1.0, clearcoatRoughness: 0.05, transmission: 0.0, thickness: 0.5,
    transparent: true, opacity: 0.24, depthWrite: false, envMapIntensity: 1.4,
  });
  const outerGlassRingMat = new THREE.MeshPhysicalMaterial({
    color: 0x1b202b, metalness: 0.04, roughness: 0.06, ior: 1.52, clearcoat: 1.0,
    clearcoatRoughness: 0.05, reflectivity: 0.9, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.NormalBlending, envMapIntensity: 1.35,
  });
  const darkGlassOuter = new THREE.MeshStandardMaterial({
    color: 0x161922, metalness: 0.65, roughness: 0.14, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.NormalBlending,
  });
  const darkGlassInner = new THREE.MeshStandardMaterial({
    color: 0x12151d, metalness: 0.7, roughness: 0.16, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.NormalBlending,
  });

  // Core Cavity & Emissive Materials
  const singularityFacetedMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f3a, metalness: 0.9, roughness: 0.24, emissive: 0x000000, emissiveIntensity: 0.0,
    flatShading: true, transparent: false, envMapIntensity: 1.25,
  });
  const singularityCoreEmissiveMat = new THREE.MeshStandardMaterial({
    color: 0x301418, map: plasmaEnergyMap, emissive: currentColor.getHex(), emissiveIntensity: 0.0,
    roughness: 0.28, metalness: 0.45, transparent: true, opacity: 0.95,
  });
  const singularityInnerWireMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), wireframe: true, transparent: true, opacity: 0.26,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const plasmaVortexMat = new THREE.MeshStandardMaterial({
    color: currentColor.getHex(), map: plasmaEnergyMap, emissive: 0x000000, emissiveIntensity: 0.0,
    roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const energyWaveMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const energyArcMat = new THREE.LineBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, linewidth: 2,
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

  const neonTubeMat = new THREE.MeshStandardMaterial({
    color: 0x341116,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.2,
    metalness: 0.12,
  });

  const coreDiodeMat = new THREE.MeshStandardMaterial({
    color: 0x3a1218,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.16,
    metalness: 0.14,
  });

  const arcCenterLogoMat = new THREE.MeshBasicMaterial({
    map: arcCenterLogoMap,
    color: 0xdce0e8,
    transparent: true,
    opacity: 0.94,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  /**
   * Binds calibrated PBR maps.
   * CRITICAL: Sets `roughness = 1.0` so Three.js uses the physical roughnessMap directly
   * (preventing roughness*roughnessMap double-multiplication mirror artifacts),
   * and sets `color = 0xffffff` on albedo-mapped materials so sRGB albedo maps stay calibrated.
   */
  const applyPbrBundle = (bundle: ReactorPbrTextureBundle) => {
    anodizedBlack.color.setHex(0xffffff);
    anodizedBlack.roughness = 1.0;
    anodizedBlack.map = bundle.anodized.albedo;
    anodizedBlack.normalMap = bundle.anodized.normal;
    anodizedBlack.roughnessMap = bundle.anodized.roughness;
    anodizedBlack.aoMap = bundle.anodized.ao ?? null;
    anodizedBlack.needsUpdate = true;

    brushedTitanium.color.setHex(0xffffff);
    brushedTitanium.roughness = 1.0;
    brushedTitanium.map = bundle.brushedTitanium.albedo;
    brushedTitanium.normalMap = bundle.brushedTitanium.normal;
    brushedTitanium.roughnessMap = bundle.brushedTitanium.roughness;
    brushedTitanium.aoMap = bundle.brushedTitanium.ao ?? null;
    brushedTitanium.needsUpdate = true;

    ringFrameMat.roughness = 1.0;
    ringFrameMat.normalMap = bundle.brushedTitanium.normal;
    ringFrameMat.roughnessMap = bundle.brushedTitanium.roughness;
    ringFrameMat.needsUpdate = true;

    darkCarbon.color.setHex(0xffffff);
    darkCarbon.roughness = 1.0;
    darkCarbon.map = bundle.carbon.albedo;
    darkCarbon.normalMap = bundle.carbon.normal;
    darkCarbon.roughnessMap = bundle.carbon.roughness;
    darkCarbon.aoMap = bundle.carbon.ao ?? null;
    darkCarbon.needsUpdate = true;

    darkCeramic.color.setHex(0xffffff);
    darkCeramic.roughness = 1.0;
    darkCeramic.map = bundle.ceramic.albedo;
    darkCeramic.normalMap = bundle.ceramic.normal;
    darkCeramic.roughnessMap = bundle.ceramic.roughness;
    darkCeramic.needsUpdate = true;

    copperWinding.color.setHex(0xffffff);
    copperWinding.roughness = 1.0;
    copperWinding.map = bundle.copper.albedo;
    copperWinding.normalMap = bundle.copper.normal;
    copperWinding.roughnessMap = bundle.copper.roughness;
    copperWinding.needsUpdate = true;

    heatTintedMetal.roughness = 1.0;
    heatTintedMetal.normalMap = bundle.anodized.normal;
    heatTintedMetal.roughnessMap = bundle.anodized.roughness;
    heatTintedMetal.needsUpdate = true;
  };

  if (initialPbrBundle) applyPbrBundle(initialPbrBundle);

  const applyGraphicsConfig = (config: GraphicsConfig, caps?: GpuCapabilities | null) => {
    const maxHwAniso = caps?.maxAnisotropy ?? 16;
    const aniso = Math.max(1, Math.min(config.anisotropy, maxHwAniso));
    const minFilter = config.trilinearFiltering
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearMipmapNearestFilter;

    for (const tex of [holoReticleMap, triangularReticleMap, plasmaEnergyMap]) {
      if (!tex) continue;
      tex.anisotropy = aniso;
      tex.minFilter = minFilter;
      tex.needsUpdate = true;
    }
    if (arcCenterLogoMap) {
      arcCenterLogoMap.anisotropy = Math.min(maxHwAniso, Math.max(4, aniso));
      arcCenterLogoMap.minFilter = THREE.LinearMipmapLinearFilter;
      arcCenterLogoMap.needsUpdate = true;
    }

    const envScale = Math.max(50, Math.min(150, config.envMapIntensity)) / 100;
    anodizedBlack.envMapIntensity = 1.05 * envScale;
    brushedTitanium.envMapIntensity = 1.32 * envScale;
    ringFrameMat.envMapIntensity = 1.15 * envScale;
    darkCarbon.envMapIntensity = 0.85 * envScale;
    darkCeramic.envMapIntensity = 0.45 * envScale;
    copperWinding.envMapIntensity = 1.35 * envScale;
    heatTintedMetal.envMapIntensity = 1.08 * envScale;
    opticGlass.envMapIntensity = 1.4 * envScale;
    outerGlassRingMat.envMapIntensity = 1.35 * envScale;
    neonTubeMat.envMapIntensity = 1.0 * envScale;
    coreDiodeMat.envMapIntensity = 1.0 * envScale;

    const allowTransmission = !caps?.isSoftwareGl && config.pmremQuality !== 'eco';
    const nextTransmission = allowTransmission ? 0.42 : 0.0;
    if (opticGlass.transmission !== nextTransmission) {
      opticGlass.transmission = nextTransmission;
      opticGlass.opacity = allowTransmission ? 0.36 : 0.24;
      opticGlass.needsUpdate = true;
    }

    brushedTitanium.anisotropy = config.pmremQuality === 'eco' ? 0.0 : 0.65;
    plasmaVortexMat.roughness = config.glslPlasmaShader ? 0.06 : 0.14;
    plasmaVortexMat.metalness = config.glslPlasmaShader ? 0.88 : 0.75;
  };

  // Single-owner rule: materials.dispose() disposes ONLY THREE.Material instances.
  const dispose = () => {
    [
      anodizedBlack, brushedTitanium, ringFrameMat, darkCarbon, darkCeramic, copperWinding,
      microMeshMat, heatTintedMetal, opticGlass, outerGlassRingMat, darkGlassOuter,
      darkGlassInner, singularityFacetedMat, singularityCoreEmissiveMat,
      singularityInnerWireMat, plasmaVortexMat, energyWaveMat, energyArcMat,
      singularityPointMat, coronaMat, criticalWhite, neonTubeMat, coreDiodeMat, arcCenterLogoMat,
    ].forEach((m) => m.dispose());
  };

  return {
    glowParticleMap, holoReticleMap, triangularReticleMap, plasmaEnergyMap, arcCenterLogoMap,
    anodizedBlack, brushedTitanium, ringFrameMat, darkCarbon, darkCeramic, copperWinding,
    microMeshMat, heatTintedMetal, opticGlass, outerGlassRingMat, darkGlassOuter, darkGlassInner,
    singularityFacetedMat, singularityCoreEmissiveMat, singularityInnerWireMat, singularityPointMat,
    plasmaVortexMat, energyWaveMat, energyArcMat, coronaMat, criticalWhite,
    neonTubeMat, coreDiodeMat, arcCenterLogoMat, currentColor, targetColor,
    applyPbrBundle, applyGraphicsConfig, dispose,
  };
}
