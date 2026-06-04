import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { logActivity } from '../services/activity.js';

interface BlockerRow {
  id: string;
  project_id: string;
  task_id: string | null;
  description: string;
  resolved: number;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
}

export function blockerRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  const createBlocker = db.prepare(
    'INSERT INTO blockers (id, project_id, task_id, description) VALUES (?, ?, ?, ?)'
  );
  const getBlockerById = db.prepare('SELECT * FROM blockers WHERE id = ?');
  const setProjectBlocked = db.prepare(
    "UPDATE projects SET stage = 'blocked', updated_at = datetime('now') WHERE id = ?"
  );
  const setTaskBlocked = db.prepare(
    "UPDATE tasks SET stage = 'blocked' WHERE id = ? AND project_id = ?"
  );

  // GET / — list project-level blockers by default, optional ?taskId filter for task-level blockers
  router.get('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const { taskId } = req.query as { taskId?: string };

    const conditions: string[] = ['b.project_id = ?'];
    const params: unknown[] = [projectId];

    if (taskId !== undefined) {
      conditions.push('b.task_id = ?');
      params.push(taskId);
    } else {
      conditions.push('b.task_id IS NULL');
    }

    const where = 'WHERE ' + conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT
        b.*,
        u.username AS resolved_by_username
      FROM blockers b
      LEFT JOIN users u ON u.id = b.resolved_by_user_id
      ${where}
      ORDER BY b.resolved ASC, b.created_at DESC
    `).all(...params);
    res.json(rows);
  });

  // POST / — create blocker
  router.post('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const { description, task_id } = req.body as {
      description?: string;
      task_id?: string | null;
    };

    if (!description || !description.trim()) {
      res.status(400).json({ error: 'description is required' });
      return;
    }

    const projectExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!projectExists) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (task_id) {
      const taskExists = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(task_id, projectId);
      if (!taskExists) {
        res.status(400).json({ error: 'Task not found in this project' });
        return;
      }
    }

    const id = uuid();
    const createBlockerWithStageUpdate = db.transaction(() => {
      createBlocker.run(id, projectId, task_id ?? null, description.trim());

      if (task_id) {
        setTaskBlocked.run(task_id, projectId);
      } else {
        setProjectBlocked.run(projectId);
      }

      logActivity(db, {
        projectId,
        taskId: task_id ?? null,
        userId: req.session.userId as unknown as string,
        type: 'blocker_added',
        payload: {
          blocker_id: id,
          description: description.trim(),
          details: `Added blocker: ${description.trim()}`,
          scope: task_id ? 'task' : 'project',
        },
      });

      return getBlockerById.get(id);
    });

    const row = createBlockerWithStageUpdate();
    res.status(201).json(row);
  });

  // PUT /:blockerId — resolve/unresolve or update description
  router.put('/:blockerId', (req, res) => {
    const { projectId, blockerId } = req.params as Record<string, string>;
    const existing = db.prepare('SELECT * FROM blockers WHERE id = ? AND project_id = ?').get(blockerId, projectId) as BlockerRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Blocker not found' });
      return;
    }
    const { resolved, description, resolution_note } = req.body as {
      resolved?: number;
      description?: string;
      resolution_note?: string | null;
    };
    let resolvedAt = existing.resolved_at;
    let resolvedVal = existing.resolved;
    let resolutionNote = existing.resolution_note;
    let resolvedByUserId = existing.resolved_by_user_id;

    if (resolved !== undefined) {
      resolvedVal = resolved ? 1 : 0;
      if (resolved) {
        if (!resolution_note || !resolution_note.trim()) {
          res.status(400).json({ error: 'resolution_note is required when resolving a blocker' });
          return;
        }
        resolvedAt = new Date().toISOString();
        resolutionNote = resolution_note.trim();
        resolvedByUserId = req.session.userId as unknown as string;
      } else {
        resolvedAt = null;
        resolutionNote = null;
        resolvedByUserId = null;
      }
    }

    const updateBlocker = db.transaction(() => {
      db.prepare(
        'UPDATE blockers SET resolved = ?, resolved_at = ?, resolved_by_user_id = ?, resolution_note = ?, description = ? WHERE id = ?'
      ).run(
        resolvedVal,
        resolvedAt,
        resolvedByUserId,
        resolutionNote,
        description !== undefined ? description.trim() : existing.description,
        blockerId
      );

      if (resolved !== undefined) {
        logActivity(db, {
          projectId,
          taskId: existing.task_id,
          userId: req.session.userId as unknown as string,
          type: resolved ? 'blocker_resolved' : 'blocker_reopened',
          payload: {
            blocker_id: blockerId,
            description: description !== undefined ? description.trim() : existing.description,
            details: resolved
              ? `Resolved blocker: ${existing.description} — ${resolutionNote}`
              : `Reopened blocker: ${existing.description}`,
            resolution_note: resolved ? resolutionNote : null,
          },
        });
      }

      return db.prepare(`
        SELECT
          b.*,
          u.username AS resolved_by_username
        FROM blockers b
        LEFT JOIN users u ON u.id = b.resolved_by_user_id
        WHERE b.id = ?
      `).get(blockerId);
    });

    const updated = updateBlocker();
    res.json(updated);
  });

  // DELETE /:blockerId — delete blocker
  router.delete('/:blockerId', (req, res) => {
    const { projectId, blockerId } = req.params as Record<string, string>;
    const existing = db.prepare('SELECT id FROM blockers WHERE id = ? AND project_id = ?').get(blockerId, projectId);
    if (!existing) {
      res.status(404).json({ error: 'Blocker not found' });
      return;
    }
    db.prepare('DELETE FROM blockers WHERE id = ?').run(blockerId);
    res.json({ success: true });
  });

  return router;
}
