import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { getProjectActivity } from '../services/activity.js';
import { createInAppNotification } from '../services/notify.js';

interface ProjectRow {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  stage: string;
  due_date: string | null;
  share_token: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

export function projectRoutes(db: Database.Database): Router {
  const router = Router();

  // GET / — list projects with filters
  router.get('/', (req, res) => {
    const { customerId, stage, archived } = req.query as Record<string, string | undefined>;
    const archivedVal = archived !== undefined ? Number(archived) : 0;

    const conditions: string[] = ['p.archived = ?'];
    const params: unknown[] = [archivedVal];

    if (customerId) {
      conditions.push('p.customer_id = ?');
      params.push(customerId);
    }
    if (stage) {
      conditions.push('p.stage = ?');
      params.push(stage);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const rows = db.prepare(`
      SELECT
        p.*,
        c.name AS customer_name,
        c.color AS customer_color,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.stage = 'done') AS tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_total,
        (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.resolved = 0) AS active_blockers
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      ${where}
      ORDER BY p.updated_at DESC
    `).all(...params);
    res.json(rows);
  });

  // GET /:id — single project with customer info
  router.get('/:id', (req, res) => {
    const row = db.prepare(`
      SELECT
        p.*,
        c.name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.color AS customer_color,
        c.notes AS customer_notes,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.stage = 'done') AS tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_total
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(row);
  });

  // POST / — create project
  router.post('/', (req, res) => {
    const { customer_id, title, description, stage, due_date } = req.body as {
      customer_id?: string;
      title?: string;
      description?: string;
      stage?: string;
      due_date?: string;
    };
    if (!customer_id) {
      res.status(400).json({ error: 'customer_id is required' });
      return;
    }
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const customerExists = db.prepare('SELECT id FROM customers WHERE id = ?').get(customer_id);
    if (!customerExists) {
      res.status(400).json({ error: 'Customer not found' });
      return;
    }
    const id = uuid();
    const share_token = uuid();
    const finalStage = stage ?? 'scoping';
    db.prepare(`
      INSERT INTO projects (id, customer_id, title, description, stage, due_date, share_token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, customer_id, title.trim(), description ?? null, finalStage, due_date ?? null, share_token);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  // PUT /:id — update project
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as ProjectRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const _oldStage = existing.stage;
    const { title, description, stage, due_date } = req.body as Partial<ProjectRow>;
    db.prepare(`
      UPDATE projects
      SET title = ?, description = ?, stage = ?, due_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title ?? existing.title,
      description !== undefined ? description : existing.description,
      stage ?? existing.stage,
      due_date !== undefined ? due_date : existing.due_date,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ ...updated as object, _oldStage });
  });

  // DELETE /:id — delete project
  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // GET /:id/activity — project activity log
  router.get('/:id/activity', (req, res) => {
    const activity = getProjectActivity(db, req.params.id);
    res.json(activity);
  });

  // POST /:id/notify-pa — notify PA user with a follow_up notification
  router.post('/:id/notify-pa', (req, res) => {
    const { id } = req.params;
    const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(id) as { id: string; title: string } | undefined;
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const paUser = db.prepare("SELECT id FROM users WHERE role = 'pa' LIMIT 1").get() as { id: string } | undefined;
    if (!paUser) {
      res.status(404).json({ error: 'No PA user found' });
      return;
    }
    createInAppNotification(db, {
      projectId: id,
      type: 'follow_up',
      message: `Follow-up needed on project "${project.title}"`,
      userId: paUser.id,
    });
    res.json({ success: true });
  });

  // POST /:id/archive — archive project
  router.post('/:id/archive', (req, res) => {
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    db.prepare("UPDATE projects SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  return router;
}
