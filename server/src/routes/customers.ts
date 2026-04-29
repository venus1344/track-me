import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  color: string | null;
  created_at: string;
}

export function customerRoutes(db: Database.Database): Router {
  const router = Router();

  // GET / — list all customers with project_count and active_blockers
  router.get('/', (_req, res) => {
    const rows = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id AND p.archived = 0) AS project_count,
        (SELECT COUNT(*) FROM blockers b JOIN projects p ON b.project_id = p.id
         WHERE p.customer_id = c.id AND b.resolved = 0) AS active_blockers
      FROM customers c
      ORDER BY c.name
    `).all();
    res.json(rows);
  });

  // GET /:id — single customer + their projects (with tasks_done/tasks_total)
  router.get('/:id', (req, res) => {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as CustomerRow | undefined;
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    const projects = db.prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.stage = 'done') AS tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_total
      FROM projects p
      WHERE p.customer_id = ?
      ORDER BY p.updated_at DESC
    `).all(req.params.id);
    res.json({ ...customer, projects });
  });

  // POST / — create customer
  router.post('/', (req, res) => {
    const { name, email, phone, notes, color } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      notes?: string;
      color?: string;
    };
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const id = uuid();
    const finalColor = color ?? '#6366f1';
    db.prepare(
      'INSERT INTO customers (id, name, email, phone, notes, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), email ?? null, phone ?? null, notes ?? null, finalColor);
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.status(201).json(row);
  });

  // PUT /:id — update customer fields
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as CustomerRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    const { name, email, phone, notes, color } = req.body as Partial<CustomerRow>;
    db.prepare(
      'UPDATE customers SET name = ?, email = ?, phone = ?, notes = ?, color = ? WHERE id = ?'
    ).run(
      name ?? existing.name,
      email !== undefined ? email : existing.email,
      phone !== undefined ? phone : existing.phone,
      notes !== undefined ? notes : existing.notes,
      color !== undefined ? color : existing.color,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // DELETE /:id — delete customer (blocked if projects exist or any project has tasks)
  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    const projectCount = (db.prepare(
      'SELECT COUNT(*) AS cnt FROM projects WHERE customer_id = ?'
    ).get(req.params.id) as { cnt: number }).cnt;
    if (projectCount > 0) {
      res.status(409).json({
        error: `Cannot delete: customer has ${projectCount} project${projectCount === 1 ? '' : 's'}. Delete all projects first.`,
      });
      return;
    }
    const taskCount = (db.prepare(
      'SELECT COUNT(*) AS cnt FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.customer_id = ?'
    ).get(req.params.id) as { cnt: number }).cnt;
    if (taskCount > 0) {
      res.status(409).json({
        error: `Cannot delete: customer has projects with ${taskCount} task${taskCount === 1 ? '' : 's'}. Delete all tasks and projects first.`,
      });
      return;
    }
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
}
