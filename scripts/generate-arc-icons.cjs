/**
 * Generates A.R.C. application icon assets (build/icon.png and multi-resolution build/icon.ico)
 * from a master square artwork without requiring external binaries or additional npm packages.
 */
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_MASTER_SIZE = 512;

/**
 * Encodes an array of { size, pngBuffer } entries into a valid Windows .ico binary buffer
 * using PNG-compressed frames (supported natively by Windows Vista+, Electron, and rcedit).
 */
function encodePngFramesToIco(frames) {
  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entrySize * frames.length;
  const totalBytes = dirSize + frames.reduce((sum, f) => sum + f.pngBuffer.length, 0);

  const out = Buffer.alloc(totalBytes);
  // ICONDIR header
  out.writeUInt16LE(0, 0); // idReserved
  out.writeUInt16LE(1, 2); // idType = 1 (ICO)
  out.writeUInt16LE(frames.length, 4); // idCount

  let dataOffset = dirSize;
  for (let i = 0; i < frames.length; i++) {
    const { size, pngBuffer } = frames[i];
    const entryOffset = headerSize + i * entrySize;
    const dimByte = size >= 256 ? 0 : size;

    out.writeUInt8(dimByte, entryOffset + 0); // bWidth (0 means 256)
    out.writeUInt8(dimByte, entryOffset + 1); // bHeight (0 means 256)
    out.writeUInt8(0, entryOffset + 2); // bColorCount
    out.writeUInt8(0, entryOffset + 3); // bReserved
    out.writeUInt16LE(1, entryOffset + 4); // wPlanes
    out.writeUInt16LE(32, entryOffset + 6); // wBitCount (32-bit RGBA)
    out.writeUInt32LE(pngBuffer.length, entryOffset + 8); // dwBytesInRes
    out.writeUInt32LE(dataOffset, entryOffset + 12); // dwImageOffset

    pngBuffer.copy(out, dataOffset);
    dataOffset += pngBuffer.length;
  }

  return out;
}

/**
 * Applies a crisp anti-aliased rounded-square alpha mask to a square Jimp image.
 */
function applyRoundedSquareMask(img, cornerRadiusRatio = 0.16) {
  const size = img.bitmap.width;
  const radius = size * cornerRadiusRatio;
  const innerMin = radius;
  const innerMax = size - 1 - radius;

  img.scan(0, 0, size, size, function (x, y, idx) {
    const dx = x < innerMin ? innerMin - x : x > innerMax ? x - innerMax : 0;
    const dy = y < innerMin ? innerMin - y : y > innerMax ? y - innerMax : 0;
    if (dx === 0 || dy === 0) return;

    const dist = Math.hypot(dx, dy);
    if (dist > radius + 0.75) {
      this.bitmap.data[idx + 3] = 0;
    } else if (dist > radius - 0.75) {
      const coverage = Math.max(0, Math.min(1, (radius + 0.75 - dist) / 1.5));
      this.bitmap.data[idx + 3] = Math.round(this.bitmap.data[idx + 3] * coverage);
    }
  });
}

async function generateArcIcons(sourcePath, outputDir) {
  const absSource = path.resolve(sourcePath);
  const absOut = path.resolve(outputDir);
  fs.mkdirSync(absOut, { recursive: true });

  const master = await Jimp.read(absSource);
  const minDim = Math.min(master.bitmap.width, master.bitmap.height);
  // Center-crop 6.5% inset from each edge to completely eliminate outer JPG framing margin
  const inset = Math.round(minDim * 0.065);
  const cropSize = minDim - inset * 2;
  const offsetX = Math.round((master.bitmap.width - cropSize) / 2);
  const offsetY = Math.round((master.bitmap.height - cropSize) / 2);

  master.crop(offsetX, offsetY, cropSize, cropSize);

  const png512 = master.clone().resize(PNG_MASTER_SIZE, PNG_MASTER_SIZE, Jimp.RESIZE_BICUBIC);
  applyRoundedSquareMask(png512, 0.16);
  const pngOutPath = path.join(absOut, 'icon.png');
  await png512.writeAsync(pngOutPath);

  const frames = [];
  for (const size of ICO_SIZES) {
    const resized = master.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
    applyRoundedSquareMask(resized, 0.16);
    const pngBuffer = await resized.getBufferAsync(Jimp.MIME_PNG);
    frames.push({ size, pngBuffer });
  }

  const icoBuffer = encodePngFramesToIco(frames);
  const icoOutPath = path.join(absOut, 'icon.ico');
  fs.writeFileSync(icoOutPath, icoBuffer);

  return {
    pngOutPath,
    icoOutPath,
    icoSizes: ICO_SIZES,
    icoBytes: icoBuffer.length,
    pngBytes: fs.statSync(pngOutPath).size
  };
}

if (require.main === module) {
  const sourceArg = process.argv[2];
  const outArg = process.argv[3] || path.resolve(__dirname, '../build');
  if (!sourceArg) {
    console.error('Usage: node scripts/generate-arc-icons.cjs <source-image> [output-dir]');
    process.exit(1);
  }
  generateArcIcons(sourceArg, outArg)
    .then((res) => {
      console.log('Generated A.R.C. icons:', JSON.stringify(res));
    })
    .catch((err) => {
      console.error('Icon generation failed:', err);
      process.exit(1);
    });
}

module.exports = {
  ICO_SIZES,
  encodePngFramesToIco,
  generateArcIcons
};
