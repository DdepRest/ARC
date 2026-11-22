import { DatabaseService } from '../database';
import { BehaviorEvent, BehaviorEventType } from '../../../shared/types/memory';

export class BehavioralMemory {
  private db = DatabaseService.db;
  private isDbAvailable: boolean = false;

  constructor() {
    this.isDbAvailable = !!this.db;
  }

  logEvent(event: BehaviorEvent): void {
    if (!this.isDbAvailable) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO behavioral_events (id, type, context, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        event.id,
        event.type,
        JSON.stringify(event.context),
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.timestamp || Date.now()
      );
    } catch (e) {
      console.error("BM: Log event failed", e);
    }
  }

  getRecentEvents(limit: number): BehaviorEvent[] {
    if (!this.isDbAvailable) return [];
    try {
      const stmt = this.db.prepare('SELECT * FROM behavioral_events ORDER BY timestamp DESC LIMIT ?');
      const rows = stmt.all(limit);
      return rows.map((row: unknown) => this.mapRow(row));
    } catch (e) {
      return [];
    }
  }

  private mapRow(row: any): BehaviorEvent {
    return {
      id: row.id,
      type: row.type as BehaviorEventType,
      context: JSON.parse(row.context),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    };
  }
}
