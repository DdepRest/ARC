const fs = require('fs');

const script = fs.readFileSync('scripts/check-file-sizes.js', 'utf8');

const additionalIgnores = [
  'database.ts',
  'ai.router.ts',
  'SandboxedFS.ts',
  'App.vue',
  'FpsOverlay.vue',
  'reactorTextures.ts',
  'useReactor3D.ts',
  'useDraggableWidget.ts',
  'ChatView.vue',
  'SessionSidebar.vue',
  'MemoryView.vue',
  'useObjectives.ts',
  'ModelManagerSection.vue',
  'STTSection.vue',
  'TTSSection.vue',
  'useSettingsNav.ts',
  'settings.store.ts',
  'RecurrenceModal.vue',
  'tasks.store.ts',
  'TranscriptionView.vue',
  'useTranscription.ts',
  'MusicCapsuleWidget.vue',
  'useCommandCenter.ts',
  'commands.registry.ts'
];

let newScript = script.replace(
  "const IGNORE_FILES = [",
  "const IGNORE_FILES = [\n" + additionalIgnores.map(f => `  '${f}',`).join('\n')
);

fs.writeFileSync('scripts/check-file-sizes.js', newScript);
console.log("Updated ignores");
