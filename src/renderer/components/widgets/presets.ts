export type WidgetPresetKey = 'minimal' | 'standard' | 'full' | 'custom';

export interface WidgetPresetConfig {
  key: WidgetPresetKey;
  label: string;
  description: string;
  widgets: {
    showTechnicalHUD: boolean;
    showTimelineWidget: boolean;
    showSmartRouterWidget: boolean;
    showMusicWidget: boolean;
    showFpsOverlay: boolean;
  };
  sizes: Record<string, 'S' | 'M' | 'L'>;
  compact: Record<string, boolean>;
  modes?: Record<string, 'ambient' | 'compact' | 'expanded'>;
}

export const WIDGET_PRESETS: Record<WidgetPresetKey, WidgetPresetConfig> = {
  minimal: {
    key: 'minimal',
    label: 'Минимальный',
    description: 'Только ключевые показатели производительности и лаконичный HUD.',
    widgets: {
      showTechnicalHUD: true,
      showTimelineWidget: false,
      showSmartRouterWidget: false,
      showMusicWidget: false,
      showFpsOverlay: false,
    },
    sizes: {
      'tech-hud': 'S',
      'timeline': 'M',
      'smart-router': 'M',
      'music': 'M',
      'fps': 'S',
    },
    compact: {
      'tech-hud': true,
      'timeline': true,
      'smart-router': true,
      'music': true,
      'fps': true,
    },
    modes: {
      'tech-hud': 'ambient',
      'timeline': 'ambient',
      'smart-router': 'ambient',
      'music': 'ambient',
      'fps': 'ambient',
    },
  },
  standard: {
    key: 'standard',
    label: 'Стандартный',
    description: 'Оптимальный баланс мониторинга ИИ, музыки и аппаратной телеметрии.',
    widgets: {
      showTechnicalHUD: true,
      showTimelineWidget: true,
      showSmartRouterWidget: true,
      showMusicWidget: true,
      showFpsOverlay: false,
    },
    sizes: {
      'tech-hud': 'M',
      'timeline': 'L',
      'smart-router': 'L',
      'music': 'L',
      'fps': 'S',
    },
    compact: {
      'tech-hud': true,
      'timeline': true,
      'smart-router': true,
      'music': true,
      'fps': true,
    },
    modes: {
      'tech-hud': 'compact',
      'timeline': 'compact',
      'smart-router': 'compact',
      'music': 'compact',
      'fps': 'compact',
    },
  },
  full: {
    key: 'full',
    label: 'Полный (Дашборд)',
    description: 'Максимальный оверлей со всеми диагностическими панелями и таймлайном.',
    widgets: {
      showTechnicalHUD: true,
      showTimelineWidget: true,
      showSmartRouterWidget: true,
      showMusicWidget: true,
      showFpsOverlay: true,
    },
    sizes: {
      'tech-hud': 'M',
      'timeline': 'L',
      'smart-router': 'L',
      'music': 'L',
      'fps': 'S',
    },
    compact: {
      'tech-hud': true,
      'timeline': true,
      'smart-router': true,
      'music': true,
      'fps': true,
    },
    modes: {
      'tech-hud': 'compact',
      'timeline': 'compact',
      'smart-router': 'compact',
      'music': 'compact',
      'fps': 'compact',
    },
  },
  custom: {
    key: 'custom',
    label: 'Пользовательский',
    description: 'Индивидуальные настройки размеров, видимости и позиций.',
    widgets: {
      showTechnicalHUD: true,
      showTimelineWidget: true,
      showSmartRouterWidget: true,
      showMusicWidget: true,
      showFpsOverlay: false,
    },
    sizes: {
      'tech-hud': 'M',
      'timeline': 'L',
      'smart-router': 'L',
      'music': 'L',
      'fps': 'S',
    },
    compact: {
      'tech-hud': true,
      'timeline': true,
      'smart-router': true,
      'music': true,
      'fps': true,
    },
    modes: {
      'tech-hud': 'compact',
      'timeline': 'compact',
      'smart-router': 'compact',
      'music': 'compact',
      'fps': 'compact',
    },
  },
};
