import { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { getAllSettings, setSettings } from '../services/settings.js';
import { reschedule } from '../services/cron.js';

const BOOL_KEYS = [
  'email_enabled_overdue',
  'email_enabled_stale_blockers',
  'email_enabled_stale_tasks',
  'slack_enabled',
];

const INT_KEYS = ['stale_task_days', 'stale_blocker_days'];

export function settingsRoutes(db: Database.Database): Router {
  const router = Router();

  // Admin-only guard
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.session.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });

  router.get('/', (_req: Request, res: Response) => {
    res.json(getAllSettings(db));
  });

  router.put('/', (req: Request, res: Response) => {
    const body = req.body as Record<string, string>;

    if (body.cron_schedule && !cron.validate(body.cron_schedule)) {
      res.status(400).json({ error: 'Invalid cron expression' });
      return;
    }

    for (const key of INT_KEYS) {
      if (body[key] !== undefined) {
        const n = parseInt(body[key], 10);
        if (isNaN(n) || n < 1 || n > 365) {
          res.status(400).json({ error: `${key} must be between 1 and 365` });
          return;
        }
      }
    }

    for (const key of BOOL_KEYS) {
      if (body[key] !== undefined && body[key] !== 'true' && body[key] !== 'false') {
        res.status(400).json({ error: `${key} must be "true" or "false"` });
        return;
      }
    }

    if (body.email_recipients !== undefined && body.email_recipients !== '') {
      const emails = body.email_recipients.split(',').map((e) => e.trim()).filter(Boolean);
      for (const email of emails) {
        if (!email.includes('@')) {
          res.status(400).json({ error: `Invalid email address: ${email}` });
          return;
        }
      }
    }

    setSettings(db, body);

    if (body.cron_schedule) {
      reschedule(db);
    }

    res.json(getAllSettings(db));
  });

  return router;
}
