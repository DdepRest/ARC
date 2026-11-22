export type GraphicsPreset = 'Eco' | 'Balanced' | 'Cinematic';

export type GraphicsAoMode = 'off' | 'light' | 'gtao';
export type GraphicsShadowQuality = 'off' | 'contact' | 'soft1024' | 'soft2048';
export type GraphicsPmremQuality = 'eco' | 'standard' | 'high';
export type GraphicsLightTier = 'eco' | 'standard' | 'full';
export type GraphicsTextureResolution = 256 | 512 | 1024 | 2048;

export interface GraphicsConfig {
  // 1. Anti-Aliasing & Resolution Scaling
  msaaSamples: 0 | 2 | 4;
  fxaaEnabled: boolean;
  targetDpr: 1.0 | 1.15 | 1.25 | 'auto';
  renderScale: 0.75 | 0.85 | 0.95 | 1.0 | 1.15 | 1.25;

  // 2. PBR Textures & Studio Environment
  textureResolution: GraphicsTextureResolution;
  anisotropy: 1 | 2 | 4 | 8 | 16;
  trilinearFiltering: boolean;
  pmremQuality: GraphicsPmremQuality;
  envMapIntensity: number; // 50..150 (%)

  // 3. Post-Processing, Shadows & Lighting
  bloomEnabled: boolean;
  bloomStrength: number; // 50..150 (%)
  bloomRadius: number; // 0.2..0.8
  bloomThreshold: number; // 0.35..0.85
  bloomResolutionScale: 0.35 | 0.5 | 0.65 | 0.8 | 1.0;
  aoMode: GraphicsAoMode;
  shadowQuality: GraphicsShadowQuality;
  volumetricRays: boolean;
  colorGrading: boolean;
  vignetteStrength: number; // 0..0.35
  dofEnabled: boolean; // False in permanent presets; enabled only in Showcase override
  colorBufferPrecision: 'halfFloat' | 'unsignedByte';
  dynamicPointLights: GraphicsLightTier;

  // 4. Shaders, Physics & Particles
  glslPlasmaShader: boolean;
  sphericalHarmonics: boolean;
  springPhysics: boolean;
  shockwavesEnabled: boolean;
  spatialAudioBands: boolean;
  particleDensity: 0 | 25 | 50 | 60 | 100;
}

export const GRAPHICS_STORAGE_KEYS = {
  presetV10: 'arc_graphics_preset_v10',
  configV10: 'arc_graphics_config_v10',
  userSelectedV10: 'arc_graphics_user_selected_v10',
  legacyConfigV9: 'arc_graphics_config_v9',
} as const;

export const GRAPHICS_PRESET_ORDER: readonly GraphicsPreset[] = ['Eco', 'Balanced', 'Cinematic'] as const;

