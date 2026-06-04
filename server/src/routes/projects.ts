import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { getProjectActivity } from '../services/activity.js';
import { createInAppNotification, sendSlackNotification, sendEmailNotification } from '../services/notify.js';
import { getAllSettings, getBool } from '../services/settings.js';
import { projectAccessFilter, canAccessProject, canModify } from '../middleware/access.js';

interface ProjectRow {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  stage: string;
  start_date: string | null;
  due_date: string | null;
  share_token: string | null;
  archived: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

const MAX_TITLE = 255;
const MAX_DESCRIPTION = 10000;
const VALID_PROJECT_STAGES = ['scoping', 'quoted', 'inprogress', 'review', 'blocked', 'done'];

export function projectRoutes(db: Database.Database): Router {
  const router = Router();

  function hasInvalidTimeline(startDate?: string | null, dueDate?: string | null) {
    return Boolean(startDate && dueDate && startDate > dueDate);
  }

  function validateProjectInput(title?: string, description?: string | null, stage?: string) {
    if (title && title.length > MAX_TITLE) {
      return `Title must be ≤ ${MAX_TITLE} characters`;
    }
    if (description && description.length > MAX_DESCRIPTION) {
      return `Description must be ≤ ${MAX_DESCRIPTION} characters`;
    }
    if (stage && !VALID_PROJECT_STAGES.includes(stage)) {
      return `Invalid stage: ${stage}`;
    }
    return null;
  }

  // GET / — list projects with filters
  router.get('/', (req, res) => {
    const { customerId, stage, archived } = req.query as Record<string, string | undefined>;
    const archivedVal = archived !== undefined ? Number(archived) : 0;
    const userId = String(req.session.userId);
    const role = req.session.role ?? '';

    const conditions: string[] = ['p.archived = ?', 'p.deleted_at IS NULL'];
    const params: unknown[] = [archivedVal];

    if (customerId) {
      conditions.push('p.customer_id = ?');
      params.push(customerId);
    }
    if (stage) {
      conditions.push('p.stage = ?');
      params.push(stage);
    }

    // Access filtering — non-admin only sees granted projects
    const access = projectAccessFilter(db, userId, role);
    if (access.clause) {
      conditions.push(access.clause.replace(/^AND /, ''));
      params.push(...access.params);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const rows = db.prepare(`
      SELECT
        p.*,
        c.name AS customer_name,
        c.color AS customer_color,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.stage = 'done' AND t.deleted_at IS NULL) AS tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS tasks_total,
        (SELECT COUNT(*) FROM blockers b WHERE b.project_id = p.id AND b.resolved = 0 AND b.deleted_at IS NULL) AS active_blockers
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      ${where}
      ORDER BY p.updated_at DESC
    `).all(...params);
    res.json(rows);
  });

  // GET /:id — single project with customer info
  router.get('/:id', (req, res) => {
    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', req.params.id)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }
    const row = db.prepare(`
      SELECT
        p.*,
        c.name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.color AS customer_color,
        c.notes AS customer_notes,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.stage = 'done' AND t.deleted_at IS NULL) AS tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS tasks_total
      FROM projects p
      JOIN customers c ON c.id = p.customer_id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(row);
  });

  // POST / — create project
  router.post('/', (req, res) => {
    const { customer_id, title, description, stage, start_date, due_date } = req.body as {
      customer_id?: string;
      title?: string;
      description?: string;
      stage?: string;
      start_date?: string;
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

    const validationError = validateProjectInput(title, description ?? null, stage);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (hasInvalidTimeline(start_date, due_date)) {
      res.status(400).json({ error: 'start_date must be on or before due_date' });
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
    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot create projects' });
      return;
    }
    db.prepare(`
      INSERT INTO projects (id, customer_id, title, description, stage, start_date, due_date, share_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, customer_id, title.trim(), description ?? null, finalStage, start_date ?? null, due_date ?? null, share_token);
    // Auto-add creator as project member
    const creatorId = String(req.session.userId);
    db.prepare(
      'INSERT INTO project_members (id, project_id, user_id, task_access, granted_by) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), id, creatorId, 'all', creatorId);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  // PUT /:id — update project
  router.put('/:id', (req, res) => {
    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', req.params.id)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }
    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot modify projects' });
      return;
    }
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as ProjectRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const _oldStage = existing.stage;
    const { title, description, stage, start_date, due_date } = req.body as Partial<ProjectRow>;
    const finalStartDate = start_date !== undefined ? start_date : existing.start_date;
    const finalDueDate = due_date !== undefined ? due_date : existing.due_date;
    const finalStage = stage ?? existing.stage;
    const finalTitle = title ?? existing.title;
    const finalDescription = description !== undefined ? description : existing.description;

    const validationError = validateProjectInput(finalTitle, finalDescription, finalStage);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (hasInvalidTimeline(finalStartDate, finalDueDate)) {
      res.status(400).json({ error: 'start_date must be on or before due_date' });
      return;
    }
    // Check if trying to mark project as done with undone tasks
    if (finalStage === 'done' && existing.stage !== 'done') {
      const settings = getAllSettings(db);
      if (getBool(settings, 'block_project_done_if_tasks_not_done')) {
        const undoneTasks = db.prepare(`
          SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND stage != 'done'
        `).get(req.params.id) as { count: number };
        if (undoneTasks.count > 0) {
          res.status(400).json({
            error: `Cannot mark project as done. ${undoneTasks.count} task(s) still need to be completed.`
          });
          return;
        }
      }
    }
    db.prepare(`
      UPDATE projects
      SET title = ?, description = ?, stage = ?, start_date = ?, due_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title ?? existing.title,
      description !== undefined ? description : existing.description,
      finalStage,
      finalStartDate,
      finalDueDate,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ ...updated as object, _oldStage });
  });

  // DELETE /:id — soft-delete project
  router.delete('/:id', (req, res) => {
    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', req.params.id)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }
    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot delete projects' });
      return;
    }
    const existing = db.prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    db.prepare("UPDATE projects SET deleted_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // GET /:id/activity — project activity log
  router.get('/:id/activity', (req, res) => {
    const activity = getProjectActivity(db, req.params.id) as {
      id: string;
      type: string;
      payload: string | null;
      created_at: string;
      username: string | null;
    }[];

    res.json(activity.map((entry) => {
      let details: string | undefined;
      if (entry.payload) {
        try {
          const parsed = JSON.parse(entry.payload) as Record<string, unknown>;
          details = (parsed.details ?? parsed.description ?? parsed.title) as string | undefined;
        } catch {
          details = entry.payload;
        }
      }

      return {
        id: entry.id,
        action: entry.type,
        details,
        created_at: entry.created_at,
        user: entry.username ? { username: entry.username } : undefined,
      };
    }));
  });

  // POST /:id/notify-pa — notify PA user with a follow_up notification
  router.post('/:id/notify-pa', (req, res) => {
    const { id } = req.params;
    // Add access control check
    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', id)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }
    const project = db.prepare('SELECT id, title FROM projects WHERE id = ? AND deleted_at IS NULL').get(id) as { id: string; title: string } | undefined;
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const paUser = db.prepare("SELECT id FROM users WHERE role = 'manager' LIMIT 1").get() as { id: string } | undefined;
    if (!paUser) {
      res.status(404).json({ error: 'No manager user found' });
      return;
    }

    const message = `Follow-up needed on project "${project.title}"`;

    createInAppNotification(db, {
      projectId: id,
      type: 'follow_up',
      message,
      userId: paUser.id,
    });

    // Fire-and-forget — don't block the response
    const settings = getAllSettings(db);
    const slackWebhook = settings.slack_webhook_url || process.env.SLACK_WEBHOOK_URL || '';
    if (getBool(settings, 'slack_enabled') && slackWebhook) {
      void sendSlackNotification(slackWebhook, message);
    }

    const brevoKey = settings.brevo_api_key || process.env.BREVO_API_KEY || '';
    const recipients = settings.email_recipients.split(',').map((e) => e.trim()).filter(Boolean);
    if (brevoKey && recipients.length > 0) {
      const senderEmail = settings.email_sender_address || 'noreply@kanboard.app';
      const senderName = settings.email_sender_name || 'Mooove';
      const html = `<h1>Follow-up Needed</h1><p>${message}</p>`;
      for (const to of recipients) {
        void sendEmailNotification(brevoKey, to, `Follow-up: ${project.title}`, html, senderEmail, senderName);
      }
    }

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
