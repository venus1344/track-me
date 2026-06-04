import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { canAccessProject, canAccessTask, canModify, getTaskAccess } from '../middleware/access.js';
import { getBool, getAllSettings } from '../services/settings.js';

const MAX_TITLE = 255;
const MAX_DESCRIPTION = 10000;
const VALID_TASK_STAGES = ['todo', 'inprogress', 'blocked', 'done'];

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  stage: string;
  sort_order: number;
  qa_user_id: string | null;
  assignee_user_id: string | null;
  created_at: string;
}

export function taskRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  function validateTaskInput(title?: string, description?: string | null, stage?: string) {
    if (title && title.length > MAX_TITLE) {
      return `Title must be ≤ ${MAX_TITLE} characters`;
    }
    if (description && description.length > MAX_DESCRIPTION) {
      return `Description must be ≤ ${MAX_DESCRIPTION} characters`;
    }
    if (stage && !VALID_TASK_STAGES.includes(stage)) {
      return `Invalid stage: ${stage}`;
    }
    return null;
  }

  // GET / — list tasks for project
  router.get('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const userId = String(req.session.userId);
    const role = req.session.role ?? '';

    if (!canAccessProject(db, userId, role, projectId)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }

    const taskAccess = getTaskAccess(db, userId, role, projectId);
    let taskFilter = '';
    const params: unknown[] = [projectId];

    if (taskAccess === 'assigned') {
      taskFilter = 'AND t.id IN (SELECT ta.task_id FROM task_assignees ta WHERE ta.user_id = ?)';
      params.push(userId);
    }

    const rows = db.prepare(`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM blockers b WHERE b.task_id = t.id AND b.resolved = 0) AS active_blockers,
        qa.username AS qa_username,
        qa.display_name AS qa_display_name,
        assignee.username AS assignee_username,
        assignee.display_name AS assignee_display_name
      FROM tasks t
      LEFT JOIN users qa ON qa.id = t.qa_user_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_user_id
      WHERE t.project_id = ?
      ${taskFilter}
      ORDER BY t.sort_order, t.id
    `).all(...params) as (TaskRow & {
      active_blockers: number;
      qa_username: string | null; qa_display_name: string | null;
      assignee_username: string | null; assignee_display_name: string | null;
    })[];

    // Build assignees array from single assignee_user_id for compatibility with member filter
    const result = rows.map((task) => ({
      ...task,
      assignees: task.assignee_user_id ? [{
        user_id: task.assignee_user_id,
        username: task.assignee_username ?? '',
        display_name: task.assignee_display_name,
      }] : [],
    }));
    res.json(result);
  });

  // GET /:taskId — single task with project info and blockers
  router.get('/:taskId', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    if (!canAccessTask(db, String(req.session.userId), req.session.role ?? '', projectId, taskId)) {
      res.status(403).json({ error: 'Not authorized to access this task' });
      return;
    }
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
    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', projectId)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }
    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot create tasks' });
      return;
    }
    const { title, description, stage, sort_order, qa_user_id, assignee_user_id } = req.body as {
      title?: string;
      description?: string;
      stage?: string;
      sort_order?: number;
      qa_user_id?: string;
      assignee_user_id?: string;
    };
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const validationError = validateTaskInput(title, description ?? null, stage);
    if (validationError) {
      res.status(400).json({ error: validationError });
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

    // Enforce QA self-assign rule on create
    if (qa_user_id && assignee_user_id) {
      const settings = getAllSettings(db);
      if (getBool(settings, 'qa_self_assign_blocked') && qa_user_id === assignee_user_id) {
        res.status(400).json({ error: 'QA assignee cannot also be the task assignee when self-QA is blocked' });
        return;
      }
    }

    db.prepare(
      'INSERT INTO tasks (id, project_id, title, description, stage, sort_order, qa_user_id, assignee_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, title.trim(), description ?? null, finalStage, finalSortOrder, qa_user_id ?? null, assignee_user_id ?? null);

    // Sync to task_assignees for access control
    if (assignee_user_id) {
      db.prepare(
        'INSERT OR IGNORE INTO task_assignees (id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)'
      ).run(uuid(), id, assignee_user_id, String(req.session.userId));
    }

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  // PUT /:taskId — update task
  router.put('/:taskId', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    if (!canAccessTask(db, String(req.session.userId), req.session.role ?? '', projectId, taskId)) {
      res.status(403).json({ error: 'Not authorized to access this task' });
      return;
    }
    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot modify tasks' });
      return;
    }
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId) as TaskRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const { title, description, stage, sort_order, qa_user_id, assignee_user_id } = req.body as Partial<TaskRow>;

    const finalTitle = title ?? existing.title;
    const finalDescription = description !== undefined ? description : existing.description;
    const finalStage = stage ?? existing.stage;
    const finalQaUserId = qa_user_id !== undefined ? qa_user_id : existing.qa_user_id;
    const finalAssigneeUserId = assignee_user_id !== undefined ? assignee_user_id : existing.assignee_user_id;

    const validationError = validateTaskInput(finalTitle, finalDescription, finalStage);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    // Enforce QA self-assign rule
    if (finalQaUserId && finalAssigneeUserId) {
      const settings = getAllSettings(db);
      if (getBool(settings, 'qa_self_assign_blocked') && finalQaUserId === finalAssigneeUserId) {
        res.status(400).json({ error: 'QA assignee cannot also be the task assignee when self-QA is blocked' });
        return;
      }
    }

    db.prepare(
      'UPDATE tasks SET title = ?, description = ?, stage = ?, sort_order = ?, qa_user_id = ?, assignee_user_id = ? WHERE id = ?'
    ).run(
      title ?? existing.title,
      description !== undefined ? description : existing.description,
      stage ?? existing.stage,
      sort_order !== undefined ? sort_order : existing.sort_order,
      qa_user_id !== undefined ? qa_user_id : existing.qa_user_id,
      assignee_user_id !== undefined ? assignee_user_id : existing.assignee_user_id,
      taskId
    );

    // Sync assignee to task_assignees for access control
    if (assignee_user_id !== undefined) {
      db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
      if (assignee_user_id) {
        db.prepare(
          'INSERT OR IGNORE INTO task_assignees (id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)'
        ).run(uuid(), taskId, assignee_user_id, String(req.session.userId));
      }
    }

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    res.json(updated);
  });

  // DELETE /:taskId — delete task
  router.delete('/:taskId', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    if (!canAccessTask(db, String(req.session.userId), req.session.role ?? '', projectId, taskId)) {
      res.status(403).json({ error: 'Not authorized to access this task' });
      return;
    }
    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot delete tasks' });
      return;
    }
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    res.json({ success: true });
  });

  // GET /:taskId/assignees — list assignees for a task
  router.get('/:taskId/assignees', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', projectId)) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    const rows = db.prepare(`
      SELECT ta.id, ta.user_id, ta.created_at, u.username, u.display_name
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = ?
      ORDER BY ta.created_at
    `).all(taskId);
    res.json(rows);
  });

  // POST /:taskId/assignees — assign user to task
  router.post('/:taskId/assignees', (req, res) => {
    const { projectId, taskId } = req.params as Record<string, string>;
    const currentUserId = String(req.session.userId);
    const currentRole = req.session.role ?? '';

    if (!canAccessProject(db, currentUserId, currentRole, projectId)) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    if (!canModify(currentRole)) {
      res.status(403).json({ error: 'Viewers cannot assign tasks' });
      return;
    }

    const { userId } = req.body as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const taskExists = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
    if (!taskExists) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const userExists = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(userId);
    if (!userExists) {
      res.status(404).json({ error: 'User not found or inactive' });
      return;
    }

    const existing = db.prepare('SELECT id FROM task_assignees WHERE task_id = ? AND user_id = ?').get(taskId, userId);
    if (existing) {
      res.status(409).json({ error: 'User is already assigned to this task' });
      return;
    }

    // Enforce QA self-assign rule: block if this user is the QA for this task
    const settings = getAllSettings(db);
    if (getBool(settings, 'qa_self_assign_blocked')) {
      const task = db.prepare('SELECT qa_user_id FROM tasks WHERE id = ?').get(taskId) as { qa_user_id: string | null } | undefined;
      if (task?.qa_user_id === userId) {
        res.status(400).json({ error: 'This user is the QA assignee and cannot also be a task assignee' });
        return;
      }
    }

    const id = uuid();
    db.prepare(
      'INSERT INTO task_assignees (id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?)'
    ).run(id, taskId, userId, currentUserId);

    const row = db.prepare(`
      SELECT ta.id, ta.user_id, ta.created_at, u.username, u.display_name
      FROM task_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.id = ?
    `).get(id);
    res.status(201).json(row);
  });

  // DELETE /:taskId/assignees/:userId — unassign user from task
  router.delete('/:taskId/assignees/:userId', (req, res) => {
    const { projectId, taskId, userId } = req.params as Record<string, string>;
    const currentRole = req.session.role ?? '';

    if (!canAccessProject(db, String(req.session.userId), currentRole, projectId)) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    if (!canModify(currentRole)) {
      res.status(403).json({ error: 'Viewers cannot unassign tasks' });
      return;
    }

    const existing = db.prepare('SELECT id FROM task_assignees WHERE task_id = ? AND user_id = ?').get(taskId, userId);
    if (!existing) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    db.prepare('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?').run(taskId, userId);
    res.json({ success: true });
  });

  return router;
}