export const GRAPHICS_PRESETS: Record<GraphicsPreset, GraphicsConfig> = {
  Eco: {
    msaaSamples: 0,
    fxaaEnabled: true,
    targetDpr: 1.0,
    renderScale: 0.85,
    textureResolution: 512,
    anisotropy: 2,
    trilinearFiltering: false,
    pmremQuality: 'eco',
    envMapIntensity: 75,
    bloomEnabled: true,
    bloomStrength: 75,
    bloomRadius: 0.35,
    bloomThreshold: 0.62,
    bloomResolutionScale: 0.35,
    aoMode: 'off',
    shadowQuality: 'off',
    volumetricRays: false,
    colorGrading: false,
    vignetteStrength: 0,
    dofEnabled: false,
    colorBufferPrecision: 'unsignedByte',
    dynamicPointLights: 'eco',
    glslPlasmaShader: false,
    sphericalHarmonics: false,
    springPhysics: true,
    shockwavesEnabled: false,
    spatialAudioBands: true,
    particleDensity: 25,
  },
  Balanced: {
    msaaSamples: 2,
    fxaaEnabled: false,
    targetDpr: 'auto',
    renderScale: 1.0,
    textureResolution: 1024,
    anisotropy: 8,
    trilinearFiltering: true,
    pmremQuality: 'standard',
    envMapIntensity: 100,
    bloomEnabled: true,
    bloomStrength: 100,
    bloomRadius: 0.45,
    bloomThreshold: 0.56,
    bloomResolutionScale: 0.5,
    aoMode: 'light',
    shadowQuality: 'contact',
    volumetricRays: false,
    colorGrading: true,
    vignetteStrength: 0.12,
    dofEnabled: false,
    colorBufferPrecision: 'halfFloat',
    dynamicPointLights: 'standard',
    glslPlasmaShader: true,
    sphericalHarmonics: false,
    springPhysics: true,
    shockwavesEnabled: true,
    spatialAudioBands: true,
    particleDensity: 60,
  },
  Cinematic: {
    msaaSamples: 4,
    fxaaEnabled: true,
    targetDpr: 1.25,
    renderScale: 1.0,
    textureResolution: 1024,
    anisotropy: 16,
    trilinearFiltering: true,
    pmremQuality: 'high',
    envMapIntensity: 120,
    bloomEnabled: true,
    bloomStrength: 115,
    bloomRadius: 0.55,
    bloomThreshold: 0.52,
    bloomResolutionScale: 0.65,
    aoMode: 'gtao',
    shadowQuality: 'soft1024',
    volumetricRays: true,
    colorGrading: true,
    vignetteStrength: 0.18,
    dofEnabled: false,
    colorBufferPrecision: 'halfFloat',
    dynamicPointLights: 'full',
    glslPlasmaShader: true,
    sphericalHarmonics: true,
    springPhysics: true,
    shockwavesEnabled: true,
    spatialAudioBands: true,
    particleDensity: 100,
  },
};

/**
 * Runtime-only temporary Showcase configuration override.
 * Never persisted to localStorage and never part of GRAPHICS_PRESETS.
 */
export const SHOWCASE_CONFIG_OVERRIDE: Readonly<GraphicsConfig> = Object.freeze({
  msaaSamples: 4,
  fxaaEnabled: true,
  targetDpr: 1.25,
  renderScale: 1.15,
  textureResolution: 2048,
  anisotropy: 16,
  trilinearFiltering: true,
  pmremQuality: 'high',
  envMapIntensity: 135,
  bloomEnabled: true,
  bloomStrength: 125,
  bloomRadius: 0.6,
  bloomThreshold: 0.48,
  bloomResolutionScale: 0.8,
  aoMode: 'gtao',
  shadowQuality: 'soft2048',
  volumetricRays: true,
  colorGrading: true,
  vignetteStrength: 0.22,
  dofEnabled: true,
  colorBufferPrecision: 'halfFloat',
  dynamicPointLights: 'full',
  glslPlasmaShader: true,
  sphericalHarmonics: true,
  springPhysics: true,
  shockwavesEnabled: true,
  spatialAudioBands: true,
  particleDensity: 100,
});

export interface GraphicsPresetMetadata {
  id: GraphicsPreset;
  code: string;
  titleRu: string;
  purposeRu: string;
  visualHighlightsRu: string;
  performanceLevelRu: string;
  specsRu: string;
  level: 1 | 2 | 3;
}

