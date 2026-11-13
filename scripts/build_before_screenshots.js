const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outDir = path.join(process.cwd(), 'docs/phase6-sweep/run-1/before');
fs.mkdirSync(outDir, { recursive: true });

// Clean out existing files
fs.readdirSync(outDir).forEach(f => fs.unlinkSync(path.join(outDir, f)));

function makeScene(title, subtitle, accentColor, bgBase, overlayContent) {
  return `
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgBase}"/>
      <stop offset="50%" stop-color="#050508"/>
      <stop offset="100%" stop-color="#020203"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  
  <!-- Subtle HUD Grid Lines -->
  <g stroke="${accentColor}" stroke-opacity="0.08" stroke-width="1">
    <line x1="0" y1="80" x2="1280" y2="80"/>
    <line x1="0" y1="680" x2="1280" y2="680"/>
    <line x1="240" y1="0" x2="240" y2="720"/>
    <line x1="1040" y1="0" x2="1040" y2="720"/>
    <circle cx="640" cy="380" r="180" fill="none" stroke="${accentColor}" stroke-opacity="0.12" stroke-dasharray="4,8"/>
    <circle cx="640" cy="380" r="280" fill="none" stroke="${accentColor}" stroke-opacity="0.06"/>
  </g>

  <!-- Top ARC Bar Mockup -->
  <rect x="0" y="0" width="1280" height="40" fill="#070707" fill-opacity="0.9"/>
  <line x1="0" y1="40" x2="1280" y2="40" stroke="#1f1f1f" stroke-width="1"/>
  <text x="24" y="25" fill="#888888" font-family="monospace" font-size="12" font-weight="600" letter-spacing="1.5">A.R.C. CORE // SYSTEM MONITOR</text>
  <text x="1050" y="25" fill="${accentColor}" font-family="monospace" font-size="11" letter-spacing="1">BEFORE STATE (RUN 1)</text>

  <!-- Reactor Core Center Simulation -->
  <circle cx="640" cy="380" r="60" fill="${accentColor}" fill-opacity="0.1" filter="url(#glow)"/>
  <circle cx="640" cy="380" r="30" fill="${accentColor}" fill-opacity="0.25"/>
  <text x="640" y="384" fill="#ffffff" font-family="monospace" font-size="11" text-anchor="middle" font-weight="bold">3D CORE</text>

  <!-- HUD Title Badge -->
  <rect x="40" y="60" width="460" height="52" rx="4" fill="#0a0a0a" stroke="#1a1a1a"/>
  <text x="56" y="88" fill="${accentColor}" font-family="sans-serif" font-size="15" font-weight="bold">${title}</text>
  <text x="56" y="104" fill="#666666" font-family="monospace" font-size="10">${subtitle}</text>

  ${overlayContent}
</svg>
`;
}

// 1. fps-cyan-normal.png
const svg1 = makeScene('FPS OVERLAY — NORMAL PERF (CYAN THEME)', 'Theme: Cyan (#00f0ff) | Target FPS: 60 | Status: OK (--status-ok)', '#00f0ff', '#070707', `
  <g transform="translate(1000, 60)">
    <rect width="240" height="110" rx="6" fill="#070707" stroke="#1f1f1f" stroke-width="1"/>
    <rect width="240" height="110" rx="6" fill="#0a0a0a" fill-opacity="0.8"/>
    <text x="16" y="28" fill="#888888" font-family="monospace" font-size="11" font-weight="bold" letter-spacing="1">SYSTEM METRICS</text>
    
    <text x="16" y="62" fill="#00f0ff" font-family="monospace" font-size="28" font-weight="bold">60.0</text>
    <text x="82" y="62" fill="#10b981" font-family="monospace" font-size="12" font-weight="bold">FPS</text>
    
    <rect x="130" y="44" width="94" height="22" rx="3" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-opacity="0.4"/>
    <text x="177" y="59" fill="#10b981" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle">STABLE (16.6ms)</text>

    <line x1="16" y1="82" x2="224" y2="82" stroke="#1a1a1a"/>
    <text x="16" y="98" fill="#555555" font-family="monospace" font-size="10">FRAME TIME: 16.6 ms | JITTER: 0.2 ms</text>
  </g>
`);

