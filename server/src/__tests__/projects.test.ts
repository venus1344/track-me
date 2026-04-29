import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from './setup.js';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';

describe('Projects routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let customerId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db, 'test-secret');
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    // Create a customer to use in project tests
    const customerRes = await agent.post('/api/customers').send({ name: 'Test Customer' });
    customerId = customerRes.body.id;
  });

  it('requires auth (returns 401 when not logged in)', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('creates a project with a share token', async () => {
    const res = await agent
      .post('/api/projects')
      .send({ customer_id: customerId, title: 'Website Redesign' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Website Redesign', stage: 'scoping' });
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('share_token');
    expect(typeof res.body.share_token).toBe('string');
    expect(res.body.share_token.length).toBeGreaterThan(0);
  });

  it('rejects creation without title', async () => {
    const res = await agent.post('/api/projects').send({ customer_id: customerId });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects creation without customer_id', async () => {
    const res = await agent.post('/api/projects').send({ title: 'No Customer' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('lists projects with customer info', async () => {
    await agent.post('/api/projects').send({ customer_id: customerId, title: 'Project A' });
    await agent.post('/api/projects').send({ customer_id: customerId, title: 'Project B' });

    const res = await agent.get('/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const project = res.body[0];
    expect(project).toHaveProperty('customer_name');
    expect(project).toHaveProperty('customer_color');
    expect(project).toHaveProperty('tasks_done');
    expect(project).toHaveProperty('tasks_total');
    expect(project).toHaveProperty('active_blockers');
  });

  it('filters projects by customerId', async () => {
    const otherCustomerRes = await agent.post('/api/customers').send({ name: 'Other Customer' });
    const otherCustomerId = otherCustomerRes.body.id;

    await agent.post('/api/projects').send({ customer_id: customerId, title: 'My Project' });
    await agent.post('/api/projects').send({ customer_id: otherCustomerId, title: 'Other Project' });

    const res = await agent.get(`/api/projects?customerId=${customerId}`);
    expect(res.status).toBe(200);
    expect(res.body.every((p: { customer_id: string }) => p.customer_id === customerId)).toBe(true);
  });

  it('gets a single project by id with customer info', async () => {
    const createRes = await agent.post('/api/projects').send({ customer_id: customerId, title: 'Detail Project' });
    const projectId = createRes.body.id;

    const res = await agent.get(`/api/projects/${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Detail Project' });
    expect(res.body).toHaveProperty('customer_name');
    expect(res.body).toHaveProperty('customer_email');
    expect(res.body).toHaveProperty('customer_phone');
    expect(res.body).toHaveProperty('customer_color');
  });

  it('updates stage and returns _oldStage', async () => {
    const createRes = await agent.post('/api/projects').send({ customer_id: customerId, title: 'Stage Test' });
    const projectId = createRes.body.id;

    const res = await agent.put(`/api/projects/${projectId}`).send({ stage: 'inprogress' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('inprogress');
    expect(res.body._oldStage).toBe('scoping');
  });

  it('archives project — not in default list, shows in ?archived=1', async () => {
    const createRes = await agent.post('/api/projects').send({ customer_id: customerId, title: 'Archive Me' });
    const projectId = createRes.body.id;

    const archiveRes = await agent.post(`/api/projects/${projectId}/archive`);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.archived).toBe(1);

    const defaultList = await agent.get('/api/projects');
    const ids = defaultList.body.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(projectId);

    const archivedList = await agent.get('/api/projects?archived=1');
    const archivedIds = archivedList.body.map((p: { id: string }) => p.id);
    expect(archivedIds).toContain(projectId);
  });

  it('deletes a project', async () => {
    const createRes = await agent.post('/api/projects').send({ customer_id: customerId, title: 'To Delete' });
    const projectId = createRes.body.id;

    const deleteRes = await agent.delete(`/api/projects/${projectId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toMatchObject({ success: true });

    const getRes = await agent.get(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(404);
  });
});
