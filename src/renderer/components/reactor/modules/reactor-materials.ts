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
  darkCarbon: THREE.MeshStandardMaterial;
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

  // 1. Black Anodized Titanium — legible dark obsidian graphite (never crushed 0x050507)
  const anodizedBlack = new THREE.MeshStandardMaterial({
    color: 0xd8dce4,
    metalness: 0.88,
    roughness: 0.34,
    normalScale: new THREE.Vector2(0.55, 0.55),
    aoMapIntensity: 0.75,
    envMapIntensity: 0.95,
  });

  // 2. Brushed Titanium — directional anisotropic sheen + crisp chamfer highlights
  const brushedTitanium = new THREE.MeshPhysicalMaterial({
    color: 0xd8dee8,
    metalness: 0.92,
    roughness: 0.28,
    anisotropy: 0.55,
    anisotropyRotation: 0.0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.36,
    normalScale: new THREE.Vector2(0.45, 0.45),
    aoMapIntensity: 0.65,
    envMapIntensity: 1.2,
  });

  // 3. Structural Ring Trim — satin gunmetal
  const ringFrameMat = new THREE.MeshStandardMaterial({
    color: 0x222630,
    metalness: 0.94,
    roughness: 0.22,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    envMapIntensity: 1.05,
  });

  // 4. Industrial 2x2 Diagonal Twill Carbon Fiber
  const darkCarbon = new THREE.MeshStandardMaterial({
    color: 0xd0d4dc,
    metalness: 0.38,
    roughness: 0.48,
    normalScale: new THREE.Vector2(0.65, 0.65),
    envMapIntensity: 0.72,
  });

  // 5. Matte Dark Ceramic — dielectric material contrast separating metallic plates
  const darkCeramic = new THREE.MeshStandardMaterial({
    color: 0xc8ccd2,
    metalness: 0.08,
    roughness: 0.78,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 0.42,
  });

  // 6. Copper / Industrial Alloy — restrained metallic accent for windings & cooling fins
  const copperWinding = new THREE.MeshStandardMaterial({
    color: 0xd6b08c,
    metalness: 0.93,
    roughness: 0.28,
    normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 1.25,
  });

  const microMeshMat = new THREE.MeshStandardMaterial({ color: 0x1e212a, metalness: 0.88, roughness: 0.22, wireframe: true });
  const heatTintedMetal = new THREE.MeshStandardMaterial({
    color: 0x262932, metalness: 0.94, roughness: 0.3, emissive: 0x090705,
    normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.95,
  });

  // 7. Smoked Optical Glass — Fresnel clearcoat; physical transmission enabled only on HW GPUs
  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x161820, metalness: 0.05, roughness: 0.07, ior: 1.52, reflectivity: 0.85,
    clearcoat: 1.0, clearcoatRoughness: 0.06, transmission: 0.0, thickness: 0.65,
    transparent: true, opacity: 0.3, depthWrite: false, envMapIntensity: 1.35,
  });
  const outerGlassRingMat = new THREE.MeshPhysicalMaterial({
    color: 0x16141d, metalness: 0.12, roughness: 0.06, ior: 1.5, clearcoat: 1.0,
    clearcoatRoughness: 0.05, reflectivity: 0.9, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.NormalBlending, envMapIntensity: 1.3,
  });
  const darkGlassOuter = new THREE.MeshStandardMaterial({
    color: 0x0d0e14, metalness: 0.72, roughness: 0.12, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.NormalBlending,
  });
  const darkGlassInner = new THREE.MeshStandardMaterial({
    color: 0x0a0b10, metalness: 0.78, roughness: 0.14, transparent: true, opacity: 0.28,
    depthWrite: false, blending: THREE.NormalBlending,
  });

  // Core Singularity & Emissive Materials
  const singularityFacetedMat = new THREE.MeshStandardMaterial({
    color: 0x0e1016, metalness: 0.92, roughness: 0.16, emissive: 0x000000, emissiveIntensity: 0.0,
    flatShading: true, transparent: true, opacity: 0.96,
  });
  const singularityCoreEmissiveMat = new THREE.MeshStandardMaterial({
    color: currentColor.getHex(), map: plasmaEnergyMap, emissive: 0x000000, emissiveIntensity: 0.0,
    roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0.95,
  });
  const singularityInnerWireMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
  });
  const plasmaVortexMat = new THREE.MeshStandardMaterial({
    color: currentColor.getHex(), map: plasmaEnergyMap, emissive: 0x000000, emissiveIntensity: 0.0,
    roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const energyWaveMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const energyArcMat = new THREE.LineBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, linewidth: 2, blending: THREE.AdditiveBlending,
  });
  const singularityPointMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const coronaMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const criticalWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.0 });
  const neonTubeMat = new THREE.MeshStandardMaterial({
    color: 0x2b090e, emissive: 0x000000, emissiveIntensity: 0.0, roughness: 0.18, metalness: 0.12,
  });
  const coreDiodeMat = new THREE.MeshStandardMaterial({
    color: 0x2b090e, emissive: 0x000000, emissiveIntensity: 0.0, roughness: 0.14, metalness: 0.12,
  });
  const arcCenterLogoMat = new THREE.MeshBasicMaterial({
    map: arcCenterLogoMap, color: 0xd4d4dc, transparent: true, opacity: 0.92,
    blending: THREE.NormalBlending, side: THREE.DoubleSide, depthWrite: false,
  });

  const applyPbrBundle = (bundle: ReactorPbrTextureBundle) => {
    anodizedBlack.map = bundle.anodized.albedo;
    anodizedBlack.normalMap = bundle.anodized.normal;
    anodizedBlack.roughnessMap = bundle.anodized.roughness;
    anodizedBlack.aoMap = bundle.anodized.ao ?? null;
    anodizedBlack.needsUpdate = true;

    brushedTitanium.map = bundle.brushedTitanium.albedo;
    brushedTitanium.normalMap = bundle.brushedTitanium.normal;
    brushedTitanium.roughnessMap = bundle.brushedTitanium.roughness;
    brushedTitanium.aoMap = bundle.brushedTitanium.ao ?? null;
    brushedTitanium.needsUpdate = true;

    ringFrameMat.normalMap = bundle.brushedTitanium.normal;
    ringFrameMat.roughnessMap = bundle.brushedTitanium.roughness;
    ringFrameMat.needsUpdate = true;

    darkCarbon.map = bundle.carbon.albedo;
    darkCarbon.normalMap = bundle.carbon.normal;
    darkCarbon.roughnessMap = bundle.carbon.roughness;
    darkCarbon.needsUpdate = true;

    darkCeramic.map = bundle.ceramic.albedo;
    darkCeramic.normalMap = bundle.ceramic.normal;
    darkCeramic.roughnessMap = bundle.ceramic.roughness;
    darkCeramic.needsUpdate = true;

    copperWinding.map = bundle.copper.albedo;
    copperWinding.normalMap = bundle.copper.normal;
    copperWinding.roughnessMap = bundle.copper.roughness;
    copperWinding.needsUpdate = true;

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
    anodizedBlack.envMapIntensity = 0.95 * envScale;
    brushedTitanium.envMapIntensity = 1.25 * envScale;
    ringFrameMat.envMapIntensity = 1.05 * envScale;
    darkCarbon.envMapIntensity = 0.72 * envScale;
    darkCeramic.envMapIntensity = 0.42 * envScale;
    copperWinding.envMapIntensity = 1.28 * envScale;
    heatTintedMetal.envMapIntensity = 0.95 * envScale;
    opticGlass.envMapIntensity = 1.35 * envScale;
    outerGlassRingMat.envMapIntensity = 1.3 * envScale;
    neonTubeMat.envMapIntensity = 1.0 * envScale;
    coreDiodeMat.envMapIntensity = 1.0 * envScale;

    const allowTransmission = !caps?.isSoftwareGl && config.pmremQuality !== 'eco';
    const nextTransmission = allowTransmission ? 0.45 : 0.0;
    if (opticGlass.transmission !== nextTransmission) {
      opticGlass.transmission = nextTransmission;
      opticGlass.opacity = allowTransmission ? 0.42 : 0.3;
      opticGlass.needsUpdate = true;
    }

    brushedTitanium.anisotropy = config.pmremQuality === 'eco' ? 0.0 : 0.6;
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