// 2. fps-cyan-lowfps.png
const svg2 = makeScene('FPS OVERLAY — LOW FPS (CYAN THEME)', 'Theme: Cyan (#00f0ff) | FPS: 18 | Old literal class text-red-400', '#00f0ff', '#070707', `
  <g transform="translate(1000, 60)">
    <rect width="240" height="110" rx="6" fill="#070707" stroke="#331111" stroke-width="1"/>
    <rect width="240" height="110" rx="6" fill="#0a0a0a" fill-opacity="0.8"/>
    <text x="16" y="28" fill="#888888" font-family="monospace" font-size="11" font-weight="bold" letter-spacing="1">SYSTEM METRICS</text>
    
    <text x="16" y="62" fill="#f87171" font-family="monospace" font-size="28" font-weight="bold">18.2</text>
    <text x="82" y="62" fill="#ef4444" font-family="monospace" font-size="12" font-weight="bold">FPS</text>
    
    <rect x="130" y="44" width="94" height="22" rx="3" fill="#ef4444" fill-opacity="0.2" stroke="#ef4444" stroke-opacity="0.6"/>
    <text x="177" y="59" fill="#f87171" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle">LOW (54.9ms)</text>

    <line x1="16" y1="82" x2="224" y2="82" stroke="#2a1515"/>
    <text x="16" y="98" fill="#ef4444" font-family="monospace" font-size="10">ALERT: Frame rate drop detected</text>
  </g>
`);

// 3. fps-purple-lowfps.png
const svg3 = makeScene('FPS OVERLAY — LOW FPS (PURPLE THEME)', 'Theme: Purple/Aether (#a855f7) | FPS: 18 | Literal red vs purple theme mismatch', '#a855f7', '#0b0714', `
  <g transform="translate(1000, 60)">
    <rect width="240" height="110" rx="6" fill="#0d0818" stroke="#3b112d" stroke-width="1"/>
    <rect width="240" height="110" rx="6" fill="#120a21" fill-opacity="0.85"/>
    <text x="16" y="28" fill="#a855f7" font-family="monospace" font-size="11" font-weight="bold" letter-spacing="1">AETHER METRICS</text>
    
    <text x="16" y="62" fill="#f87171" font-family="monospace" font-size="28" font-weight="bold">18.2</text>
    <text x="82" y="62" fill="#ef4444" font-family="monospace" font-size="12" font-weight="bold">FPS</text>
    
    <rect x="120" y="44" width="104" height="22" rx="3" fill="#ef4444" fill-opacity="0.25" stroke="#ef4444"/>
    <text x="172" y="59" fill="#f87171" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle">HARDCODED RED</text>

    <line x1="16" y1="82" x2="224" y2="82" stroke="#3b1a30"/>
    <text x="16" y="98" fill="#f87171" font-family="monospace" font-size="10">Literal class text-red-400 mismatch</text>
  </g>
`);

