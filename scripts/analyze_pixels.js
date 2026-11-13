const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), 'docs/phase6-sweep/run-1/before');
const files = ['fps-cyan-normal.png', 'fps-cyan-lowfps.png', 'fps-purple-lowfps.png', 'profiler-cyan.png'];

async function analyze() {
  for (const f of files) {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) {
      console.log(`=== ${f} === FILE NOT FOUND`);
      continue;
    }
    const meta = await sharp(filePath).metadata();
    const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
    
    const colorMap = new Map();
    const totalPixels = info.width * info.height;
    
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const key = `${r},${g},${b}`;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }
    
    const sorted = [...colorMap.entries()].sort((a,b) => b[1] - a[1]);
    
    console.log(`=== ${f} ===`);
    console.log(`Size: ${info.width}x${info.height}, channels: ${info.channels}`);
    console.log(`Unique colors: ${colorMap.size}`);
    console.log(`Top 5 dominant colors:`);
    sorted.slice(0, 5).forEach(([rgb, count]) => {
      console.log(`  RGB(${rgb}): ${count} px (${((count/totalPixels)*100).toFixed(2)}%)`);
    });

    // Sample coordinates for FpsOverlay / PerformanceProfiler overlay centers
    const getPixelAt = (x, y) => {
      const idx = (y * info.width + x) * info.channels;
      return [data[idx], data[idx+1], data[idx+2]];
    };

    console.log(`Sample Inset Pixel (x=1125, y=90 - Overlay Body Center): RGB(${getPixelAt(1125, 90).join(',')})`);
    console.log(`Sample Inset Pixel (x=1005, y=35 - Border Inset +5px): RGB(${getPixelAt(1005, 35).join(',')})`);
    console.log(`Sample Inset Pixel (x=640, y=360 - Viewport Center): RGB(${getPixelAt(640, 360).join(',')})`);
    console.log('---');
  }
}

analyze();
