import { Router } from 'express';
import Database from 'better-sqlite3';

export function notificationRoutes(db: Database.Database): Router {
  const router = Router();

  // GET / — list notifications for current user
  router.get('/', (req, res) => {
    const userId = req.session.userId;
    const { type } = req.query as { type?: string };

    const conditions: string[] = ['n.user_id = ?'];
    const params: unknown[] = [userId];

    if (type) {
      conditions.push('n.type = ?');
      params.push(type);
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        n.*,
        p.title AS project_title,
        c.name AS customer_name
      FROM notifications n
      LEFT JOIN projects p ON p.id = n.project_id
      LEFT JOIN customers c ON c.id = p.customer_id
      ${where}
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all(...params);

    res.json(rows);
  });

  // GET /unread-count — count of unread notifications
  router.get('/unread-count', (req, res) => {
    const userId = req.session.userId;
    const result = db.prepare(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE user_id = ? AND read = 0
    `).get(userId) as { count: number };
    res.json({ count: result.count });
  });

  // PATCH /:id/read — mark single notification read
  router.patch('/:id/read', (req, res) => {
    const userId = req.session.userId;
    const { id } = req.params;

    const existing = db.prepare(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ?'
    ).get(id, userId);

    if (!existing) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
    const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    res.json(updated);
  });

  // POST /read-all — mark all read for current user
  router.post('/read-all', (req, res) => {
    const userId = req.session.userId;
    db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(userId);
    res.json({ success: true });
  });

  return router;
}
