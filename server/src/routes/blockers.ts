import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

interface BlockerRow {
  id: string;
  project_id: string;
  task_id: string | null;
  description: string;
  resolved: number;
  created_at: string;
  resolved_at: string | null;
}

export function blockerRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  // GET / — list blockers for project, optional ?taskId filter
  router.get('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const { taskId } = req.query as { taskId?: string };

    const conditions: string[] = ['b.project_id = ?'];
    const params: unknown[] = [projectId];

    if (taskId !== undefined) {
      conditions.push('b.task_id = ?');
      params.push(taskId);
    }

    const where = 'WHERE ' + conditions.join(' AND ');
    const rows = db.prepare(`
      SELECT * FROM blockers b
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
    db.prepare(
      'INSERT INTO blockers (id, project_id, task_id, description) VALUES (?, ?, ?, ?)'
    ).run(id, projectId, task_id ?? null, description.trim());
    const row = db.prepare('SELECT * FROM blockers WHERE id = ?').get(id);
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
    const { resolved, description } = req.body as { resolved?: number; description?: string };
    let resolvedAt = existing.resolved_at;
    let resolvedVal = existing.resolved;

    if (resolved !== undefined) {
      resolvedVal = resolved ? 1 : 0;
      resolvedAt = resolved ? new Date().toISOString() : null;
    }

    db.prepare(
      'UPDATE blockers SET resolved = ?, resolved_at = ?, description = ? WHERE id = ?'
    ).run(
      resolvedVal,
      resolvedAt,
      description !== undefined ? description.trim() : existing.description,
      blockerId
    );
    const updated = db.prepare('SELECT * FROM blockers WHERE id = ?').get(blockerId);
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
