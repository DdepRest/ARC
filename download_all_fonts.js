const https = require('https');
const fs = require('fs');
const path = require('path');

const cssUrl =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=JetBrains+Mono:wght@400..700&family=Onest:wght@300..700&family=Tektur:wght@400..900&display=swap';
const outputDir = path.join(__dirname, 'src/renderer/assets/fonts');
const fontsCssPath = path.join(__dirname, 'src/renderer/assets/styles/fonts.css');
const ALLOWED_SUBSETS = new Set(['cyrillic-ext', 'cyrillic', 'latin-ext', 'latin']);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

https.get(
  cssUrl,
  {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', async () => {
      const blockRegex = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/gi;
      let match;
      const cssBlocks = [
        '/* A.R.C. Local Font Faces (Offline-First: Inter, JetBrains Mono, Onest, Tektur) */',
      ];

      while ((match = blockRegex.exec(data)) !== null) {
        const subset = match[1].trim();
        const body = match[2];
        if (!ALLOWED_SUBSETS.has(subset)) continue;

        const familyMatch = body.match(/font-family:\s*'([^']+)'/);
        const styleMatch = body.match(/font-style:\s*([^;]+);/);
        const weightMatch = body.match(/font-weight:\s*([^;]+);/);
        const urlMatch = body.match(/url\((https:\/\/[^)]+\.woff2)\)/);
        const rangeMatch = body.match(/unicode-range:\s*([^;]+);/);

        if (!familyMatch || !urlMatch || !rangeMatch) continue;

        const family = familyMatch[1];
        const style = styleMatch ? styleMatch[1].trim() : 'normal';
        const weight = weightMatch ? weightMatch[1].trim() : '400';
        const remoteUrl = urlMatch[1];
        const unicodeRange = rangeMatch[1].trim();

        const slug = family.toLowerCase().replace(/\s+/g, '-');
        const filename = `${slug}-${subset}.woff2`;
        const filepath = path.join(outputDir, filename);

        await downloadFile(remoteUrl, filepath);
        const sizeKb = (fs.statSync(filepath).size / 1024).toFixed(1);
        console.log(`Downloaded ${filename} (${sizeKb} KB)`);

        cssBlocks.push(`/* ${family} - ${subset} */
@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url('../fonts/${filename}') format('woff2');
  unicode-range: ${unicodeRange};
}`);
      }

      fs.writeFileSync(fontsCssPath, cssBlocks.join('\n\n') + '\n', 'utf-8');
      console.log(`Updated ${fontsCssPath} with local @font-face rules.`);
    });
  }
);

