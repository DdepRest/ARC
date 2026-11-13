# PROGRESS - МАСТЕР-ТЗ v1.2.0-ui («Стекло и живая рама»)

## Статус реализации

### 1. Точечные исключения
- [x] Реактор-тема (`src/renderer/components/reactor/modules/reactor-theme.ts`): при неизвестной теме fallback = `themeColors.red` (эталонный красный).
- [x] Настройки (`src/renderer/features/settings/stores/settings.store.ts`): `resetToDefaults()` оставляет тему `'red'` (не `'gold'`).

### 2. Токены и Палитра (`tokens.css` и `global.css`)
- [x] Оправа панели: `rgba(7, 7, 7, 0.48)`, `backdrop-filter: blur(32px) saturate(150%)`, граница `rgba(255, 255, 255, 0.08)`, тень и свечение `0 0 56px -12px rgba(var(--accent-rgb), 0.28)`.
- [x] Плоскость чтения: `rgba(11, 11, 11, 0.42)`, `backdrop-filter: blur(20px) saturate(130%)`, без собственной рамки, радиус 20.
- [x] Поповер: `rgba(20, 20, 20, 0.72)`, `backdrop-filter: blur(24px) saturate(140%)`, border `rgba(255, 255, 255, 0.10)`.
- [x] Тултип: `rgba(28, 28, 28, 0.85)`, `backdrop-filter: blur(16px)`, border `rgba(255, 255, 255, 0.08)`.
- [x] Матовые блоки: `rgba(14, 14, 14, 0.88)`, border `rgba(255, 255, 255, 0.06)`, радиус 14.
- [x] Виджеты ядра: `rgba(11, 11, 11, 0.94)`, без blur, радиус 14, засечка 2px в левом верхнем углу, потеря фокуса opacity 0.6.
- [x] Модалка поверх стекла: `#0E0E0E`, непрозрачная.
- [x] Кромки и состояния: hairline `rgba(255, 255, 255, 0.06)`, divider `rgba(255, 255, 255, 0.05)`, hover `rgba(255, 255, 255, 0.03)`, selected `rgba(255, 255, 255, 0.045)` + 2px акцент 80%.

### 3. ШЕЛЛ (`HolographicProjectionPanel.vue` и `CommandCenter.vue`)
- [x] Оправа: `min(88vw, 1240px) × min(74vh, 860px)`, адаптив `≤1366×768` -> `min(92vw, 1240px) × min(78vh, 860px)`.
- [x] Паддинг оправы: 24px бок / 20px низ (адаптив: 16px бок / 12px низ).
- [x] Верхний блик оправы `::before`: `rgba(255, 255, 255, 0.08) 0% -> rgba(255, 255, 255, 0.02) 12% -> transparent 40%`.
- [x] Внешнее свечение: `0 0 56px -12px rgba(var(--accent-rgb), 0.28)`.
- [x] 4 угловые засечки: 28x28px, 1px rgba(var(--accent-rgb), 0.28), hover 0.42, дыхание opacity 2400ms.
- [x] Линия заголовка: 1px gradient accent.
- [x] Вуаль над космосом: `rgba(0, 0, 0, 0.18)` + кольцо-«земля» `radial rgba(0, 0, 0, 0.40) 0->64px`.

### 4. Примитивы и виджеты
- [x] `SettingsBlock.vue`: матовая подложка `rgba(14, 14, 14, 0.88)`, border `rgba(255, 255, 255, 0.06)`, радиус 14.
- [x] `HudWidgetShell.vue`: матовая подложка `rgba(11, 11, 11, 0.94)`, без blur, радиус 14, засечка 2px, opacity 0.6 при потере фокуса.
- [x] `ArcModal.vue`: `#0E0E0E` непрозрачный для чтения.
- [x] `ArcSelect.vue`: стекло `rgba(20, 20, 20, 0.72)`.
