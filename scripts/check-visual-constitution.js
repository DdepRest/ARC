const fs = require('fs');
const path = require('path');

const BASELINE_PATH = path.join(__dirname, 'visual-constitution-baseline.json');
const isUpdateBaseline = process.argv.includes('--update-baseline') || !fs.existsSync(BASELINE_PATH);
const isListProtected = process.argv.includes('--list-protected');

function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'out' && file !== '.git') {
        walk(fullPath, fileList);
      }
    } else {
      if (file.endsWith('.vue') || file.endsWith('.ts') || file.endsWith('.css')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

const rendererDir = path.join(__dirname, '../src/renderer');
const files = walk(rendererDir);

const counters = {
  bgWhiteFills: 0,
  backdropBlurOverCanvas: 0,
  fontSizesUnder12: 0,
  coloredStatusFills: 0,
  transparentSpaceRoots: 0,
  capsStringsOver12: 0,
  forbiddenSurfaceFills: 0,
  literalAccentClasses: 0,
  onboardingMissingSurfaces: 0
};

const violations = [];

const PROTECTED_ZONES = [
  'src/renderer/components/reactor/**',
  'src/renderer/features/tasks/**',
  'src/renderer/features/chat/**',
  'src/renderer/features/commands/composables/useMacroEditor.ts',
  'src/renderer/components/layout/BottomBar.vue',
  'src/renderer/components/panels/BottomBar.vue',
  'src/renderer/features/voice/useVoice.ts',
  'src/renderer/composables/useVoice.ts',
  'src/main/services/built-in-llm.service.ts',
  'src/main/services/objective/ObjectiveEngine.ts'
];

function isProtectedZone(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  return PROTECTED_ZONES.some(pattern => {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return norm === prefix || norm.startsWith(prefix + '/');
    }
    return norm === pattern || norm.endsWith('/' + pattern) || norm.includes(pattern);
  });
}

function stripVarWithFallback(text) {
  let result = '';
  let i = 0;
  const lower = text.toLowerCase();
  while (i < text.length) {
    const varIdx = lower.indexOf('var(--', i);
    if (varIdx === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, varIdx);
    const openParenIdx = varIdx + 3;
    let depth = 1;
    let j = openParenIdx + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '(') depth++;
      else if (text[j] === ')') depth--;
      j++;
    }
    if (depth === 0) {
      i = j;
    } else {
      result += text.slice(varIdx, openParenIdx + 1);
      i = openParenIdx + 1;
    }
  }
  return result;
}

const whitelistFiles = [
  'theme-palettes.tokens.ts',
  'tokens.css',
  'variables.css',
  'index.html',
  'arcGhostDetector.ts',
  'arcGhostDetector.test.ts',
  'widget-concepts.html',
  'arcGhostTrap.ts',
  'arcLiveDump.ts'
];

const OBSOLETE_LEGACY_FILES = new Set([
  'src/renderer/components/ui/HudWidgetShell.vue',
  'src/renderer/components/ui/PerformanceTelemetryOverlay.vue',
  'src/renderer/features/settings/components/HubSettings.vue',
  'src/renderer/features/settings/components/sections/general/SystemResourcesSection.vue',
  'src/renderer/features/settings/components/sections/general/VoiceAudioSection.vue',
  'src/renderer/layouts/components/MusicCapsuleWidget.vue'
]);

let protectedExcludedCount = 0;
const protectedExcludedFiles = [];

