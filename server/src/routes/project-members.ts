import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { canManageMembers } from '../middleware/access.js';

export function projectMemberRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  // GET / — list members of a project
  router.get('/', (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const userId = String(req.session.userId);
    const role = req.session.role ?? '';

    if (!canManageMembers(db, userId, role, projectId)) {
      res.status(403).json({ error: 'Not authorized to manage members' });
      return;
    }

    const rows = db.prepare(`
      SELECT
        pm.id,
        pm.user_id,
        pm.task_access,
        pm.created_at,
        u.username,
        u.display_name,
        u.email,
        u.role AS user_role
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.created_at
    `).all(projectId);
    res.json(rows);
  });

  // POST / — add member to project
  router.post('/', (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const currentUserId = String(req.session.userId);
    const currentRole = req.session.role ?? '';

    if (!canManageMembers(db, currentUserId, currentRole, projectId)) {
      res.status(403).json({ error: 'Not authorized to manage members' });
      return;
    }

    const { userId, taskAccess } = req.body as { userId?: string; taskAccess?: string };
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (taskAccess && !['all', 'assigned'].includes(taskAccess)) {
      res.status(400).json({ error: 'taskAccess must be "all" or "assigned"' });
      return;
    }

    const userExists = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(userId);
    if (!userExists) {
      res.status(404).json({ error: 'User not found or inactive' });
      return;
    }

    const projectExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!projectExists) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const existing = db.prepare(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, userId);
    if (existing) {
      res.status(409).json({ error: 'User is already a member of this project' });
      return;
    }

    const id = uuid();
    db.prepare(
      'INSERT INTO project_members (id, project_id, user_id, task_access, granted_by) VALUES (?, ?, ?, ?, ?)'
    ).run(id, projectId, userId, taskAccess || 'all', currentUserId);

    const row = db.prepare(`
      SELECT
        pm.id, pm.user_id, pm.task_access, pm.created_at,
        u.username, u.display_name, u.email, u.role AS user_role
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.id = ?
    `).get(id);
    res.status(201).json(row);
  });

  // PUT /:memberId — update task_access
  router.put('/:memberId', (req: Request, res: Response) => {
    const { projectId, memberId } = req.params as Record<string, string>;
    const currentUserId = String(req.session.userId);
    const currentRole = req.session.role ?? '';

    if (!canManageMembers(db, currentUserId, currentRole, projectId)) {
      res.status(403).json({ error: 'Not authorized to manage members' });
      return;
    }

    const existing = db.prepare(
      'SELECT id FROM project_members WHERE id = ? AND project_id = ?'
    ).get(memberId, projectId);
    if (!existing) {
      res.status(404).json({ error: 'Membership not found' });
      return;
    }

    const { taskAccess } = req.body as { taskAccess?: string };
    if (!taskAccess || !['all', 'assigned'].includes(taskAccess)) {
      res.status(400).json({ error: 'taskAccess must be "all" or "assigned"' });
      return;
    }

    db.prepare('UPDATE project_members SET task_access = ? WHERE id = ?').run(taskAccess, memberId);

    const row = db.prepare(`
      SELECT
        pm.id, pm.user_id, pm.task_access, pm.created_at,
        u.username, u.display_name, u.email, u.role AS user_role
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.id = ?
    `).get(memberId);
    res.json(row);
  });

  // DELETE /:memberId — remove member from project
  router.delete('/:memberId', (req: Request, res: Response) => {
    const { projectId, memberId } = req.params as Record<string, string>;
    const currentUserId = String(req.session.userId);
    const currentRole = req.session.role ?? '';

    if (!canManageMembers(db, currentUserId, currentRole, projectId)) {
      res.status(403).json({ error: 'Not authorized to manage members' });
      return;
    }

    const existing = db.prepare(
      'SELECT id FROM project_members WHERE id = ? AND project_id = ?'
    ).get(memberId, projectId);
    if (!existing) {
      res.status(404).json({ error: 'Membership not found' });
      return;
    }

    db.prepare('DELETE FROM project_members WHERE id = ?').run(memberId);
    res.json({ success: true });
  });

  return router;
}
