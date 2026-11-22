import { describe, it, expect } from 'vitest';
import {
  GRAPHICS_PRESETS,
  GRAPHICS_PRESET_ORDER,
  SHOWCASE_CONFIG_OVERRIDE,
  cloneGraphicsConfig,
  isPresetModified,
  mapLegacyPresetName,
  detectClosestPreset,
  loadAndMigrateGraphicsStorage,
  presetToLegacyQuality,
  legacyQualityToPreset,
  GRAPHICS_STORAGE_KEYS,
} from './graphics-presets';
import {
  sanitizeConfigForCapabilities,
  type GpuCapabilities,
} from '../../../components/reactor/modules/reactor-gpu-capabilities';

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const map: Record<string, string> = { ...initial };
  return {
    get length() {
      return Object.keys(map).length;
    },
    clear() {
      for (const k of Object.keys(map)) delete map[k];
    },
    getItem(key: string) {
      return key in map ? map[key] : null;
    },
    key(index: number) {
      return Object.keys(map)[index] ?? null;
    },
    removeItem(key: string) {
      delete map[key];
    },
    setItem(key: string, value: string) {
      map[key] = String(value);
    },
  };
}

describe('A.R.C. 3-Preset Graphics System & Migration v9 -> v10', () => {
  it('1. exposes strictly Eco, Balanced, Cinematic permanent presets (no legacy/Custom/Showcase)', () => {
    expect(GRAPHICS_PRESET_ORDER).toEqual(['Eco', 'Balanced', 'Cinematic']);
    expect(Object.keys(GRAPHICS_PRESETS).sort()).toEqual(['Balanced', 'Cinematic', 'Eco']);

    // DOF is strictly off in all permanent presets and enabled only in temporary Showcase override
    expect(GRAPHICS_PRESETS.Eco.dofEnabled).toBe(false);
    expect(GRAPHICS_PRESETS.Balanced.dofEnabled).toBe(false);
    expect(GRAPHICS_PRESETS.Cinematic.dofEnabled).toBe(false);
    expect(SHOWCASE_CONFIG_OVERRIDE.dofEnabled).toBe(true);
    expect(Object.isFrozen(SHOWCASE_CONFIG_OVERRIDE)).toBe(true);
  });

  it('2. deterministically maps legacy preset names', () => {
    expect(mapLegacyPresetName('Low')).toBe('Eco');
    expect(mapLegacyPresetName('Medium')).toBe('Balanced');
    expect(mapLegacyPresetName('High')).toBe('Balanced');
    expect(mapLegacyPresetName('Ultra')).toBe('Cinematic');
    expect(mapLegacyPresetName('UltraPlus')).toBe('Cinematic');
    expect(mapLegacyPresetName('Custom')).toBe('Custom');
    expect(mapLegacyPresetName('Showcase')).toBeNull();
    expect(mapLegacyPresetName('garbage')).toBeNull();
  });

  it('3. migrates v9 storage deterministically to v10 with write-first verification', () => {
    const cases: Array<[string, 'Eco' | 'Balanced' | 'Cinematic']> = [
      ['Low', 'Eco'],
      ['Medium', 'Balanced'],
      ['High', 'Balanced'],
      ['Ultra', 'Cinematic'],
      ['UltraPlus', 'Cinematic'],
    ];

    for (const [legacy, expected] of cases) {
      const storage = createMockStorage({
        arc_graphics_preset_v9: legacy,
      });
      const loaded = loadAndMigrateGraphicsStorage(storage);
      expect(loaded.migratedFromLegacy).toBe(true);
      expect(loaded.preset).toBe(expected);
      expect(loaded.userSelected).toBe(true);
      expect(storage.getItem(GRAPHICS_STORAGE_KEYS.presetV10)).toBe(expected);
      expect(storage.getItem(GRAPHICS_STORAGE_KEYS.configV10)).toBeTruthy();

      // Re-loading must NOT re-migrate when v10 exists
      const reloaded = loadAndMigrateGraphicsStorage(storage);
      expect(reloaded.migratedFromLegacy).toBe(false);
      expect(reloaded.preset).toBe(expected);
    }
  });

  it('4. maps legacy Custom v9 config to nearest permanent preset and preserves safe fallback on corruption', () => {
    const lowCustomStorage = createMockStorage({
      arc_graphics_preset_v9: 'Custom',
      [GRAPHICS_STORAGE_KEYS.legacyConfigV9]: JSON.stringify({
        msaaSamples: 0,
        fxaaEnabled: false,
        targetDpr: 1.0,
        renderScale: 0.85,
        textureResolution: 256,
        pmremQuality: 'eco',
        aoMode: 'off',
        shadowQuality: 'off',
        bloomEnabled: false,
        colorBufferPrecision: 'unsignedByte',
        particleDensity: 35,
        dynamicPointLights: 'eco',
      }),
    });
    const lowMigrated = loadAndMigrateGraphicsStorage(lowCustomStorage);
    expect(lowMigrated.preset).toBe('Eco');
    expect(lowMigrated.migratedFromLegacy).toBe(true);

    const highCustomStorage = createMockStorage({
      arc_graphics_preset_v9: 'Custom',
      [GRAPHICS_STORAGE_KEYS.legacyConfigV9]: JSON.stringify({
        msaaSamples: 4,
        fxaaEnabled: true,
        targetDpr: 1.25,
        renderScale: 1.0,
        textureResolution: 1024,
        pmremQuality: 'high',
        aoMode: 'gtao',
        shadowQuality: 'soft1024',
        volumetricRays: true,
        bloomEnabled: true,
        particleDensity: 120,
        dynamicPointLights: 'full',
      }),
    });
    const highMigrated = loadAndMigrateGraphicsStorage(highCustomStorage);
    expect(highMigrated.preset).toBe('Cinematic');

    // Corrupted JSON falls back cleanly to Balanced without throwing
    const corruptedStorage = createMockStorage({
      arc_graphics_preset_v9: 'NotARealPreset',
      [GRAPHICS_STORAGE_KEYS.legacyConfigV9]: '{broken-json',
    });
    const corruptedResult = loadAndMigrateGraphicsStorage(corruptedStorage);
    expect(corruptedResult.preset).toBe('Balanced');
    expect(corruptedResult.config).toEqual(GRAPHICS_PRESETS.Balanced);
  });

  it('5. detects manual parameter modifications without introducing Custom preset', () => {
    const balanced = cloneGraphicsConfig(GRAPHICS_PRESETS.Balanced);
    expect(isPresetModified('Balanced', balanced)).toBe(false);

    balanced.bloomStrength = 135;
    expect(isPresetModified('Balanced', balanced)).toBe(true);
    expect(detectClosestPreset(balanced as unknown as Record<string, unknown>)).toBe('Balanced');
  });

  it('6. converts cleanly between 3-preset enum and legacy Low/Medium/High quality bridges', () => {
    expect(presetToLegacyQuality('Eco', GRAPHICS_PRESETS.Eco)).toBe('Low');
    expect(presetToLegacyQuality('Balanced', GRAPHICS_PRESETS.Balanced)).toBe('Medium');
    expect(presetToLegacyQuality('Cinematic', GRAPHICS_PRESETS.Cinematic)).toBe('High');

    expect(legacyQualityToPreset('Low')).toBe('Eco');
    expect(legacyQualityToPreset('Medium')).toBe('Balanced');
    expect(legacyQualityToPreset('High')).toBe('Cinematic');
  });

  it('7. sanitizeConfigForCapabilities enforces hardware limits and safe software WebGL degradation', () => {
    const softwareCaps: GpuCapabilities = {
      isWebGL2: true,
      maxTextureSize: 4096,
      maxAnisotropy: 4,
      maxSamples: 0,
      supportsHalfFloatColorBuffer: false,
      supportsDisjointTimerQuery: false,
      supportsShadows: false,
      vendor: 'Google Inc.',
      rendererName: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))',
      isSoftwareGl: true,
    };

    const safeShowcase = sanitizeConfigForCapabilities(SHOWCASE_CONFIG_OVERRIDE, softwareCaps);
    expect(safeShowcase.msaaSamples).toBe(0);
    expect(safeShowcase.colorBufferPrecision).toBe('unsignedByte');
    expect(safeShowcase.aoMode).toBe('off');
    expect(safeShowcase.shadowQuality).toBe('off');
    expect(safeShowcase.dofEnabled).toBe(false);
    expect(safeShowcase.anisotropy).toBe(4);
    expect(safeShowcase.targetDpr).toBe(1);
    expect(safeShowcase.textureResolution).toBeLessThanOrEqual(512);

    const midGpuCaps: GpuCapabilities = {
      ...softwareCaps,
      maxTextureSize: 8192,
      maxAnisotropy: 8,
      maxSamples: 2,
      supportsHalfFloatColorBuffer: true,
      supportsShadows: true,
      vendor: 'NVIDIA',
      rendererName: 'NVIDIA GeForce RTX 3060',
      isSoftwareGl: false,
    };

    const safeCinematic = sanitizeConfigForCapabilities(GRAPHICS_PRESETS.Cinematic, midGpuCaps);
    expect(safeCinematic.msaaSamples).toBe(2);
    expect(safeCinematic.anisotropy).toBe(8);
    expect(safeCinematic.colorBufferPrecision).toBe('halfFloat');
    expect(safeCinematic.aoMode).toBe('gtao');
    expect(safeCinematic.shadowQuality).toBe('soft1024');
  });
});