for (const file of files) {
  const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  if (OBSOLETE_LEGACY_FILES.has(relPath)) {
    continue;
  }
  if (isProtectedZone(relPath)) {
    protectedExcludedCount++;
    protectedExcludedFiles.push(relPath);
    continue;
  }

  const content = fs.readFileSync(file, 'utf-8');

  // 1. bg-white/N fills
  const whiteMatches = content.match(/\bbg-white\/(?:10|15|20|25|30|40|50|60|70|80|90|100)\b/g);
  if (whiteMatches) {
    counters.bgWhiteFills += whiteMatches.length;
    violations.push(`[bg-white fill] ${relPath}: ${whiteMatches.length} occurrences`);
  }

  // 2. backdrop-blur over canvas / root panels
  if (relPath.includes('HolographicProjectionPanel.vue') || relPath.includes('CommandCenter.vue')) {
    const blurMatches = content.match(/backdrop-blur-(?:md|lg|xl|2xl|3xl)/g);
    if (blurMatches) {
      counters.backdropBlurOverCanvas += blurMatches.length;
    }
  }

  // 3. Font sizes under 12px (text-[7px], text-[8px], text-[9px])
  const smallFonts = content.match(/\btext-\[(?:6|7|8|9)(?:\.[0-9]+)?px\]/g);
  if (smallFonts) {
    counters.fontSizesUnder12 += smallFonts.length;
    violations.push(`[font < 12px] ${relPath}: ${smallFonts.length} occurrences`);
  }

  // 4. Colored status fills
  const statusFills = content.match(/\bbg-(?:emerald|green|red|amber|yellow|blue)-(?:400|500|600)\/(?:10|15|20|25|30|40|50)\b/g);
  if (statusFills) {
    counters.coloredStatusFills += statusFills.length;
    violations.push(`[status fill] ${relPath}: ${statusFills.length} occurrences`);
  }

  // 5. Surface Tokens Latch Rule (Rule §6): Forbidden literal/semi-transparent surfaces in settings/layouts
  if (relPath.includes('features/settings') || relPath.includes('layouts/')) {
    const surfaceViolations = content.match(/bg-\[rgba\((?:1[0-4]|7|11),\s*[0-9]{1,2},\s*[0-9]{1,2}[^\]]*\)\]/g)
      || content.match(/backgroundColor:\s*['"]rgba\((?:1[0-4]|7|11),/g);
    if (surfaceViolations) {
      counters.forbiddenSurfaceFills += surfaceViolations.length;
      violations.push(`[surface latch violation] ${relPath}: ${surfaceViolations.length} occurrences`);
    }
  }

  // 6. Literal accent classes (P1.5 & Condition 5): non-tokenized red accent classes outside whitelist
  if (!whitelistFiles.includes(path.basename(file))) {
    const lines = content.split('\n');
    let fileMatches = 0;
    for (const line of lines) {
      const stripped = stripVarWithFallback(line);
      // Strip status fills first so bg-red with alpha is only counted in coloredStatusFills
      const strippedNoStatus = stripped.replace(/\bbg-(?:emerald|green|red|amber|yellow|blue)-(?:400|500|600)\/(?:10|15|20|25|30|40|50)\b/g, '');
      const matches = strippedNoStatus.match(/text-red-[0-9]|border-red-[0-9]|bg-red-[0-9]|ring-red-[0-9]|rgba\(239,\s*68,\s*68|#EF4444|#ef4444/g);
      if (matches) {
        fileMatches += matches.length;
      }
    }
    if (fileMatches > 0) {
      counters.literalAccentClasses += fileMatches;
      violations.push(`[literal accent] ${relPath}: ${fileMatches} occurrences`);
    }
  }

  // 7. Onboarding Modal/Wizard Surface & Accent Tokens Rule
  if (relPath.startsWith('src/renderer/components/onboarding/') && file.endsWith('.vue')) {
    const baseName = path.basename(file);
    if (baseName.includes('Wizard') || baseName.includes('Modal')) {
      const requiredTokens = ['var(--arc-plane)', 'var(--arc-block)', 'var(--arc-rail)', 'var(--accent)'];
      const missingTokens = requiredTokens.filter(tok => !content.includes(tok));
      if (missingTokens.length > 0) {
        counters.onboardingMissingSurfaces++;
        violations.push(`[onboarding missing surface/accent tokens] ${relPath}: missing ${missingTokens.join(', ')}`);
      }
    }
  }
}

console.log('\n--- A.R.C. VISUAL CONSTITUTION AUDIT ---');
console.log(`Audited ${files.length} renderer files.`);
console.log(`Protected zones excluded: ${protectedExcludedCount} files (informational only)`);

if (isListProtected) {
  console.log('\n--- PROTECTED FILES LIST ---');
  protectedExcludedFiles.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));
  process.exit(0);
}

console.table(counters);

if (violations.length > 0) {
  console.log(`\nDetailed violations (${violations.length}):`);
  violations.forEach(v => console.log(`  ${v}`));
}


if (counters.forbiddenSurfaceFills > 0) {
  console.error(`❌ SURFACE TOKENS LATCH VIOLATION: ${counters.forbiddenSurfaceFills} forbidden semi-transparent/literal surface fills detected in settings/layouts!`);
  for (const v of violations.filter(v => v.includes('[surface latch violation]'))) {
    console.error(`  ${v}`);
  }
  process.exit(1);
}

if (isUpdateBaseline) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(counters, null, 2), 'utf-8');
  console.log(`✅ Baseline updated successfully at ${BASELINE_PATH}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
let debtGrown = false;
let baselineDesync = false;

for (const key of Object.keys(counters)) {
  if (counters[key] > (baseline[key] || 0)) {
    console.error(`❌ REGRESSION: ${key} increased from ${baseline[key]} to ${counters[key]}`);
    debtGrown = true;
  } else if (counters[key] < (baseline[key] || 0)) {
    console.log(`🎉 IMPROVEMENT: ${key} reduced from ${baseline[key]} to ${counters[key]}`);
    baselineDesync = true;
  }
}

if (debtGrown) {
  console.error('\nVisual constitution debt increased. Fix violations or run with --update-baseline if approved.');
  process.exit(1);
} else if (baselineDesync && process.env.STRICT_BASELINE_SYNC === '1') {
  console.error('\n❌ BASELINE DESYNC: Live scan improved, but visual-constitution-baseline.json is lagging. Run with --update-baseline to sync.');
  process.exit(1);
} else {
  console.log('✅ Visual constitution check PASSED (no debt growth).');
  process.exit(0);
}
