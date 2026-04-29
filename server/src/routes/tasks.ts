import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  stage: string;
  sort_order: number;
  created_at: string;
}

export function taskRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  // GET / — list tasks for project
  router.get('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const rows = db.prepare(`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM blockers b WHERE b.task_id = t.id AND b.resolved = 0) AS active_blockers
      FROM tasks t
      WHERE t.project_id = ?
      ORDER BY t.sort_order, t.id
    `).all(projectId);
    res.json(rows);
  });

  // GET /:taskId — single task with project info and blockers
  router.get('/:taskId', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    const task = db.prepare(`
      SELECT
        t.*,
        p.title AS project_title,
        c.name AS customer_name,
        (SELECT COUNT(*) FROM blockers b WHERE b.task_id = t.id AND b.resolved = 0) AS active_blockers
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN customers c ON c.id = p.customer_id
      WHERE t.id = ? AND t.project_id = ?
    `).get(taskId, projectId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const blockers = db.prepare(`
      SELECT * FROM blockers WHERE task_id = ? ORDER BY resolved ASC, created_at DESC
    `).all(taskId);
    res.json({ ...task as object, blockers });
  });

  // POST / — create task
  router.post('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const { title, description, stage, sort_order } = req.body as {
      title?: string;
      description?: string;
      stage?: string;
      sort_order?: number;
    };
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const projectExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!projectExists) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    // Auto-increment sort_order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder === undefined) {
      const result = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE project_id = ?'
      ).get(projectId) as { next_order: number };
      finalSortOrder = result.next_order;
    }
    const id = uuid();
    const finalStage = stage ?? 'todo';
    db.prepare(
      'INSERT INTO tasks (id, project_id, title, description, stage, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, title.trim(), description ?? null, finalStage, finalSortOrder);
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  // PUT /:taskId — update task
  router.put('/:taskId', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId) as TaskRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const { title, description, stage, sort_order } = req.body as Partial<TaskRow>;
    db.prepare(
      'UPDATE tasks SET title = ?, description = ?, stage = ?, sort_order = ? WHERE id = ?'
    ).run(
      title ?? existing.title,
      description !== undefined ? description : existing.description,
      stage ?? existing.stage,
      sort_order !== undefined ? sort_order : existing.sort_order,
      taskId
    );
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    res.json(updated);
  });

  // DELETE /:taskId — delete task
  router.delete('/:taskId', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    res.json({ success: true });
  });

  return router;
}
