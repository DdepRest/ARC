import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { maskSecrets } from '../../../shared/utils/log-sanitizer';
import { approvalService } from '../approval.service';
import type { ShellExecutionMode } from '../sandbox/types';

export interface ShellApprovalOptions {
  macroId?: string;
  reason?: string;
  purpose?: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ShellApprovalTarget {
  executable: string;
  args: string[];
  cwd?: string;
  purpose?: string;
  displayCommand: string;
  shellMode: ShellExecutionMode;
  consequences?: string;
}

export class ShellApprovalService {
  private static instance: ShellApprovalService;
  private auditLogPath: string;

  private constructor() {
    let dataDir: string;
    try {
      dataDir =
        app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(process.cwd(), 'data');
    } catch {
      dataDir = path.join(process.cwd(), 'data');
    }
    this.auditLogPath = path.join(dataDir, 'audit.log');
  }

  public static getInstance(): ShellApprovalService {
    if (!ShellApprovalService.instance) {
      ShellApprovalService.instance = new ShellApprovalService();
    }
    return ShellApprovalService.instance;
  }

  public getCommandHash(command: string): string {
    return crypto.createHash('sha256').update(command.trim()).digest('hex').substring(0, 16);
  }

  public getAuditLogPath(): string {
    return this.auditLogPath;
  }

  public rotateAuditLogIfNeeded(): void {
    try {
      if (!fs.existsSync(this.auditLogPath)) return;
      const stat = fs.statSync(this.auditLogPath);
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - stat.mtimeMs > SEVEN_DAYS_MS) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(path.dirname(this.auditLogPath), `audit-${timestamp}.log.old`);
        fs.renameSync(this.auditLogPath, backupPath);
        console.log(`[ShellApprovalService] Audit log rotated to ${maskSecrets(backupPath)}`);
      }
    } catch (err: any) {
      console.warn('[ShellApprovalService] Audit log rotation check failed:', maskSecrets(err?.message || err));
    }
  }

  public logAudit(
    commandOrTarget: string | Pick<ShellApprovalTarget, 'displayCommand' | 'executable' | 'shellMode'>,
    choice: 'approve' | 'cancel' | 'blocked',
    extra?: { exitCode?: number | null; status?: string }
  ): void {
    try {
      const dataDir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.rotateAuditLogIfNeeded();
      const rawCommand =
        typeof commandOrTarget === 'string' ? commandOrTarget : commandOrTarget.displayCommand;
      const hash = this.getCommandHash(rawCommand);
      const timestamp = new Date().toISOString();

      const details: string[] = [];
      if (typeof commandOrTarget !== 'string') {
        details.push(`exec: ${maskSecrets(commandOrTarget.executable)}`);
        details.push(`mode: ${commandOrTarget.shellMode}`);
      }
      if (extra?.status) {
        details.push(`status: ${maskSecrets(extra.status)}`);
      }
      if (extra?.exitCode !== undefined && extra.exitCode !== null) {
        details.push(`exit: ${extra.exitCode}`);
      }

      const suffix = details.length > 0 ? ` | ${details.join(' | ')}` : '';
      const entry = `[AUDIT] SHELL_RUN approval: ${hash} | user_choice: ${choice} | ${timestamp}${suffix}\n`;
      fs.appendFileSync(this.auditLogPath, entry, 'utf8');
      console.log(entry.trimEnd());
    } catch (err: any) {
      console.error('[ShellApprovalService] Failed to write audit log:', maskSecrets(err?.message || err));
    }
  }

  public async requestShellApproval(
    targetInput: string | ShellApprovalTarget,
    options?: ShellApprovalOptions
  ): Promise<boolean> {
    const timeoutMs = options?.timeoutMs ?? 60000; // 60 seconds auto-timeout

    if (typeof targetInput === 'string') {
      const sanitizedTarget = maskSecrets(targetInput);
      const sanitizedPurpose = maskSecrets(options?.purpose || options?.reason || 'Выполнение команды в системе');
      const commandHash = this.getCommandHash(targetInput);
      const firstToken = targetInput.trim().split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '') || '';

      const approved = await approvalService.requestApproval({
        actionType: 'SHELL_RUN',
        target: sanitizedTarget,
        reason: sanitizedPurpose,
        timeoutMs,
        metadata: {
          macroId: options?.macroId,
          commandHash,
          executable: maskSecrets(firstToken),
          cwd: options?.cwd ? maskSecrets(options.cwd) : undefined,
          purpose: sanitizedPurpose,
          shellMode: 'direct' as ShellExecutionMode
        }
      });

      this.logAudit(targetInput, approved ? 'approve' : 'cancel');
      return approved;
    }

    const sanitizedExec = maskSecrets(targetInput.executable);
    const sanitizedArgs = targetInput.args.map((arg) => maskSecrets(arg));
    const effectiveCwd = maskSecrets(targetInput.cwd || options?.cwd || process.cwd());
    const sanitizedPurpose = maskSecrets(
      targetInput.purpose || options?.purpose || options?.reason || 'Выполнение внешней команды'
    );
    const isUnsafeRaw = targetInput.shellMode === 'unsafe_raw_shell';
    const consequences = maskSecrets(
      targetInput.consequences ||
        (isUnsafeRaw
          ? 'ОПАСНЫЙ РЕЖИМ: интерпретация через системный shell (цепочки команд, редиректы, переменные окружения).'
          : 'Прямой запуск процесса без системного shell (shell: false); процесс может читать/изменять файлы в рабочей директории.')
    );

    const previewLines = [
      maskSecrets(targetInput.displayCommand),
      `executable: ${sanitizedExec}`,
      `args: ${JSON.stringify(sanitizedArgs)}`,
      `cwd: ${effectiveCwd}`,
      `mode: ${targetInput.shellMode}`,
      `consequences: ${consequences}`
    ];

    const reasonText = isUnsafeRaw
      ? `⚠️ ${sanitizedPurpose} [ОПАСНЫЙ РЕЖИМ RAW SHELL]`
      : sanitizedPurpose;

    const commandHash = this.getCommandHash(targetInput.displayCommand);
    const approved = await approvalService.requestApproval({
      actionType: 'SHELL_RUN',
      target: previewLines.join('\n'),
      reason: reasonText,
      timeoutMs,
      metadata: {
        macroId: options?.macroId,
        commandHash,
        executable: sanitizedExec,
        args: sanitizedArgs,
        cwd: effectiveCwd,
        purpose: sanitizedPurpose,
        shellMode: targetInput.shellMode,
        consequences
      }
    });

    this.logAudit(targetInput, approved ? 'approve' : 'cancel');
    return approved;
  }
}

export const shellApprovalService = ShellApprovalService.getInstance();
