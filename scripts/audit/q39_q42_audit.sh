#!/bin/bash

echo "=== Q39: скрипт проверки orphan ==="
cat << 'INNER' > check_orphan.sh
#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: $0 <path_to_file>"
  exit 1
fi
FILE="$1"
FILENAME=$(basename "$FILE")
NAME="${FILENAME%.*}"

echo "Checking $FILE (name: $NAME)..."
MATCHES=$(grep -rn "$NAME" src/ | grep -v "$FILE")
if [ -z "$MATCHES" ]; then
  echo "RESULT: ORPHAN CONFIRMED"
else
  echo "RESULT: REFERENCED EXTERNAL"
  echo "$MATCHES"
fi
INNER
chmod +x check_orphan.sh

./check_orphan.sh src/renderer/features/settings/components/sections/providers/FallbackRulesSection.vue
./check_orphan.sh src/renderer/features/settings/components/sections/providers/WhereToThinkSelector.vue
./check_orphan.sh src/renderer/layouts/FocusMode.vue
./check_orphan.sh src/renderer/layouts/components/MusicCapsuleWidget.vue
./check_orphan.sh src/renderer/features/settings/components/sections/providers/SourcesSection.vue

echo "=== Q40-A: FallbackRulesSection ==="
grep -rn "FallbackRulesSection" src/ || echo "ORPHAN CONFIRMED"

echo "=== Q40-B: WhereToThinkSelector ==="
grep -rn "WhereToThinkSelector" src/ || echo "ORPHAN CONFIRMED"

echo "=== Q40-C: FocusMode ==="
grep -rn "FocusMode" src/ || echo "ORPHAN CONFIRMED"

echo "=== Q40-D: MusicCapsuleWidget ==="
grep -rn "MusicCapsuleWidget" src/ || echo "ORPHAN CONFIRMED"

echo "=== Q40-E: SourcesSection ==="
grep -rn "SourcesSection" src/ || echo "ORPHAN CONFIRMED"

echo "=== Q41-A: ключи в presets.ts ==="
grep -rn "show" src/renderer/components/widgets/presets.ts

echo "=== Q41-B: ключи в settings.store.ts ==="
grep -rn "show" src/renderer/features/settings/stores/settings.store.ts | grep "ref\|computed"

echo "=== Q41-C: где используются ключи presets.ts в коде ==="
grep -rn "WIDGET_PRESETS" src/

echo "=== Q42-A: импортируются ли FpsOverlay и PerformanceProfiler в WidgetsLayer ==="
grep -rn "FpsOverlay\|PerformanceProfiler" src/renderer/components/widgets/WidgetsLayer.vue || echo "NOT IMPORTED IN WIDGETSLAYER"

echo "=== Q42-B: импортируются ли они где-либо ещё в src/ ==="
grep -rn "import.*FpsOverlay" src/ || echo "FpsOverlay NOT IMPORTED ANYWHERE"
grep -rn "import.*PerformanceProfiler" src/ || echo "PerformanceProfiler NOT IMPORTED ANYWHERE"

echo "=== Q42-C: текущие тумблеры в settings.store.ts для этих двух ==="
grep -rn "showFpsOverlay\|showPerformanceWidget" src/renderer/features/settings/stores/settings.store.ts
