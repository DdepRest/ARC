export type GraphicsPreset = 'Low' | 'Medium' | 'High' | 'Ultra' | 'UltraPlus' | 'Custom';

export interface GraphicsConfig {
  // 1. Anti-Aliasing & Resolution Scaling (Сглаживание и апскейл)
  msaaSamples: 0 | 2 | 4 | 8;
  fxaaEnabled: boolean;
  targetDpr: 1.0 | 1.25 | 1.5 | 2.0 | 'auto';
  renderScale: 0.5 | 0.75 | 1.0 | 1.25 | 1.5;

  // 2. Textures & Reflections (Текстуры и отражения)
  anisotropy: 1 | 2 | 4 | 8 | 16;
  trilinearFiltering: boolean;
  pmremQuality: 'off' | 'standard' | 'high';
  envMapIntensity: number; // 50..150 (%)

  // 3. Post-Processing & Lighting (Пост-обработка и освещение)
  bloomEnabled: boolean;
  bloomStrength: number; // 50..150 (%)
  bloomRadius: number; // 0.2..0.8
  colorBufferPrecision: 'halfFloat' | 'unsignedByte';
  dynamicPointLights: 'eco' | 'standard' | 'full';

  // 4. Shaders, Physics & Particles (Шейдеры, физика и частицы)
  glslPlasmaShader: boolean;
  sphericalHarmonics: boolean;
  springPhysics: boolean;
  shockwavesEnabled: boolean;
  spatialAudioBands: boolean;
  particleDensity: 0 | 25 | 60 | 100 | 150;
}

export const GRAPHICS_PRESETS: Record<Exclude<GraphicsPreset, 'Custom'>, GraphicsConfig> = {
  Low: {
    msaaSamples: 0,
    fxaaEnabled: false,
    targetDpr: 1.0,
    renderScale: 0.75,
    anisotropy: 1,
    trilinearFiltering: false,
    pmremQuality: 'off',
    envMapIntensity: 50,
    bloomEnabled: true,
    bloomStrength: 60,
    bloomRadius: 0.25,
    colorBufferPrecision: 'unsignedByte',
    dynamicPointLights: 'eco',
    glslPlasmaShader: false,
    sphericalHarmonics: false,
    springPhysics: false,
    shockwavesEnabled: false,
    spatialAudioBands: false,
    particleDensity: 0,
  },
  Medium: {
    msaaSamples: 2,
    fxaaEnabled: false,
    targetDpr: 1.0,
    renderScale: 1.0,
    anisotropy: 4,
    trilinearFiltering: false,
    pmremQuality: 'standard',
    envMapIntensity: 75,
    bloomEnabled: true,
    bloomStrength: 85,
    bloomRadius: 0.4,
    colorBufferPrecision: 'unsignedByte',
    dynamicPointLights: 'standard',
    glslPlasmaShader: false,
    sphericalHarmonics: false,
    springPhysics: true,
    shockwavesEnabled: false,
    spatialAudioBands: true,
    particleDensity: 25,
  },
  High: {
    msaaSamples: 4,
    fxaaEnabled: true,
    targetDpr: 1.25,
    renderScale: 1.0,
    anisotropy: 8,
    trilinearFiltering: true,
    pmremQuality: 'standard',
    envMapIntensity: 100,
    bloomEnabled: true,
    bloomStrength: 110,
    bloomRadius: 0.55,
    colorBufferPrecision: 'halfFloat',
    dynamicPointLights: 'full',
    glslPlasmaShader: true,
    sphericalHarmonics: false,
    springPhysics: true,
    shockwavesEnabled: true,
    spatialAudioBands: true,
    particleDensity: 60,
  },
  Ultra: {
    msaaSamples: 8,
    fxaaEnabled: true,
    targetDpr: 1.5,
    renderScale: 1.25,
    anisotropy: 16,
    trilinearFiltering: true,
    pmremQuality: 'high',
    envMapIntensity: 125,
    bloomEnabled: true,
    bloomStrength: 135,
    bloomRadius: 0.7,
    colorBufferPrecision: 'halfFloat',
    dynamicPointLights: 'full',
    glslPlasmaShader: true,
    sphericalHarmonics: true,
    springPhysics: true,
    shockwavesEnabled: true,
    spatialAudioBands: true,
    particleDensity: 100,
  },
  UltraPlus: {
    msaaSamples: 8,
    fxaaEnabled: true,
    targetDpr: 2.0,
    renderScale: 1.5,
    anisotropy: 16,
    trilinearFiltering: true,
    pmremQuality: 'high',
    envMapIntensity: 150,
    bloomEnabled: true,
    bloomStrength: 150,
    bloomRadius: 0.8,
    colorBufferPrecision: 'halfFloat',
    dynamicPointLights: 'full',
    glslPlasmaShader: true,
    sphericalHarmonics: true,
    springPhysics: true,
    shockwavesEnabled: true,
    spatialAudioBands: true,
    particleDensity: 150,
  },
};

