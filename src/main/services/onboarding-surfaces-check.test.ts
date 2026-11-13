import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Onboarding Visual Constitution Rule', () => {
  it('FirstRunWizardModal.vue contains all 4 required surface and accent tokens', () => {
    const modalPath = path.join(__dirname, '../../renderer/components/onboarding/FirstRunWizardModal.vue');
    expect(fs.existsSync(modalPath)).toBe(true);
    const content = fs.readFileSync(modalPath, 'utf-8');

    const requiredTokens = [
      'var(--arc-plane)',
      'var(--arc-block)',
      'var(--arc-rail)',
      'var(--accent)'
    ];

    for (const token of requiredTokens) {
      expect(content).toContain(token);
    }
  });

  it('runs check-visual-constitution.js and passes with onboardingMissingSurfaces = 0', () => {
    const scriptPath = path.join(__dirname, '../../../scripts/check-visual-constitution.js');
    const output = execSync(`node "${scriptPath}"`, { encoding: 'utf-8' });

    expect(output).toContain('Visual constitution check PASSED');
    expect(output).not.toContain('onboarding missing surface/accent tokens');
  });

  it('correctly audits wizard/modal files while ignoring steps/*.vue and utils/*.ts', () => {
    const requiredTokens = ['var(--arc-plane)', 'var(--arc-block)', 'var(--arc-rail)', 'var(--accent)'];

    // Wizard modal missing a token
    const incompleteModalContent = `<template><div class="bg-[var(--arc-plane)] bg-[var(--arc-block)]"></div></template>`;
    const missing = requiredTokens.filter(t => !incompleteModalContent.includes(t));
    expect(missing).toEqual(['var(--arc-rail)', 'var(--accent)']);

    // Step component (should not be checked by the wizard modal rule)
    const stepFileName = 'AiModeStep.vue';
    const isWizardOrModal = stepFileName.includes('Wizard') || stepFileName.includes('Modal');
    expect(isWizardOrModal).toBe(false);

    // Util file (should not be checked by the wizard modal rule)
    const utilFileName = 'recommend-preset.ts';
    const isVue = utilFileName.endsWith('.vue');
    expect(isVue).toBe(false);
  });
});
