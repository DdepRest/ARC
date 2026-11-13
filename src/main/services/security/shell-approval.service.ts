import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { approvalService } from '../approval.service';

export interface ShellApprovalOptions {
  macroId?: string;
  reason?: string;
  timeoutMs?: number;
}

export class ShellApprovalService {
  private static instance: ShellApprovalService;
  private auditLogPath: string;

  private constructor() {
    let dataDir: string;
    try {
      dataDir = (app && typeof app.getPath === 'function') 
        ? app.getPath('userData') 
        : path.join(process.cwd(), 'data');
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
        console.log(`[ShellApprovalService] Audit log rotated to ${backupPath}`);
      }
    } catch (err: any) {
      console.warn('[ShellApprovalService] Audit log rotation check failed:', err?.message || err);
    }
  }

  public logAudit(command: string, choice: 'approve' | 'cancel'): void {
    try {
      const dataDir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.rotateAuditLogIfNeeded();
      const hash = this.getCommandHash(command);
      const timestamp = new Date().toISOString();
      const entry = `[AUDIT] SHELL_RUN approval: ${hash} | user_choice: ${choice} | ${timestamp}\n`;
      fs.appendFileSync(this.auditLogPath, entry, 'utf8');
      console.log(`[AUDIT] SHELL_RUN approval: ${hash} | user_choice: ${choice} | ${timestamp}`);
    } catch (err: any) {
      console.error('[ShellApprovalService] Failed to write audit log:', err?.message || err);
    }
  }

  public async requestShellApproval(command: string, options?: ShellApprovalOptions): Promise<boolean> {
    const timeoutMs = options?.timeoutMs ?? 60000; // 60 seconds auto-timeout
    const approved = await approvalService.requestApproval({
      actionType: 'SHELL_RUN',
      target: command,
      reason: options?.reason || 'Выполнение shell команды в системе',
      timeoutMs,
      metadata: {
        macroId: options?.macroId,
        commandHash: this.getCommandHash(command)
      }
    });

    this.logAudit(command, approved ? 'approve' : 'cancel');
    return approved;
  }
}

export const shellApprovalService = ShellApprovalService.getInstance();
