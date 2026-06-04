import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from './setup.js';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';

describe('Attachments routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let projectId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db, 'test-secret');
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });

    const customerRes = await agent.post('/api/customers').send({ name: 'Attachment Customer' });
    const projectRes = await agent
      .post('/api/projects')
      .send({ customer_id: customerRes.body.id, title: 'Attachment Project' });
    projectId = projectRes.body.id;
  });

  it('rejects unsupported file types', async () => {
    const res = await agent
      .post(`/api/projects/${projectId}/attachments`)
      .attach('file', Buffer.from('<svg><script>alert(1)</script></svg>'), 'payload.svg');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Unsupported file type' });
  });

  it('serves uploaded files through the authenticated file route', async () => {
    const uploadRes = await agent
      .post(`/api/projects/${projectId}/attachments`)
      .attach(
        'file',
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pB9e5kAAAAASUVORK5CYII=',
          'base64'
        ),
        'pixel.png'
      );

    expect(uploadRes.status).toBe(201);

    const fileRes = await agent.get(
      `/api/projects/${projectId}/attachments/${uploadRes.body.id}/file`
    );

    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['x-content-type-options']).toBe('nosniff');
    expect(fileRes.headers['content-disposition']).toContain('inline');
    expect(fileRes.headers['content-type']).toContain('image/png');
  });
});
