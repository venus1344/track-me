import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import '../types.js';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  email: string | null;
  display_name: string | null;
  active: number;
}

export function authRoutes(db: Database.Database): Router {
  const router = Router();
  const loginAttempts = new Map<string, { count: number; expiresAt: number; blockedUntil?: number }>();
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const MAX_LOGIN_ATTEMPTS = 5;

  function getAttemptKey(ipAddress: string, username: string) {
    return `${ipAddress}:${username.trim().toLowerCase()}`;
  }

  function getRetryAfterSeconds(key: string, now: number) {
    const state = loginAttempts.get(key);
    if (!state) return 0;

    if (state.blockedUntil && state.blockedUntil > now) {
      return Math.ceil((state.blockedUntil - now) / 1000);
    }

    if (state.expiresAt <= now) {
      loginAttempts.delete(key);
    }

    return 0;
  }

  function recordFailedAttempt(key: string, now: number) {
    const existing = loginAttempts.get(key);

    if (!existing || existing.expiresAt <= now) {
      loginAttempts.set(key, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
      return;
    }

    const count = existing.count + 1;
    loginAttempts.set(key, {
      count,
      expiresAt: now + LOGIN_WINDOW_MS,
      blockedUntil: count >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_WINDOW_MS : existing.blockedUntil,
    });
  }

  // POST /login
  router.post('/login', async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const attemptKey = getAttemptKey(req.ip ?? 'unknown', username);
    const retryAfterSeconds = getRetryAfterSeconds(attemptKey, Date.now());
    if (retryAfterSeconds > 0) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return;
    }

    const user = db.prepare('SELECT id, username, password_hash, role, email, display_name, active FROM users WHERE username = ?').get(username) as UserRow | undefined;

    if (!user || user.active === 0) {
      recordFailedAttempt(attemptKey, Date.now());
      const blockedAfterFailure = getRetryAfterSeconds(attemptKey, Date.now());
      if (blockedAfterFailure > 0) {
        res.setHeader('Retry-After', String(blockedAfterFailure));
        res.status(429).json({ error: 'Too many login attempts. Try again later.' });
        return;
      }
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordFailedAttempt(attemptKey, Date.now());
      const blockedAfterFailure = getRetryAfterSeconds(attemptKey, Date.now());
      if (blockedAfterFailure > 0) {
        res.setHeader('Retry-After', String(blockedAfterFailure));
        res.status(429).json({ error: 'Too many login attempts. Try again later.' });
        return;
      }
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    loginAttempts.delete(attemptKey);

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    req.session.userId = user.id as unknown as number;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.email = user.email;
    req.session.displayName = user.display_name;

    res.json({ id: user.id, username: user.username, role: user.role, email: user.email, display_name: user.display_name });
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
      email: req.session.email ?? null,
      display_name: req.session.displayName ?? null,
    });
  });

  return router;
}
