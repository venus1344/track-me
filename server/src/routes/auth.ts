import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import '../types.js';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
}

export function authRoutes(db: Database.Database): Router {
  const router = Router();

  // POST /login
  router.post('/login', async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').get(username) as UserRow | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    req.session.userId = user.id as unknown as number;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({ id: user.id, username: user.username, role: user.role });
  });

  // POST /logout
  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: 'Could not log out' });
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out' });
    });
  });

  // GET /me
  router.get('/me', (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
    });
  });

  return router;
}
