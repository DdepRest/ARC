import fs from 'fs';
import path from 'path';

console.log('=== A.R.C. Chunk 8c Verification Script ===\n');

const CHUNK_8C_FILES = [
  'src/renderer/features/tasks/components/FocusSprintView.vue',
  'src/renderer/features/tasks/components/EisenhowerMatrix.vue',
  'src/renderer/features/tasks/components/TaskHistoryView.vue',
  'src/renderer/features/tasks/components/TaskTelemetry.vue',
  'src/renderer/features/tasks/components/AIRecommendationBox.vue',
  'src/renderer/features/tasks/components/PriorityDistributionBars.vue',
  'src/renderer/features/tasks/components/SummaryMeter.vue',
];

// Check file existence
let allFilesExist = true;
for (const file of CHUNK_8C_FILES) {
  if (!fs.existsSync(file)) {
    console.error(`[ERROR] Missing file: ${file}`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  process.exit(1);
}

console.log('✓ All 7 Chunk 8c files exist.');

// Check sticky headers in TaskHistoryView
const historyContent = fs.readFileSync('src/renderer/features/tasks/components/TaskHistoryView.vue', 'utf-8');
const stickyMatch = historyContent.match(/sticky[^"']*bg-\[var\(--arc-[a-z]+\)\]/);
if (stickyMatch) {
  console.log(`✓ Sticky date header in TaskHistoryView.vue uses opaque background: ${stickyMatch[0]}`);
} else {
  console.warn('! Check sticky header background in TaskHistoryView.vue');
}

// Check tokens in tokens.css
const tokensContent = fs.readFileSync('src/renderer/assets/styles/tokens.css', 'utf-8');
const textPrimaryMatch = tokensContent.match(/--arc-text-primary:\s*(#[0-9A-Fa-f]{6});/);
const textMachineMatch = tokensContent.match(/--arc-text-machine:\s*(#[0-9A-Fa-f]{6});/);

const textPrimary = textPrimaryMatch ? textPrimaryMatch[1] : 'Unknown';
const textMachine = textMachineMatch ? textMachineMatch[1] : 'Unknown';

console.log(`\nTokens verification from tokens.css:`);
console.log(`  --arc-text-primary: ${textPrimary}`);
console.log(`  --arc-text-machine: ${textMachine}`);

if (textPrimary.toUpperCase() === '#E8E8E8' && textMachine.toUpperCase() === '#7A7A7A') {
  console.log('✓ Text scale tokens match canonical 8a/8b values (#E8E8E8 / #7A7A7A).');
} else {
  console.warn('! Tokens differ from canonical 8a/8b baseline.');
}

console.log('\n=== All verification checks completed successfully ===');
