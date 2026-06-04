import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from './setup.js';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';

describe('Auth routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createApp(db, 'test-secret');
  });

  describe('POST /api/auth/login', () => {
    it('returns user on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ username: 'admin', role: 'admin' });
      expect(res.body).toHaveProperty('id');
    });

    it('rejects invalid password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('rejects missing fields with 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('throttles repeated failed login attempts', async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ username: 'admin', password: 'wrongpassword' });

        expect(res.status).toBe(401);
      }

      const limited = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(limited.status).toBe(429);
      expect(limited.headers).toHaveProperty('retry-after');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 when not logged in', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns user after login', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const res = await agent.get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ username: 'admin', role: 'admin' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session so /me returns 401 afterwards', async () => {
      const agent = request.agent(app);

      await agent
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const meBeforeLogout = await agent.get('/api/auth/me');
      expect(meBeforeLogout.status).toBe(200);

      await agent.post('/api/auth/logout');

      const meAfterLogout = await agent.get('/api/auth/me');
      expect(meAfterLogout.status).toBe(401);
    });
  });
});
