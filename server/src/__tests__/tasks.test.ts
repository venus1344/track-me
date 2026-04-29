import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from './setup.js';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';

describe('Tasks routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let projectId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db, 'test-secret');
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    // Create a customer and project to use in task tests
    const customerRes = await agent.post('/api/customers').send({ name: 'Task Customer' });
    const projectRes = await agent.post('/api/projects').send({
      customer_id: customerRes.body.id,
      title: 'Task Project',
    });
    projectId = projectRes.body.id;
  });

  it('requires auth (returns 401 when not logged in)', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(res.status).toBe(401);
  });

  it('creates a task with default stage todo', async () => {
    const res = await agent
      .post(`/api/projects/${projectId}/tasks`)
      .send({ title: 'First Task' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'First Task', stage: 'todo' });
    expect(res.body).toHaveProperty('id');
    expect(res.body.project_id).toBe(projectId);
  });

  it('rejects creation without title', async () => {
    const res = await agent.post(`/api/projects/${projectId}/tasks`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('lists tasks with active_blockers count', async () => {
    await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Task A' });
    await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Task B' });

    const res = await agent.get(`/api/projects/${projectId}/tasks`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    const task = res.body[0];
    expect(task).toHaveProperty('active_blockers');
  });

  it('sort_order auto-increments', async () => {
    const t1 = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Task 1' });
    const t2 = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Task 2' });
    const t3 = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Task 3' });
    expect(t2.body.sort_order).toBeGreaterThan(t1.body.sort_order);
    expect(t3.body.sort_order).toBeGreaterThan(t2.body.sort_order);
  });

  it('gets a single task with project info and blockers', async () => {
    const createRes = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Detail Task' });
    const taskId = createRes.body.id;

    const res = await agent.get(`/api/projects/${projectId}/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Detail Task' });
    expect(res.body).toHaveProperty('project_title');
    expect(res.body).toHaveProperty('customer_name');
    expect(res.body).toHaveProperty('active_blockers');
    expect(res.body).toHaveProperty('blockers');
    expect(Array.isArray(res.body.blockers)).toBe(true);
  });

  it('updates a task stage', async () => {
    const createRes = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Stage Task' });
    const taskId = createRes.body.id;

    const res = await agent.put(`/api/projects/${projectId}/tasks/${taskId}`).send({ stage: 'inprogress' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('inprogress');
  });

  it('deletes a task', async () => {
    const createRes = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Delete Me' });
    const taskId = createRes.body.id;

    const deleteRes = await agent.delete(`/api/projects/${projectId}/tasks/${taskId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toMatchObject({ success: true });

    const getRes = await agent.get(`/api/projects/${projectId}/tasks/${taskId}`);
    expect(getRes.status).toBe(404);
  });
});