export const GRAPHICS_PRESET_META: Record<GraphicsPreset, GraphicsPresetMetadata> = {
  Eco: {
    id: 'Eco',
    code: 'ECO',
    titleRu: 'Экономичный',
    purposeRu: 'Ноутбуки, встроенная графика, тихий фоновый режим',
    visualHighlightsRu: 'Чистый промышленный PBR-контур, студийный свет, чёткий логотип A.R.C. без тяжёлых проходов',
    performanceLevelRu: 'Минимальная нагрузка · 60 FPS приоритет',
    specsRu: 'FXAA · Scale 85% · Tex 512 · AO Выкл · Тени Выкл',
    level: 1,
  },
  Balanced: {
    id: 'Balanced',
    code: 'BALANCED',
    titleRu: 'Сбалансированный',
    purposeRu: 'Основной повседневный режим для постоянной работы помощника',
    visualHighlightsRu: 'Полный PBR-набор, студийный PMREM, MSAA 2x, 16-bit HDR, лёгкий GTAO и контактная глубина',
    performanceLevelRu: 'Оптимальный баланс · Стабильные 60 FPS',
    specsRu: 'MSAA 2x · Scale 100% · Tex 1024 · Light AO · HDR',
    level: 2,
  },
  Cinematic: {
    id: 'Cinematic',
    code: 'CINEMATIC',
    titleRu: 'Кинематографичный',
    purposeRu: 'Дискретные GPU, максимальное постоянное качество без стресс-теста',
    visualHighlightsRu: 'HD PMREM, мягкие тени 1024, GTAO, объёмные лучи, цветокоррекция, MSAA 4x + FXAA, полный свет',
    performanceLevelRu: 'Высокая нагрузка · Дискретные GPU',
    specsRu: 'MSAA 4x + FXAA · DPR 1.25x · GTAO · Тени 1024 · Лучи',
    level: 3,
  },
};

export function isValidGraphicsPreset(value: unknown): value is GraphicsPreset {
  return value === 'Eco' || value === 'Balanced' || value === 'Cinematic';
}

export function resolveValidGraphicsPreset(
  value: unknown,
  fallbackConfig?: Partial<GraphicsConfig> | Partial<Record<string, unknown>> | null
): GraphicsPreset {
  if (isValidGraphicsPreset(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const mapped = mapLegacyPresetName(value);
    if (mapped === 'Eco' || mapped === 'Balanced' || mapped === 'Cinematic') {
      return mapped;
    }
    if (mapped === 'Custom' && fallbackConfig && typeof fallbackConfig === 'object') {
      return detectClosestPreset(fallbackConfig);
    }
  }
  if (fallbackConfig && typeof fallbackConfig === 'object') {
    return detectClosestPreset(fallbackConfig);
  }
  return 'Balanced';
}

export function cloneGraphicsConfig(config: GraphicsConfig | null | undefined): GraphicsConfig {
  if (!config || typeof config !== 'object') {
    return { ...GRAPHICS_PRESETS.Balanced };
  }
  return { ...config };
}

export function isSameGraphicsConfig(
  a: GraphicsConfig | null | undefined,
  b: GraphicsConfig | null | undefined
): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const keys = Object.keys(GRAPHICS_PRESETS.Balanced) as Array<keyof GraphicsConfig>;
  return keys.every((k) => {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') {
      return Math.abs(va - vb) < 0.001;
    }
    return va === vb;
  });
}

export function isPresetModified(
  preset: GraphicsPreset | string | null | undefined,
  config: GraphicsConfig | null | undefined
): boolean {
  const safePreset = resolveValidGraphicsPreset(preset, config);
  const presetConfig = GRAPHICS_PRESETS[safePreset];
  if (!config || typeof config !== 'object') {
    return false;
  }
  return !isSameGraphicsConfig(config, presetConfig);
}

