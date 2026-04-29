import { Router } from 'express';
import Database from 'better-sqlite3';
import { getRecentActivity } from '../services/activity.js';

export function dashboardRoutes(db: Database.Database): Router {
  const router = Router();

  // GET / — dashboard summary
  router.get('/', (_req, res) => {
    // Stats
    const activeProjects = (db.prepare(`
      SELECT COUNT(*) AS count FROM projects
      WHERE archived = 0 AND stage != 'done'
    `).get() as { count: number }).count;

    const blocked = (db.prepare(`
      SELECT COUNT(*) AS count FROM blockers WHERE resolved = 0
    `).get() as { count: number }).count;

    const dueThisWeek = (db.prepare(`
      SELECT COUNT(*) AS count FROM projects
      WHERE archived = 0
        AND stage != 'done'
        AND due_date IS NOT NULL
        AND due_date >= date('now')
        AND due_date <= date('now', '+7 days')
    `).get() as { count: number }).count;

    const completedThisMonth = (db.prepare(`
      SELECT COUNT(*) AS count FROM projects
      WHERE stage = 'done'
        AND updated_at >= date('now', 'start of month')
    `).get() as { count: number }).count;

    // Active blockers with project context
    const activeBlockerRows = db.prepare(`
      SELECT
        b.id,
        b.description,
        b.project_id,
        b.created_at,
        p.title AS project_title,
        c.name AS customer_name,
        CAST((julianday('now') - julianday(b.created_at)) AS INTEGER) AS days_blocked
      FROM blockers b
      JOIN projects p ON p.id = b.project_id
      JOIN customers c ON c.id = p.customer_id
      WHERE b.resolved = 0
      ORDER BY b.created_at ASC
    `).all() as { id: string; description: string; project_id: string; project_title: string; customer_name: string; days_blocked: number; created_at: string }[];

    // Projects due in the next 7 days
    const dueSoonRows = db.prepare(`
      SELECT p.id, p.title, p.due_date, p.stage, c.name AS customer_name
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.archived = 0
        AND p.stage != 'done'
        AND p.due_date IS NOT NULL
        AND p.due_date >= date('now')
        AND p.due_date <= date('now', '+7 days')
      ORDER BY p.due_date ASC
    `).all() as { id: string; title: string; due_date: string; stage: string; customer_name: string }[];

    const activityRows = getRecentActivity(db, 20) as {
      id: string; type: string; payload: string | null;
      created_at: string; project_id: string | null;
      project_title: string | null; username: string | null;
    }[];

    res.json({
      stats: {
        active: activeProjects,
        blocked,
        due_this_week: dueThisWeek,
        completed: completedThisMonth,
      },
      active_blockers: activeBlockerRows.map((b) => ({
        id: b.id,
        description: b.description,
        days_blocked: b.days_blocked,
        created_at: b.created_at,
        project: { id: b.project_id, title: b.project_title },
        customer: { name: b.customer_name },
      })),
      due_soon: dueSoonRows.map((p) => ({
        id: p.id,
        title: p.title,
        due_date: p.due_date,
        stage: p.stage,
        customer: { name: p.customer_name },
      })),
      recent_activity: activityRows.map((a) => {
        let details: string | undefined;
        if (a.payload) {
          try {
            const parsed = JSON.parse(a.payload) as Record<string, unknown>;
            details = (parsed.details ?? parsed.description ?? parsed.title) as string | undefined;
          } catch {
            details = a.payload;
          }
        }
        return {
          id: a.id,
          action: a.type,
          details,
          created_at: a.created_at,
          project: a.project_id ? { id: a.project_id, title: a.project_title ?? '' } : undefined,
          user: a.username ? { username: a.username } : undefined,
        };
      }),
    });
  });

  return router;
}
