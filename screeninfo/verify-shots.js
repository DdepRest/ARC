// Report size, brightness and uniqueness of the captured screenshots.
//   node screeninfo/verify-shots.js [dir]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Jimp = require('jimp');

const dir = process.argv[2] || 'screeninfo';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && !f.startsWith('.')).sort();

(async () => {
  const seen = new Map();
  for (const f of files) {
    const p = path.join(dir, f);
    const img = await Jimp.read(p);
    let sum = 0, lit = 0, n = 0;
    const step = 4;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
      if (x % step || y % step) return;
      const lum =
        0.2126 * this.bitmap.data[idx] +
        0.7152 * this.bitmap.data[idx + 1] +
        0.0722 * this.bitmap.data[idx + 2];
      sum += lum; n++;
      if (lum > 24) lit++;
    });
    const hash = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
    const dup = seen.get(hash);
    seen.set(hash, f);
    console.log(
      `${f.padEnd(28)} ${img.bitmap.width}x${img.bitmap.height}  mean=${(sum / n).toFixed(1).padStart(5)}  lit=${((lit / n) * 100).toFixed(1).padStart(5)}%  md5=${hash}${dup ? '  DUP-OF ' + dup : ''}`
    );
  }
})();