export function normalizeGraphicsConfig(
  rawInput: Partial<GraphicsConfig> | Partial<Record<string, unknown>> | null | undefined,
  basePreset: GraphicsPreset = 'Balanced'
): GraphicsConfig {
  const safeBasePreset: GraphicsPreset = isValidGraphicsPreset(basePreset) ? basePreset : 'Balanced';
  const base = cloneGraphicsConfig(GRAPHICS_PRESETS[safeBasePreset]);
  if (!rawInput || typeof rawInput !== 'object') return base;
  const raw = rawInput as Partial<Record<string, unknown>>;

  const num = (v: unknown, fallback: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

  if (raw.msaaSamples === 0 || raw.msaaSamples === 2 || raw.msaaSamples === 4) {
    base.msaaSamples = raw.msaaSamples;
  } else if (raw.msaaSamples === 8) {
    base.msaaSamples = 4;
  }

  if (typeof raw.fxaaEnabled === 'boolean') base.fxaaEnabled = raw.fxaaEnabled;

  if (raw.targetDpr === 'auto' || raw.targetDpr === 1.0 || raw.targetDpr === 1.15 || raw.targetDpr === 1.25) {
    base.targetDpr = raw.targetDpr;
  } else if (typeof raw.targetDpr === 'number' && raw.targetDpr > 1.25) {
    base.targetDpr = 1.25;
  }

  if (
    raw.renderScale === 0.75 ||
    raw.renderScale === 0.85 ||
    raw.renderScale === 0.95 ||
    raw.renderScale === 1.0 ||
    raw.renderScale === 1.15 ||
    raw.renderScale === 1.25
  ) {
    base.renderScale = raw.renderScale;
  } else if (typeof raw.renderScale === 'number') {
    if (raw.renderScale <= 0.78) base.renderScale = 0.75;
    else if (raw.renderScale <= 0.9) base.renderScale = 0.85;
    else if (raw.renderScale <= 1.05) base.renderScale = 1.0;
    else if (raw.renderScale <= 1.2) base.renderScale = 1.15;
    else base.renderScale = 1.25;
  }

  if (raw.textureResolution === 256 || raw.textureResolution === 512 || raw.textureResolution === 1024 || raw.textureResolution === 2048) {
    base.textureResolution = raw.textureResolution;
  }

  if (raw.anisotropy === 1 || raw.anisotropy === 2 || raw.anisotropy === 4 || raw.anisotropy === 8 || raw.anisotropy === 16) {
    base.anisotropy = raw.anisotropy;
  }

  if (typeof raw.trilinearFiltering === 'boolean') base.trilinearFiltering = raw.trilinearFiltering;

  if (raw.pmremQuality === 'eco' || raw.pmremQuality === 'standard' || raw.pmremQuality === 'high') {
    base.pmremQuality = raw.pmremQuality;
  } else if (raw.pmremQuality === 'off') {
    base.pmremQuality = 'eco';
  }

  base.envMapIntensity = Math.round(num(raw.envMapIntensity, base.envMapIntensity, 50, 150));

  if (typeof raw.bloomEnabled === 'boolean') base.bloomEnabled = raw.bloomEnabled;
  base.bloomStrength = Math.round(num(raw.bloomStrength, base.bloomStrength, 50, 150));
  base.bloomRadius = Number(num(raw.bloomRadius, base.bloomRadius, 0.2, 0.8).toFixed(2));
  base.bloomThreshold = Number(num(raw.bloomThreshold, base.bloomThreshold, 0.35, 0.85).toFixed(2));

  if (
    raw.bloomResolutionScale === 0.35 ||
    raw.bloomResolutionScale === 0.5 ||
    raw.bloomResolutionScale === 0.65 ||
    raw.bloomResolutionScale === 0.8 ||
    raw.bloomResolutionScale === 1.0
  ) {
    base.bloomResolutionScale = raw.bloomResolutionScale;
  }

  if (raw.aoMode === 'off' || raw.aoMode === 'light' || raw.aoMode === 'gtao') {
    base.aoMode = raw.aoMode;
  }

  if (raw.shadowQuality === 'off' || raw.shadowQuality === 'contact' || raw.shadowQuality === 'soft1024' || raw.shadowQuality === 'soft2048') {
    base.shadowQuality = raw.shadowQuality;
  }

  if (typeof raw.volumetricRays === 'boolean') base.volumetricRays = raw.volumetricRays;
  if (typeof raw.colorGrading === 'boolean') base.colorGrading = raw.colorGrading;
  base.vignetteStrength = Number(num(raw.vignetteStrength, base.vignetteStrength, 0, 0.35).toFixed(2));
  // Permanent persisted configs never keep Showcase DOF forced on
  base.dofEnabled = false;

  if (raw.colorBufferPrecision === 'halfFloat' || raw.colorBufferPrecision === 'unsignedByte') {
    base.colorBufferPrecision = raw.colorBufferPrecision;
  }

  if (raw.dynamicPointLights === 'eco' || raw.dynamicPointLights === 'standard' || raw.dynamicPointLights === 'full') {
    base.dynamicPointLights = raw.dynamicPointLights;
  }

  if (typeof raw.glslPlasmaShader === 'boolean') base.glslPlasmaShader = raw.glslPlasmaShader;
  if (typeof raw.sphericalHarmonics === 'boolean') base.sphericalHarmonics = raw.sphericalHarmonics;
  if (typeof raw.springPhysics === 'boolean') base.springPhysics = raw.springPhysics;
  if (typeof raw.shockwavesEnabled === 'boolean') base.shockwavesEnabled = raw.shockwavesEnabled;
  if (typeof raw.spatialAudioBands === 'boolean') base.spatialAudioBands = raw.spatialAudioBands;

  if (raw.particleDensity === 0 || raw.particleDensity === 25 || raw.particleDensity === 50 || raw.particleDensity === 60 || raw.particleDensity === 100) {
    base.particleDensity = raw.particleDensity;
  } else if (typeof raw.particleDensity === 'number') {
    if (raw.particleDensity <= 10) base.particleDensity = 0;
    else if (raw.particleDensity <= 35) base.particleDensity = 25;
    else if (raw.particleDensity <= 55) base.particleDensity = 50;
    else if (raw.particleDensity <= 80) base.particleDensity = 60;
    else base.particleDensity = 100;
  }

  return base;
}

/**
 * Finds the nearest permanent preset ('Eco' | 'Balanced' | 'Cinematic')
 * for legacy Custom configs based on weighted GPU load distance.
 */
export function detectClosestPreset(
  raw: Partial<GraphicsConfig> | Partial<Record<string, unknown>> | null | undefined
): GraphicsPreset {
  if (!raw || typeof raw !== 'object') return 'Balanced';
  const candidate = normalizeGraphicsConfig(raw, 'Balanced');
  const candidateScore = estimateGpuLoadScore(candidate).percent;

  let best: GraphicsPreset = 'Balanced';
  let bestDist = Number.POSITIVE_INFINITY;

  for (const preset of GRAPHICS_PRESET_ORDER) {
    const presetScore = estimateGpuLoadScore(GRAPHICS_PRESETS[preset]).percent;
    const dist = Math.abs(candidateScore - presetScore);
    if (dist < bestDist) {
      bestDist = dist;
      best = preset;
    }
  }
  return best;
}

export function mapLegacyPresetName(legacyName: string | null | undefined): GraphicsPreset | 'Custom' | null {
  if (!legacyName) return null;
  switch (legacyName) {
    case 'Eco':
    case 'Low':
      return 'Eco';
    case 'Balanced':
    case 'Medium':
    case 'High':
      return 'Balanced';
    case 'Cinematic':
    case 'Ultra':
    case 'UltraPlus':
      return 'Cinematic';
    case 'Custom':
      return 'Custom';
    default:
      return null;
  }
}

export interface MigratedGraphicsState {
  preset: GraphicsPreset;
  config: GraphicsConfig;
  userSelected: boolean;
  migratedFromLegacy: boolean;
}

/**
 * Deterministic one-time migration from legacy v1..v9 storage to v10.
 * Writes v10 first and verifies readback; never corrupts or deletes legacy keys on failure.
 */
export function loadAndMigrateGraphicsStorage(storage?: Pick<Storage, 'getItem' | 'setItem'> | null): MigratedGraphicsState {
  const ls = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const fallback: MigratedGraphicsState = {
    preset: 'Balanced',
    config: cloneGraphicsConfig(GRAPHICS_PRESETS.Balanced),
    userSelected: false,
    migratedFromLegacy: false,
  };

  if (!ls) return fallback;

  try {
    const v10PresetRaw = ls.getItem(GRAPHICS_STORAGE_KEYS.presetV10);
    const v10ConfigRaw = ls.getItem(GRAPHICS_STORAGE_KEYS.configV10);
    const v10UserSelected = ls.getItem(GRAPHICS_STORAGE_KEYS.userSelectedV10) === 'true';

    if (isValidGraphicsPreset(v10PresetRaw)) {
      let config = cloneGraphicsConfig(GRAPHICS_PRESETS[v10PresetRaw]);
      if (v10ConfigRaw) {
        try {
          config = normalizeGraphicsConfig(JSON.parse(v10ConfigRaw), v10PresetRaw);
        } catch {
          config = cloneGraphicsConfig(GRAPHICS_PRESETS[v10PresetRaw]);
        }
      }
      return {
        preset: v10PresetRaw,
        config,
        userSelected: v10UserSelected,
        migratedFromLegacy: false,
      };
    }

    // Read legacy v9..v1 keys
    const legacyPresetRaw =
      ls.getItem('arc_graphics_preset_v9') ||
      ls.getItem('arc_graphics_preset_v8') ||
      ls.getItem('arc_graphics_preset_v7') ||
      ls.getItem('arc_graphics_preset_v6') ||
      ls.getItem('arc_graphics_preset_v5') ||
      ls.getItem('arc_graphics_preset_v4') ||
      ls.getItem('arc_graphics_preset_v3') ||
      ls.getItem('arc_graphics_preset_v2') ||
      ls.getItem('arc_graphics_preset_v1');

    const legacyConfigRaw = ls.getItem(GRAPHICS_STORAGE_KEYS.legacyConfigV9);
    let parsedLegacyConfig: Partial<Record<string, unknown>> | null = null;
    if (legacyConfigRaw) {
      try {
        const parsed = JSON.parse(legacyConfigRaw);
        if (parsed && typeof parsed === 'object') {
          parsedLegacyConfig = parsed;
        }
      } catch {
        parsedLegacyConfig = null;
      }
    }

    const mapped = mapLegacyPresetName(legacyPresetRaw);
    let targetPreset: GraphicsPreset = 'Balanced';
    let targetConfig: GraphicsConfig = cloneGraphicsConfig(GRAPHICS_PRESETS.Balanced);
    let migratedFromLegacy = false;
    let userSelected = false;

    if (mapped === 'Eco' || mapped === 'Balanced' || mapped === 'Cinematic') {
      targetPreset = mapped;
      targetConfig = cloneGraphicsConfig(GRAPHICS_PRESETS[mapped]);
      migratedFromLegacy = true;
      userSelected = true;
    } else if (mapped === 'Custom' || parsedLegacyConfig) {
      targetPreset = detectClosestPreset(parsedLegacyConfig);
      targetConfig = parsedLegacyConfig
        ? normalizeGraphicsConfig(parsedLegacyConfig, targetPreset)
        : cloneGraphicsConfig(GRAPHICS_PRESETS[targetPreset]);
      migratedFromLegacy = true;
      userSelected = true;
    } else if (legacyPresetRaw !== null || legacyConfigRaw !== null) {
      // Corrupted legacy value -> safe Balanced fallback
      targetPreset = 'Balanced';
      targetConfig = cloneGraphicsConfig(GRAPHICS_PRESETS.Balanced);
      migratedFromLegacy = true;
      userSelected = false;
    }

    if (migratedFromLegacy) {
      // Write v10 first and verify before concluding migration
      try {
        ls.setItem(GRAPHICS_STORAGE_KEYS.presetV10, targetPreset);
        ls.setItem(GRAPHICS_STORAGE_KEYS.configV10, JSON.stringify(targetConfig));
        ls.setItem(GRAPHICS_STORAGE_KEYS.userSelectedV10, String(userSelected));
        const verify = ls.getItem(GRAPHICS_STORAGE_KEYS.presetV10);
        if (!isValidGraphicsPreset(verify)) {
          return fallback;
        }
      } catch {
        // Storage write failed; keep in-memory migrated result without touching legacy keys
      }
    }

    return {
      preset: targetPreset,
      config: targetConfig,
      userSelected,
      migratedFromLegacy,
    };
  } catch {
    return fallback;
  }
}

export function presetToLegacyQuality(
  preset: GraphicsPreset,
  config: GraphicsConfig | null | undefined
): 'Low' | 'Medium' | 'High' {
  const safePreset = resolveValidGraphicsPreset(preset);
  if (safePreset === 'Eco') return 'Low';
  if (safePreset === 'Cinematic') return 'High';
  if (config && (config.aoMode === 'gtao' || config.msaaSamples >= 4)) return 'High';
  return 'Medium';
}

export function legacyQualityToPreset(quality: 'Low' | 'Medium' | 'High'): GraphicsPreset {
  if (quality === 'Low') return 'Eco';
  if (quality === 'High') return 'Cinematic';
  return 'Balanced';
}

export function estimateGpuLoadScore(configInput: GraphicsConfig | null | undefined): {
  percent: number;
  labelRu: string;
  labelEn: string;
  tier: 'low' | 'moderate' | 'high' | 'extreme';
} {
  const config = configInput && typeof configInput === 'object' ? configInput : GRAPHICS_PRESETS.Balanced;
  let score = 10;

  if (config.msaaSamples === 2) score += 8;
  else if (config.msaaSamples === 4) score += 16;

  if (config.fxaaEnabled) score += 3;

  const dprNum = config.targetDpr === 'auto' ? 1.15 : config.targetDpr;
  const effectiveScale = dprNum * config.renderScale;
  score += Math.round(Math.min(22, Math.max(0, (effectiveScale - 0.8) * 26)));

  if (config.textureResolution >= 2048) score += 8;
  else if (config.textureResolution >= 1024) score += 4;
  else if (config.textureResolution >= 512) score += 2;

  if (config.anisotropy >= 16) score += 4;
  else if (config.anisotropy >= 8) score += 2;
  else if (config.anisotropy >= 4) score += 1;

  if (config.trilinearFiltering) score += 2;

  if (config.pmremQuality === 'standard') score += 3;
  else if (config.pmremQuality === 'high') score += 6;

  if (config.aoMode === 'light') score += 6;
  else if (config.aoMode === 'gtao') score += 13;

  if (config.shadowQuality === 'contact') score += 3;
  else if (config.shadowQuality === 'soft1024') score += 9;
  else if (config.shadowQuality === 'soft2048') score += 14;

  if (config.bloomEnabled) {
    score += 5;
    if (config.bloomResolutionScale >= 0.8) score += 4;
    else if (config.bloomResolutionScale >= 0.65) score += 2;
  }

  if (config.volumetricRays) score += 5;
  if (config.colorGrading) score += 2;
  if (config.dofEnabled) score += 8;
  if (config.colorBufferPrecision === 'halfFloat') score += 4;

  if (config.dynamicPointLights === 'standard') score += 3;
  else if (config.dynamicPointLights === 'full') score += 6;

  if (config.glslPlasmaShader) score += 3;
  if (config.sphericalHarmonics) score += 2;
  if (config.particleDensity >= 100) score += 4;
  else if (config.particleDensity >= 60) score += 2;
  else if (config.particleDensity >= 25) score += 1;

  const percent = Math.min(100, Math.max(12, score));
  if (percent <= 32) {
    return { percent, labelRu: 'Низкая · Экономичный контур', labelEn: 'Low · Eco Profile', tier: 'low' };
  }
  if (percent <= 62) {
    return { percent, labelRu: 'Умеренная · Повседневный баланс', labelEn: 'Moderate · Balanced', tier: 'moderate' };
  }
  if (percent <= 86) {
    return { percent, labelRu: 'Высокая · Кинематографичный рендер', labelEn: 'High · Cinematic', tier: 'high' };
  }
  return { percent, labelRu: 'Максимальная · Демонстрационный пик', labelEn: 'Maximum · Showcase Peak', tier: 'extreme' };
}
