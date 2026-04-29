import { Router } from 'express';
import Database from 'better-sqlite3';

interface ProjectRow {
  id: string;
  title: string;
  stage: string;
  due_date: string | null;
  archived: number;
  customer_name: string;
}

interface TaskRow {
  id: string;
  title: string;
  stage: string;
  sort_order: number;
}

export function shareRoutes(db: Database.Database): Router {
  const router = Router();

  // GET /:token — public project view by share token
  router.get('/:token', (req, res) => {
    const { token } = req.params;

    const project = db.prepare(`
      SELECT
        p.id,
        p.title,
        p.stage,
        p.due_date,
        p.archived,
        c.name AS customer_name
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.share_token = ?
    `).get(token) as ProjectRow | undefined;

    if (!project || project.archived) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const tasks = db.prepare(`
      SELECT id, title, stage, sort_order
      FROM tasks
      WHERE project_id = ?
      ORDER BY sort_order, id
    `).all(project.id) as TaskRow[];

    // Count tasks per stage
    const stageCounts: Record<string, number> = {};
    for (const task of tasks) {
      stageCounts[task.stage] = (stageCounts[task.stage] ?? 0) + 1;
    }

    res.json({
      id: project.id,
      title: project.title,
      stage: project.stage,
      due_date: project.due_date,
      customer_name: project.customer_name,
      tasks,
      task_counts: stageCounts,
    });
  });

  return router;
}
