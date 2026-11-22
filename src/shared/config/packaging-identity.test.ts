import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveAppWindowIconPath } from '../../main/utils/app-icon.util';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('S3-12 Packaging Identity, Icons & Metadata', () => {
  it('declares owner-approved metadata, NSIS identity, and safe uninstall defaults in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(pkg.author).toBe('DdepRest');
    expect(pkg.homepage).toBe('https://github.com/DdepRest/ARC');
    expect(pkg.repository?.url).toBe('https://github.com/DdepRest/ARC.git');
    expect(pkg.bugs?.url).toBe('https://github.com/DdepRest/ARC/issues');

    expect(pkg.build.appId).toBe('com.arc.cognitive');
    expect(pkg.build.productName).toBe('A.R.C.');
    expect(pkg.build.copyright).toContain('DdepRest');
    expect(pkg.build.directories.buildResources).toBe('build');

    expect(pkg.build.win.icon).toBe('build/icon.ico');
    expect(pkg.build.win.publisherName).toBe('DdepRest');
    expect(pkg.build.win.requestedExecutionLevel).toBe('asInvoker');
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(false);

    expect(pkg.build.nsis.installerIcon).toBe('build/icon.ico');
    expect(pkg.build.nsis.uninstallerIcon).toBe('build/icon.ico');
    expect(pkg.build.nsis.installerHeaderIcon).toBe('build/icon.ico');
    expect(pkg.build.nsis.shortcutName).toBe('A.R.C.');
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false);
    expect(pkg.build.nsis.createDesktopShortcut).toBe(true);
    expect(pkg.build.nsis.createStartMenuShortcut).toBe(true);
  });

  it('provides a valid 512x512 PNG application icon at build/icon.png', () => {
    const pngPath = path.join(REPO_ROOT, 'build', 'icon.png');
    expect(fs.existsSync(pngPath)).toBe(true);

    const buf = fs.readFileSync(pngPath);
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(512);
    expect(height).toBe(512);
  });

  it('provides a valid multi-resolution Windows ICO at build/icon.ico covering 16..256 px', () => {
    const icoPath = path.join(REPO_ROOT, 'build', 'icon.ico');
    expect(fs.existsSync(icoPath)).toBe(true);

    const buf = fs.readFileSync(icoPath);
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type = ICO
    const count = buf.readUInt16LE(4);
    expect(count).toBe(7);

    const expectedSizes = [16, 24, 32, 48, 64, 128, 256];
    const foundSizes: number[] = [];
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16;
      const rawW = buf.readUInt8(entryOffset + 0);
      const rawH = buf.readUInt8(entryOffset + 1);
      const w = rawW === 0 ? 256 : rawW;
      const h = rawH === 0 ? 256 : rawH;
      const bytesInRes = buf.readUInt32LE(entryOffset + 8);
      const imageOffset = buf.readUInt32LE(entryOffset + 12);

      expect(w).toBe(h);
      expect(bytesInRes).toBeGreaterThan(64);
      expect(imageOffset + bytesInRes).toBeLessThanOrEqual(buf.length);
      expect(buf.subarray(imageOffset, imageOffset + 8).equals(pngMagic)).toBe(true);
      foundSizes.push(w);
    }

    expect(foundSizes).toEqual(expectedSizes);
  });

  it('resolves window icon path safely in dev and packaged modes without throwing when missing', () => {
    const devResolved = resolveAppWindowIconPath({
      isPackaged: false,
      mainDir: path.join(REPO_ROOT, 'out', 'main'),
      cwd: REPO_ROOT
    });
    expect(devResolved).toBe(path.join(REPO_ROOT, 'build', 'icon.png'));

    const packagedResolved = resolveAppWindowIconPath({
      isPackaged: true,
      resourcesPath: '/mock/resources',
      existsSync: (p) => p === path.join('/mock/resources', 'icon.png')
    });
    expect(packagedResolved).toBe(path.join('/mock/resources', 'icon.png'));

    const missingResolved = resolveAppWindowIconPath({
      isPackaged: true,
      resourcesPath: '/nonexistent',
      existsSync: () => false
    });
    expect(missingResolved).toBeUndefined();
  });

  it('keeps THIRD_PARTY_NOTICES.md synchronized with all direct runtime dependencies in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const notices = fs.readFileSync(path.join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    const deps = Object.keys(pkg.dependencies || {});

    expect(notices).toContain(`The following ${deps.length} packages`);
    for (const dep of deps) {
      expect(notices).toContain(`| \`${dep}\` |`);
    }
    expect(notices).not.toContain('| `glob` |');
    expect(notices).toContain('CC BY-NC-SA 4.0');
  });

  it('includes honest Windows Authenticode & PE VersionInfo verification scripts', () => {
    const verifier = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'verify-win-artifacts.ps1'), 'utf8');
    const sigHelper = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'verify-win-signature.ps1'), 'utf8');

    expect(verifier).toContain('verify-win-signature.ps1');
    expect(verifier).toContain('-RequireSigned');
    expect(verifier).toContain('ARTIFACT_VERIFICATION.json');
    expect(sigHelper).toContain('Get-AuthenticodeSignature');
    expect(sigHelper).toContain('TRUSTED_SIGNED');
    expect(sigHelper).toContain('UNSIGNED');
    expect(sigHelper).toContain('INVALID_OR_UNTRUSTED');
  });
});
