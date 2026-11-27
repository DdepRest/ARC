import * as THREE from 'three';
import {
  createHolographicReticleTexture,
  createTriangularReticleTexture,
  createArcCenterLogoTexture,
} from '../reactorTextures';
import { themeAccentHex, getThemeTextures } from './reactor-theme';
import { createCorePlasmaController, createCorePlasmaMaterials } from './reactor-core-plasma';
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
  plasmaOuterEnvelopeMat: THREE.MeshStandardMaterial;
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

  // 1. OBSIDIAN TITANIUM — Ultra-smooth dark anodized primary chassis (dominant surface area).
  const anodizedBlack = new THREE.MeshStandardMaterial({
    color: 0x37383a, metalness: 0.86, roughness: 0.380,
    normalScale: new THREE.Vector2(0.32, 0.32), aoMapIntensity: 0.88, envMapIntensity: 1.18,
  });

  // 2. BRUSHED TITANIUM — Reserved strictly for thin razor trims & chamber crown bezel.
  const brushedTitanium = new THREE.MeshPhysicalMaterial({
    color: 0x6a6b6c, metalness: 0.92, roughness: 0.274, anisotropy: 0.60, anisotropyRotation: 0.0,
    clearcoat: 0.12, clearcoatRoughness: 0.20, normalScale: new THREE.Vector2(0.38, 0.38),
    aoMapIntensity: 0.84, envMapIntensity: 1.48,
  });

  // 3. DARK GUNMETAL — Crisp dark-steel framing, arches, diagonal rails & structural brackets.
  const ringFrameMat = new THREE.MeshStandardMaterial({
    color: 0x4c5666, metalness: 0.89, roughness: 0.380, emissive: 0x000000, emissiveIntensity: 0.0,
    normalScale: new THREE.Vector2(0.34, 0.34), envMapIntensity: 1.26,
  });

  // 4. CARBON COMPOSITE — Deepest recessed 3K 2x2 diagonal twill weave trays & service decks.
  const darkCarbon = new THREE.MeshPhysicalMaterial({
    color: 0x212122, metalness: 0.11, roughness: 0.452, clearcoat: 0.22, clearcoatRoughness: 0.28,
    normalScale: new THREE.Vector2(0.62, 0.62), aoMapIntensity: 0.90, envMapIntensity: 0.76,
  });

  // 5. OBSIDIAN CERAMIC — Ultra-matte recessed cavities, chamber well & trench beds.
  const darkCeramic = new THREE.MeshStandardMaterial({
    color: 0x2c2c2c, metalness: 0.03, roughness: 0.880,
    normalScale: new THREE.Vector2(0.34, 0.34), envMapIntensity: 0.22,
  });

  // 6. SMOKED COPPER — Rare functional electrical contacts, coils & grounding studs.
  const copperWinding = new THREE.MeshStandardMaterial({
    color: 0x785f4e, metalness: 0.91, roughness: 0.311,
    normalScale: new THREE.Vector2(0.36, 0.36), envMapIntensity: 1.32,
  });

  const microMeshMat = new THREE.MeshStandardMaterial({
    color: 0x181c24, metalness: 0.86, roughness: 0.34, wireframe: true,
  });

  // Tempered dark shroud for outer substation housings (distinct step between obsidian cradle & gunmetal saddle).
  const heatTintedMetal = new THREE.MeshStandardMaterial({
    color: 0x3a4252, metalness: 0.88, roughness: 0.380, emissive: 0x000000,
    normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: 1.12,
  });

  // 7. SMOKED OPTICAL GLASS — Premultiplied physical Fresnel rim + subtle diagonal sheen (transmission=0).
  const opticGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0b0f16, metalness: 0.0, roughness: 0.06, ior: 1.64, reflectivity: 0.94,
    specularIntensity: 1.0, specularColor: new THREE.Color(0xeaf0f8),
    clearcoat: 1.0, clearcoatRoughness: 0.03, transmission: 0.0, thickness: 0.34,
    transparent: true, opacity: 0.16, premultipliedAlpha: true, depthWrite: false, envMapIntensity: 1.75,
  });
  opticGlass.customProgramCacheKey = () => 'arc-optic-glass-fresnel-v1';
  opticGlass.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('#include <opaque_fragment>')) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `vec3 arcSpecCoat = max( outgoingLight - totalDiffuse, vec3( 0.0 ) );
      float arcDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
      float arcRimFresnel = pow( 1.0 - arcDotNV, 1.70 );
      vec3 arcBevelGlint = vec3( 0.84, 0.88, 0.95 ) * arcRimFresnel * 0.58;
      float arcDiagPos = dot( geometryPosition.xy, vec2( 0.66, 0.75 ) ) + dot( geometryViewDir.xy, vec2( 3.5, 3.5 ) ) - 0.14;
      float arcDiagBand = smoothstep( -0.58, -0.04, arcDiagPos ) * ( 1.0 - smoothstep( 0.08, 0.54, arcDiagPos ) )
        + smoothstep( 0.36, 0.56, arcDiagPos ) * ( 1.0 - smoothstep( 0.62, 0.88, arcDiagPos ) ) * 0.42;
      float arcEnvGain = 1.0;
      #ifdef USE_ENVMAP
        arcEnvGain = clamp( envMapIntensity * 0.60, 0.55, 1.45 );
      #endif
      vec3 arcDiagSheen = vec3( 0.88, 0.91, 0.96 ) * arcDiagBand * ( 0.048 * arcEnvGain ) * smoothstep( 0.60, 0.94, arcDotNV );
      vec3 arcGlassRefl = arcSpecCoat + arcBevelGlint + arcDiagSheen;
      float arcSpecLuma = dot( arcGlassRefl, vec3( 0.2126, 0.7152, 0.0722 ) );
      outgoingLight = totalDiffuse * diffuseColor.a + arcGlassRefl;
      diffuseColor.a = clamp( diffuseColor.a + arcRimFresnel * 0.50 + arcSpecLuma * 0.22, diffuseColor.a, 0.85 );
      #include <opaque_fragment>`
    );
    if (shader.fragmentShader.includes('#include <premultiplied_alpha_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <premultiplied_alpha_fragment>',
        '/* ARC-053/055: physically premultiplied in opaque_fragment */'
      );
    }
  };

  const outerGlassRingMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1016, metalness: 0.03, roughness: 0.07, ior: 1.56, clearcoat: 1.0,
    clearcoatRoughness: 0.05, reflectivity: 0.88, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.NormalBlending, envMapIntensity: 1.05,
  });
  const darkGlassOuter = new THREE.MeshStandardMaterial({
    color: 0x0e1015, metalness: 0.65, roughness: 0.15, transparent: true, opacity: 0.20,
    depthWrite: false, blending: THREE.NormalBlending,
  });
  const darkGlassInner = new THREE.MeshStandardMaterial({
    color: 0x0b0d12, metalness: 0.7, roughness: 0.16, transparent: true, opacity: 0.22,
    depthWrite: false, blending: THREE.NormalBlending,
  });

  // Core Cavity, White-Hot Plasma Source & Independent Plasma Layer Materials (ARC-056/057)
  const singularityFacetedMat = new THREE.MeshStandardMaterial({
    color: 0x1e222a, metalness: 0.88, roughness: 0.26, emissive: 0x000000, emissiveIntensity: 0.0,
    flatShading: true, transparent: false, envMapIntensity: 1.10,
  });
  const singularityInnerWireMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), wireframe: true, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const energyWaveMat = new THREE.MeshBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const energyArcMat = new THREE.LineBasicMaterial({
    color: currentColor.getHex(), transparent: true, opacity: 0.0, linewidth: 2,
    blending: THREE.AdditiveBlending,
  });
  const {
    singularityCoreEmissiveMat,
    singularityPointMat,
    plasmaOuterEnvelopeMat,
    plasmaVortexMat,
  } = createCorePlasmaMaterials(currentColor.getHex(), plasmaEnergyMap);
  const corePlasma = createCorePlasmaController(
    { singularityCoreEmissiveMat, singularityPointMat, plasmaOuterEnvelopeMat, plasmaVortexMat },
    0.54,
    'balanced'
  );

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
    color: 0x380e14,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.18,
    metalness: 0.14,
  });

  const coreDiodeMat = new THREE.MeshStandardMaterial({
    color: 0x3e1017,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.15,
    metalness: 0.16,
  });

  const arcCenterLogoMat = new THREE.MeshBasicMaterial({
    map: arcCenterLogoMap,
    color: 0xe2e7f0,
    transparent: true,
    opacity: 0.95,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  /**
   * Binds calibrated PBR maps.
   * CRITICAL: Sets `roughness = 1.0` so Three.js uses the physical roughnessMap directly
   * (preventing roughness*roughnessMap double-multiplication mirror artifacts),
   * and sets `color = 0xffffff` on albedo-mapped materials so sRGB albedo maps stay calibrated.
   * Dark Gunmetal (`ringFrameMat`) shares `bundle.anodized.normal` & `bundle.anodized.roughness`
   * (0.34..0.42 ultra-smooth satin finish) while keeping its dedicated dark-steel color `0x4c5666`.
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
    ringFrameMat.normalMap = bundle.anodized.normal;
    ringFrameMat.roughnessMap = bundle.anodized.roughness;
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
    anodizedBlack.envMapIntensity = 1.18 * envScale;
    brushedTitanium.envMapIntensity = 1.48 * envScale;
    ringFrameMat.envMapIntensity = 1.26 * envScale;
    darkCarbon.envMapIntensity = 0.76 * envScale;
    darkCeramic.envMapIntensity = 0.22 * envScale;
    copperWinding.envMapIntensity = 1.32 * envScale;
    heatTintedMetal.envMapIntensity = 1.12 * envScale;
    singularityFacetedMat.envMapIntensity = 1.10 * envScale;
    opticGlass.envMapIntensity = 1.75 * envScale;
    outerGlassRingMat.envMapIntensity = 1.05 * envScale;
    neonTubeMat.envMapIntensity = 0.85 * envScale;
    coreDiodeMat.envMapIntensity = 0.85 * envScale;

    // ARC-053/055: keep transmission=0 permanently (alpha-blended optical glass without extra pass)
    if (opticGlass.transmission !== 0.0) {
      opticGlass.transmission = 0.0;
      opticGlass.needsUpdate = true;
    }
    opticGlass.opacity = 0.16;

    brushedTitanium.anisotropy = config.pmremQuality === 'eco' ? 0.0 : 0.60;
    plasmaOuterEnvelopeMat.roughness = config.glslPlasmaShader ? 0.10 : 0.16;
    plasmaVortexMat.roughness = config.glslPlasmaShader ? 0.06 : 0.14;
    plasmaVortexMat.metalness = config.glslPlasmaShader ? 0.88 : 0.75;
    corePlasma.applyGraphicsConfig(config, maxHwAniso, minFilter);
  };

  // Single-owner rule: materials.dispose() disposes ONLY THREE.Material instances.
  const dispose = () => {
    [
      anodizedBlack, brushedTitanium, ringFrameMat, darkCarbon, darkCeramic, copperWinding,
      microMeshMat, heatTintedMetal, opticGlass, outerGlassRingMat, darkGlassOuter,
      darkGlassInner, singularityFacetedMat, singularityCoreEmissiveMat,
      singularityInnerWireMat, plasmaOuterEnvelopeMat, plasmaVortexMat, energyWaveMat, energyArcMat,
      singularityPointMat, coronaMat, criticalWhite, neonTubeMat, coreDiodeMat, arcCenterLogoMat,
    ].forEach((m) => m.dispose());
  };

  return {
    glowParticleMap, holoReticleMap, triangularReticleMap, plasmaEnergyMap, arcCenterLogoMap,
    anodizedBlack, brushedTitanium, ringFrameMat, darkCarbon, darkCeramic, copperWinding,
    microMeshMat, heatTintedMetal, opticGlass, outerGlassRingMat, darkGlassOuter, darkGlassInner,
    singularityFacetedMat, singularityCoreEmissiveMat, singularityInnerWireMat, singularityPointMat,
    plasmaOuterEnvelopeMat, plasmaVortexMat, energyWaveMat, energyArcMat, coronaMat, criticalWhite,
    neonTubeMat, coreDiodeMat, arcCenterLogoMat, currentColor, targetColor,
    applyPbrBundle, applyGraphicsConfig, dispose,
  };
}