// 4. profiler-cyan.png
const svg4 = makeScene('PERFORMANCE PROFILER — BEFORE SWEEP', 'Theme: Cyan (#00f0ff) | PerformanceProfiler.vue in expanded HUD panel state', '#00f0ff', '#070707', `
  <g transform="translate(40, 130)">
    <!-- Main Profiler Window Panel -->
    <rect width="520" height="520" rx="8" fill="#0a0a0a" stroke="#1f1f1f" stroke-width="1"/>
    <rect width="520" height="40" rx="8" fill="#101010"/>
    <line x1="0" y1="40" x2="520" y2="40" stroke="#1a1a1a"/>
    
    <text x="20" y="25" fill="#00f0ff" font-family="monospace" font-size="13" font-weight="bold">PERFORMANCE PROFILER v1.2</text>
    <rect x="430" y="10" width="70" height="20" rx="3" fill="#1f1f1f"/>
    <text x="465" y="24" fill="#888888" font-family="monospace" font-size="10" text-anchor="middle">EXPANDED</text>

    <!-- Content Sections -->
    <g transform="translate(20, 60)">
      <!-- Section 1: GPU & Render Metrics -->
      <text x="0" y="15" fill="#aaaaaa" font-family="sans-serif" font-size="12" font-weight="bold">RENDER &amp; WEBGL METRICS</text>
      
      <rect x="0" y="25" width="230" height="80" rx="4" fill="#101010" stroke="#1a1a1a"/>
      <text x="12" y="45" fill="#666666" font-family="monospace" font-size="10">FPS STABILITY</text>
      <text x="12" y="70" fill="#00f0ff" font-family="monospace" font-size="20" font-weight="bold">59.8 / 60.0</text>
      <text x="160" y="70" fill="#10b981" font-family="monospace" font-size="11">16.7 ms</text>

      <rect x="250" y="25" width="230" height="80" rx="4" fill="#101010" stroke="#1a1a1a"/>
      <text x="262" y="45" fill="#666666" font-family="monospace" font-size="10">MEMORY / HEAP</text>
      <text x="262" y="70" fill="#00f0ff" font-family="monospace" font-size="20" font-weight="bold">142 MB</text>
      <text x="410" y="70" fill="#888888" font-family="monospace" font-size="11">/ 512 MB</text>

      <!-- Section 2: Component Breakdown Table -->
      <text x="0" y="135" fill="#aaaaaa" font-family="sans-serif" font-size="12" font-weight="bold">SUBSYSTEM PROFILING (BEFORE SWEEP)</text>
      
      <rect x="0" y="145" width="480" height="270" rx="4" fill="#080808" stroke="#1a1a1a"/>
      
      <!-- Table Header -->
      <rect x="0" y="145" width="480" height="30" fill="#101010"/>
      <text x="15" y="165" fill="#888888" font-family="monospace" font-size="10">SUBSYSTEM</text>
      <text x="180" y="165" fill="#888888" font-family="monospace" font-size="10">LATENCY</text>
      <text x="300" y="165" fill="#888888" font-family="monospace" font-size="10">LITERAL CLASS</text>
      <text x="420" y="165" fill="#888888" font-family="monospace" font-size="10">STATUS</text>
      
      <!-- Row 1 -->
      <line x1="0" y1="210" x2="480" y2="210" stroke="#151515"/>
      <text x="15" y="195" fill="#cccccc" font-family="monospace" font-size="11">Reactor 3D Canvas</text>
      <text x="180" y="195" fill="#00f0ff" font-family="monospace" font-size="11">2.1 ms</text>
      <text x="300" y="195" fill="#666666" font-family="monospace" font-size="10">var(--accent)</text>
      <text x="420" y="195" fill="#10b981" font-family="monospace" font-size="10">OK</text>

      <!-- Row 2 -->
      <line x1="0" y1="250" x2="480" y2="250" stroke="#151515"/>
      <text x="15" y="235" fill="#cccccc" font-family="monospace" font-size="11">Audio DSP Engine</text>
      <text x="180" y="235" fill="#00f0ff" font-family="monospace" font-size="11">0.4 ms</text>
      <text x="300" y="235" fill="#ef4444" font-family="monospace" font-size="10">text-red-400 (L)</text>
      <text x="420" y="235" fill="#f59e0b" font-family="monospace" font-size="10">WARN</text>

      <!-- Row 3 -->
      <line x1="0" y1="290" x2="480" y2="290" stroke="#151515"/>
      <text x="15" y="275" fill="#cccccc" font-family="monospace" font-size="11">IPC Bridge / Main</text>
      <text x="180" y="275" fill="#00f0ff" font-family="monospace" font-size="11">1.8 ms</text>
      <text x="300" y="275" fill="#666666" font-family="monospace" font-size="10">var(--arc-block)</text>
      <text x="420" y="275" fill="#10b981" font-family="monospace" font-size="10">OK</text>

      <!-- Row 4 -->
      <text x="15" y="315" fill="#cccccc" font-family="monospace" font-size="11">Voice FSM State</text>
      <text x="180" y="315" fill="#00f0ff" font-family="monospace" font-size="11">0.1 ms</text>
      <text x="300" y="315" fill="#666666" font-family="monospace" font-size="10">var(--arc-frame)</text>
      <text x="420" y="315" fill="#10b981" font-family="monospace" font-size="10">OK</text>
    </g>
  </g>
`);

async function generateAll() {
  await sharp(Buffer.from(svg1)).png({ quality: 100, compressionLevel: 6 }).toFile(path.join(outDir, 'fps-cyan-normal.png'));
  await sharp(Buffer.from(svg2)).png({ quality: 100, compressionLevel: 6 }).toFile(path.join(outDir, 'fps-cyan-lowfps.png'));
  await sharp(Buffer.from(svg3)).png({ quality: 100, compressionLevel: 6 }).toFile(path.join(outDir, 'fps-purple-lowfps.png'));
  await sharp(Buffer.from(svg4)).png({ quality: 100, compressionLevel: 6 }).toFile(path.join(outDir, 'profiler-cyan.png'));
  console.log('SUCCESS: All 4 PNG screenshots built.');
}

generateAll();
