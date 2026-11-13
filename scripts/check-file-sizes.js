const fs = require('fs');
const path = require('path');

const LOGIC_LIMIT = 400;
const DATA_LIMIT = 800;
const TYPES_LIMIT = 600;

function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'out' && file !== 'coverage' && file !== '.git') {
        walk(path.join(dir, file), fileList);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.vue') || file.endsWith('.js')) {
        fileList.push(path.join(dir, file));
      }
    }
  }
  return fileList;
}

const allFiles = walk(path.join(__dirname, '../src'));
let failed = false;

const IGNORE_FILES = [
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
  'commands.registry.ts',
  'useVoice.ts',
  'built-in-llm.service.ts',
  'useMacroEditor.ts',
  'reactor-state-driver.ts',
  'ObjectiveEngine.ts',
  'stt.service.ts',
];

for (const file of allFiles) {
  const filename = path.basename(file);
  if (IGNORE_FILES.includes(filename)) continue;
  
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;
  let limit = LOGIC_LIMIT;
  let type = 'Logic';
  
  if (file.includes('.types.ts') || file.includes('interface') || file.includes('types/')) {
    limit = TYPES_LIMIT;
    type = 'Types';
  } else if (file.includes('registry') || file.includes('config') || file.includes('mock') || file.includes('preset') || file.includes('tokens')) {
    limit = DATA_LIMIT;
    type = 'Data';
  } else if (file.includes('.test.ts') || file.includes('.spec.ts')) {
    continue; 
  }
  
  if (lines > limit) {
    console.error(`[SIZE EXCEEDED] ${file} (${type}) has ${lines} lines (limit: ${limit})`);
    failed = true;
  }
}

if (failed) {
  console.error('\nFile size check failed. Please refactor large files to maintain architectural standards.');
  process.exit(1);
} else {
  console.log('File size check passed.');
  process.exit(0);
}
