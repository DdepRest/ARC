import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sbomGen = require('../../../scripts/generate-sbom.cjs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('S4-05 CycloneDX 1.5 SBOM & License Provenance', () => {
  it('generates a valid CycloneDX 1.5 JSON SBOM covering npm, Python Silero, pinned ML models, and local assets', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-sbom-test-'));
    try {
      const outPath = path.join(tmpDir, 'sbom-cyclonedx.json');
      const result = sbomGen.generateSbom({
        rootDir: REPO_ROOT,
        outputPath: outPath,
        commitSha: '1234567890abcdef1234567890abcdef12345678'
      });

      expect(fs.existsSync(outPath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));

      expect(parsed.bomFormat).toBe('CycloneDX');
      expect(parsed.specVersion).toBe('1.5');
      expect(parsed.serialNumber).toMatch(/^urn:uuid:/);
      expect(parsed.metadata.component.name).toBe('A.R.C.');
      expect(parsed.metadata.component.authors[0].name).toBe('DdepRest');

      // Explicit non-commercial release boundary due to bundled Silero TTS CC-BY-NC-SA-4.0
      const policyProp = parsed.metadata.component.properties.find(
        (p: { name: string }) => p.name === 'arc:distributionPolicy'
      );
      expect(policyProp?.value).toBe('non-commercial-open-source');

      // Every direct runtime dependency in package.json must appear in SBOM
      const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
      const npmNames = new Set(
        parsed.components
          .filter((c: { properties?: Array<{ name: string; value: string }> }) =>
            c.properties?.some((p) => p.name === 'arc:ecosystem' && p.value === 'npm')
          )
          .map((c: { name: string }) => c.name)
      );
      for (const dep of Object.keys(pkg.dependencies || {})) {
        expect(npmNames.has(dep)).toBe(true);
      }

      // Python Silero runtime dependencies (9 core + 2 optional = 11)
      expect(result.counts.python).toBe(11);

      // Pinned ML models with SHA-256 and revisions
      const mlModels = parsed.components.filter((c: { type: string }) => c.type === 'machine-learning-model');
      expect(mlModels.length).toBeGreaterThanOrEqual(5);

      const silero = mlModels.find((m: { name: string }) => m.name === 'v5_6_ru.pt');
      expect(silero).toBeDefined();
      expect(silero.licenses[0].license.id).toBe('CC-BY-NC-SA-4.0');
      expect(silero.hashes[0].alg).toBe('SHA-256');
      expect(silero.hashes[0].content).toBe('04cc9b1d08ce38bcaa9d02c488d80d3e6806d17f7eaa7c95982f36a3cbf50b2e');
      expect(
        silero.properties.some((p: { name: string; value: string }) => p.name === 'arc:commercialUseAllowed' && p.value === 'false')
      ).toBe(true);

      // Bundled fonts & A.R.C. icon assets
      expect(result.counts.assets).toBeGreaterThanOrEqual(6);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('documents the non-commercial Silero boundary and RC bundle checklist honestly', () => {
    const notices = fs.readFileSync(path.join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    const rcNotes = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'release-notes-v1.0.12-rc.md'), 'utf8');
    const releaseYml = fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'release.yml'), 'utf8');

    expect(notices).toContain('Non-Commercial Distribution Boundary');
    expect(notices).toContain('OFL-1.1');
    expect(rcNotes).toContain('UNSIGNED');
    expect(rcNotes).toContain('CC BY-NC-SA 4.0');
    expect(rcNotes).toContain('sbom-cyclonedx.json');
    expect(releaseYml).toContain('npm run generate:sbom');
    expect(releaseYml).toContain('dist/sbom-cyclonedx.json');
    expect(releaseYml).toContain('dist/ARTIFACT_VERIFICATION.json');
  });
});
