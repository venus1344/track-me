import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

interface LogActivityParams {
  projectId?: string | null;
  taskId?: string | null;
  userId?: string | null;
  type: string;
  payload?: unknown;
}

export function logActivity(db: Database.Database, params: LogActivityParams): void {
  const { projectId, taskId, userId, type, payload } = params;
  db.prepare(`
    INSERT INTO activity (id, project_id, task_id, user_id, type, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    uuid(),
    projectId ?? null,
    taskId ?? null,
    userId ?? null,
    type,
    payload !== undefined ? JSON.stringify(payload) : null
  );
}

export function getProjectActivity(db: Database.Database, projectId: string, limit = 50): unknown[] {
  return db.prepare(`
    SELECT
      a.*,
      u.username
    FROM activity a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.project_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(projectId, limit);
}

export function getRecentActivity(db: Database.Database, limit = 20): unknown[] {
  return db.prepare(`
    SELECT
      a.*,
      u.username,
      p.title AS project_title,
      c.name AS customer_name
    FROM activity a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);
}
