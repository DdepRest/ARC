import * as THREE from 'three';
import { useSettingsStore } from '../../../features/settings/stores/settings.store';
import { createPlasmaEnergyTexture, createGlowParticleTexture } from '../reactorTextures';
import type { ReactorMaterials } from './reactor-materials';

export const themeColors = {
  red: 0xff1e2e,
  blue: 0x00d4ff,
  purple: 0x9d00ff,
  green: 0x00ff88,
  gold: 0xff9900,
};

export function themeAccentHex(theme: string): number {
  return themeColors[theme as keyof typeof themeColors] || themeColors.red;
}

export function getAccent(): THREE.Color {
  const store = useSettingsStore();
  return new THREE.Color(themeAccentHex(store.reactorColorTheme));
}

export interface ThemeTextureCache {
  plasmaMap: THREE.CanvasTexture;
  glowMap: THREE.CanvasTexture;
}

const textureCache = new Map<string, ThemeTextureCache>();

export function clearThemeTextureCache(): void {
  textureCache.forEach((cache) => {
    cache.plasmaMap.dispose();
    cache.glowMap.dispose();
  });
  textureCache.clear();
}

export function getThemeTextures(theme: string): ThemeTextureCache {
  if (textureCache.has(theme)) {
    const cached = textureCache.get(theme)!;
    cached.plasmaMap.needsUpdate = true;
    cached.glowMap.needsUpdate = true;
    return cached;
  }
  
  const hex = themeAccentHex(theme);
  const plasmaMap = createPlasmaEnergyTexture(256, hex);
  const glowMap = createGlowParticleTexture(128, hex);
  
  const cache = { plasmaMap, glowMap };
  textureCache.set(theme, cache);
  return cache;
}

export function pregenerateThemes() {
  if (typeof window === 'undefined') return;
  // Idle pregeneration to avoid freeze on switch
  setTimeout(() => {
    Object.keys(themeColors).forEach(theme => {
      getThemeTextures(theme);
    });
  }, 1000);
}

export function applyThemeToMaterials(theme: string, materials: ReactorMaterials) {
  const hex = themeAccentHex(theme);
  materials.targetColor.setHex(hex);
  
  const textures = getThemeTextures(theme);
  
  materials.plasmaEnergyMap = textures.plasmaMap;
  materials.glowParticleMap = textures.glowMap;
  
  materials.singularityCoreEmissiveMat.map = textures.plasmaMap;
  materials.singularityCoreEmissiveMat.needsUpdate = true;
  
  materials.plasmaVortexMat.map = textures.plasmaMap;
  materials.plasmaVortexMat.needsUpdate = true;

  if (materials.plasmaOuterEnvelopeMat) {
    materials.plasmaOuterEnvelopeMat.map = textures.plasmaMap;
    materials.plasmaOuterEnvelopeMat.needsUpdate = true;
  }
}