export function cloneGraphicsConfig(config: GraphicsConfig): GraphicsConfig {
  return { ...config };
}

export function isSameGraphicsConfig(a: GraphicsConfig, b: GraphicsConfig): boolean {
  const keys = Object.keys(a) as Array<keyof GraphicsConfig>;
  return keys.every((k) => {
    if (typeof a[k] === 'number' && typeof b[k] === 'number') {
      return Math.abs((a[k] as number) - (b[k] as number)) < 0.001;
    }
    return a[k] === b[k];
  });
}

export function detectMatchingPreset(config: GraphicsConfig): GraphicsPreset {
  const presetNames: Array<Exclude<GraphicsPreset, 'Custom'>> = ['Low', 'Medium', 'High', 'Ultra', 'UltraPlus'];
  for (const name of presetNames) {
    if (isSameGraphicsConfig(config, GRAPHICS_PRESETS[name])) {
      return name;
    }
  }
  return 'Custom';
}

export function presetToLegacyQuality(preset: GraphicsPreset, config: GraphicsConfig): 'Low' | 'Medium' | 'High' {
  if (preset === 'Low') return 'Low';
  if (preset === 'Medium') return 'Medium';
  if (preset === 'High' || preset === 'Ultra' || preset === 'UltraPlus') return 'High';
  if (!config.bloomEnabled && config.msaaSamples === 0) return 'Low';
  if (config.msaaSamples >= 8 || config.glslPlasmaShader) return 'High';
  return 'Medium';
}

export function estimateGpuLoadScore(config: GraphicsConfig): {
  percent: number;
  labelRu: string;
  labelEn: string;
  tier: 'low' | 'moderate' | 'high' | 'extreme';
} {
  let score = 8;

  if (config.msaaSamples === 2) score += 6;
  else if (config.msaaSamples === 4) score += 11;
  else if (config.msaaSamples === 8) score += 18;

  if (config.fxaaEnabled) score += 4;

  const dprNum = config.targetDpr === 'auto' ? 1.25 : config.targetDpr;
  const effectiveScale = dprNum * config.renderScale;
  score += Math.round(Math.min(28, Math.max(0, (effectiveScale - 0.75) * 12.5)));

  if (config.anisotropy >= 16) score += 5;
  else if (config.anisotropy >= 8) score += 3;
  else if (config.anisotropy >= 4) score += 2;

  if (config.trilinearFiltering) score += 2;

  if (config.pmremQuality === 'standard') score += 3;
  else if (config.pmremQuality === 'high') score += 6;

  score += Math.round(((Math.max(50, Math.min(150, config.envMapIntensity)) - 50) / 100) * 5);

  if (config.bloomEnabled) {
    score += 6;
    score += Math.round(((Math.max(50, Math.min(150, config.bloomStrength)) - 50) / 100) * 5);
  }
  if (config.colorBufferPrecision === 'halfFloat') score += 4;
  if (config.dynamicPointLights === 'standard') score += 3;
  else if (config.dynamicPointLights === 'full') score += 6;

  if (config.glslPlasmaShader) score += 3;
  if (config.sphericalHarmonics) score += 3;
  if (config.springPhysics) score += 2;
  if (config.shockwavesEnabled) score += 2;
  if (config.spatialAudioBands) score += 1;

  if (config.particleDensity >= 150) score += 6;
  else if (config.particleDensity >= 100) score += 4;
  else if (config.particleDensity >= 60) score += 3;
  else if (config.particleDensity >= 25) score += 1;

  const percent = Math.min(100, Math.max(10, score));
  if (percent <= 24) {
    return { percent, labelRu: 'Низкая · Фокус на чистоте кольца', labelEn: 'Low · Core Ring Priority', tier: 'low' };
  }
  if (percent <= 46) {
    return { percent, labelRu: 'Умеренная · Оптимальный баланс', labelEn: 'Moderate · Balanced', tier: 'moderate' };
  }
  if (percent <= 72) {
    return { percent, labelRu: 'Высокая · Полный шейдерный конвейер', labelEn: 'High · Full Shader Pipeline', tier: 'high' };
  }
  return { percent, labelRu: 'Максимальная · Суперсэмплинг и MSAA 8x', labelEn: 'Extreme · Supersampling & MSAA 8x', tier: 'extreme' };
}
