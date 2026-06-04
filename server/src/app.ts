import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import { authRoutes } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { customerRoutes } from './routes/customers.js';
import { projectRoutes } from './routes/projects.js';
import { taskRoutes } from './routes/tasks.js';
import { blockerRoutes } from './routes/blockers.js';
import { attachmentRoutes } from './routes/attachments.js';
import { notificationRoutes } from './routes/notifications.js';
import { shareRoutes } from './routes/share.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { settingsRoutes } from './routes/settings.js';
import { userRoutes } from './routes/users.js';
import { projectMemberRoutes } from './routes/project-members.js';

export { requireAuth };

export function createApp(db: Database.Database, sessionSecret: string) {
  const app = express();
  app.disable('x-powered-by');

  // Security headers via Helmet
  app.use(helmet());

  // CORS — restrict to known origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];
  app.use(cors({ origin: allowedOrigins, credentials: true }));

  app.use(express.json());

  // Rate limiting — general API limit
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later',
    skip: (req) => req.path === '/api/health',
  });
  app.use('/api', limiter);

  // Rate limiting — stricter for public share endpoint
  const shareLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: 'Too many requests to share endpoint',
  });
  app.use('/api/share', shareLimiter);

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api/auth', authRoutes(db));
  app.use('/api/share', shareRoutes(db));
  app.use('/api/customers', requireAuth, customerRoutes(db));
  app.use('/api/projects', requireAuth, projectRoutes(db));
  app.use('/api/projects/:projectId/tasks', requireAuth, taskRoutes(db));
  app.use('/api/projects/:projectId/blockers', requireAuth, blockerRoutes(db));
  app.use('/api/projects/:projectId/attachments', requireAuth, attachmentRoutes(db));
  app.use('/api/notifications', requireAuth, notificationRoutes(db));
  app.use('/api/users', requireAuth, userRoutes(db));
  app.use('/api/projects/:projectId/members', requireAuth, projectMemberRoutes(db));
  app.use('/api/settings', requireAuth, settingsRoutes(db));
  app.use('/api/dashboard', requireAuth, dashboardRoutes(db));

  // Global error handler — suppress stack traces in production
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      error: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack }),
    });
  });

  return app;
}
