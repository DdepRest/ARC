export interface ThemePalette {
  color: string;
  rgb: string;
  text: string;
  hover: string;
  border: string;
  borderHover: string;
  bgAlpha: string;
  bgAlphaHover: string;
  glow: string;
  glowStrong: string;
}

export const THEME_PALETTES: Record<string, ThemePalette> = {
  red: {
    color: '#EF4444',
    rgb: '239, 68, 68',
    text: '#f87171',
    hover: '#dc2626',
    border: 'rgba(239, 68, 68, 0.35)',
    borderHover: 'rgba(239, 68, 68, 0.65)',
    bgAlpha: 'rgba(239, 68, 68, 0.15)',
    bgAlphaHover: 'rgba(239, 68, 68, 0.25)',
    glow: '0 0 15px rgba(239, 68, 68, 0.35)',
    glowStrong: '0 0 25px rgba(239, 68, 68, 0.6)'
  },
  blue: {
    color: '#00d4ff',
    rgb: '0, 212, 255',
    text: '#38bdf8',
    hover: '#0284c7',
    border: 'rgba(0, 212, 255, 0.35)',
    borderHover: 'rgba(0, 212, 255, 0.65)',
    bgAlpha: 'rgba(0, 212, 255, 0.15)',
    bgAlphaHover: 'rgba(0, 212, 255, 0.25)',
    glow: '0 0 15px rgba(0, 212, 255, 0.35)',
    glowStrong: '0 0 25px rgba(0, 212, 255, 0.6)'
  },
  purple: {
    color: '#a855f7',
    rgb: '168, 85, 247',
    text: '#c084fc',
    hover: '#9333ea',
    border: 'rgba(168, 85, 247, 0.35)',
    borderHover: 'rgba(168, 85, 247, 0.65)',
    bgAlpha: 'rgba(168, 85, 247, 0.15)',
    bgAlphaHover: 'rgba(168, 85, 247, 0.25)',
    glow: '0 0 15px rgba(168, 85, 247, 0.35)',
    glowStrong: '0 0 25px rgba(168, 85, 247, 0.6)'
  },
  green: {
    color: '#34d399',
    rgb: '16, 185, 129',
    text: '#34d399',
    hover: '#059669',
    border: 'rgba(16, 185, 129, 0.35)',
    borderHover: 'rgba(16, 185, 129, 0.65)',
    bgAlpha: 'rgba(16, 185, 129, 0.15)',
    bgAlphaHover: 'rgba(16, 185, 129, 0.25)',
    glow: '0 0 15px rgba(16, 185, 129, 0.35)',
    glowStrong: '0 0 25px rgba(16, 185, 129, 0.6)'
  },
  gold: {
    color: '#ff9900',
    rgb: '255, 153, 0',
    text: '#ffbe40',
    hover: '#e68a00',
    border: 'rgba(255, 153, 0, 0.40)',
    borderHover: 'rgba(255, 153, 0, 0.75)',
    bgAlpha: 'rgba(255, 153, 0, 0.18)',
    bgAlphaHover: 'rgba(255, 153, 0, 0.28)',
    glow: '0 0 16px rgba(255, 153, 0, 0.45)',
    glowStrong: '0 0 28px rgba(255, 153, 0, 0.7)'
  }
};
