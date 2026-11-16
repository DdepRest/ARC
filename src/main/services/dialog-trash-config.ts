import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';

export interface DialogTrashConfig {
  retentionDays: number | null;
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_RETENTION_DAYS = 36500;

export function normalizeSessionIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const raw of ids) {
    const num = Number(raw);
    if (Number.isInteger(num) && num > 0 && !seen.has(num)) {
      seen.add(num);
      result.push(num);
    }
  }
  return result;
}

export function validateRetentionDays(
  input: unknown
): { valid: true; retentionDays: number | null } | { valid: false; error: string } {
  if (input === null || input === undefined || input === 'off') {
    return { valid: true, retentionDays: null };
  }

  let parsed: number;
  if (typeof input === 'number') {
    parsed = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, error: 'Укажите положительное целое число дней' };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, error: 'Срок хранения должен быть целым положительным числом дней' };
    }
    parsed = Number(trimmed);
  } else {
    return { valid: false, error: 'Некорректное значение срока хранения' };
  }

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return { valid: false, error: 'Укажите целое положительное число дней (не менее 1)' };
  }
  if (parsed > MAX_RETENTION_DAYS) {
    return { valid: false, error: `Максимальный срок хранения — ${MAX_RETENTION_DAYS} дней` };
  }

  return { valid: true, retentionDays: parsed };
}

export function getDefaultTrashConfigPath(): string {
  try {
    return path.join(app.getPath('userData'), 'arc-dialog-trash-config.json');
  } catch {
    return path.join(os.homedir(), '.arc-dialog-trash-config.json');
  }
}

export function getTrashConfig(configPath: string = getDefaultTrashConfigPath()): DialogTrashConfig {
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const check = validateRetentionDays(raw?.retentionDays ?? null);
      if (check.valid) {
        return { retentionDays: check.retentionDays };
      }
    }
  } catch (e) {
    console.warn('[DialogTrashService] Failed to read trash config, using disabled default:', e);
  }
  return { retentionDays: null };
}

export function setTrashConfig(
  retentionDaysInput: unknown,
  configPath: string = getDefaultTrashConfigPath()
): { success: boolean; config?: DialogTrashConfig; error?: string } {
  const check = validateRetentionDays(retentionDaysInput);
  if ('error' in check) {
    return { success: false, error: check.error };
  }

  const nextConfig: DialogTrashConfig = { retentionDays: check.retentionDays };
  const tmpPath = `${configPath}.tmp-${process.pid}`;
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tmpPath, JSON.stringify(nextConfig, null, 2), 'utf-8');
    fs.renameSync(tmpPath, configPath);
    return { success: true, config: nextConfig };
  } catch (e: any) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    return { success: false, error: e?.message || 'Не удалось сохранить настройки корзины' };
  }
}
