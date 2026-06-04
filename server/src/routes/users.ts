import { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const VALID_ROLES = ['admin', 'manager', 'member', 'viewer'];
const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH ?? '12', 10);

export function userRoutes(db: Database.Database): Router {
  const router = Router();

  // Admin-only guard
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.session.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });

  // GET / — list all users
  router.get('/', (_req: Request, res: Response) => {
    const rows = db.prepare(
      'SELECT id, username, role, email, display_name, active, created_at FROM users ORDER BY created_at'
    ).all();
    res.json(rows);
  });

  // GET /:id — single user
  router.get('/:id', (req: Request, res: Response) => {
    const row = db.prepare(
      'SELECT id, username, role, email, display_name, active, created_at FROM users WHERE id = ?'
    ).get(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(row);
  });

  // POST / — create user
  router.post('/', async (req: Request, res: Response) => {
    const { username, password, role, email, display_name } = req.body as {
      username?: string;
      password?: string;
      role?: string;
      email?: string;
      display_name?: string;
    };

    if (!username?.trim()) {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }
    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role, email, display_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, username.trim(), passwordHash, role || 'member', email?.trim() || null, display_name?.trim() || null);

    const row = db.prepare(
      'SELECT id, username, role, email, display_name, active, created_at FROM users WHERE id = ?'
    ).get(id);
    res.status(201).json(row);
  });

  // PUT /:id — update user
  router.put('/:id', (req: Request, res: Response) => {
    const existing = db.prepare(
      'SELECT id, username, role, email, display_name, active FROM users WHERE id = ?'
    ).get(req.params.id) as { id: string; username: string; role: string; email: string | null; display_name: string | null; active: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { role, email, display_name, active } = req.body as {
      role?: string;
      email?: string;
      display_name?: string;
      active?: number;
    };

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      return;
    }

    db.prepare(
      'UPDATE users SET role = ?, email = ?, display_name = ?, active = ? WHERE id = ?'
    ).run(
      role ?? existing.role,
      email !== undefined ? (email.trim() || null) : existing.email,
      display_name !== undefined ? (display_name.trim() || null) : existing.display_name,
      active !== undefined ? active : existing.active,
      req.params.id
    );

    const row = db.prepare(
      'SELECT id, username, role, email, display_name, active, created_at FROM users WHERE id = ?'
    ).get(req.params.id);
    res.json(row);
  });

  // DELETE /:id — deactivate user (soft delete)
  router.delete('/:id', (req: Request, res: Response) => {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    // Don't allow deactivating yourself
    if (req.params.id === String(req.session.userId)) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // POST /:id/reset-password — set new password
  router.post('/:id/reset-password', async (req: Request, res: Response) => {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { password } = req.body as { password?: string };
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.params.id);
    res.json({ success: true });
  });

  return router;
}
