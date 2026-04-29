import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from './setup.js';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';

describe('Blockers routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db, 'test-secret');
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    // Create a customer, project, and task for blocker tests
    const customerRes = await agent.post('/api/customers').send({ name: 'Blocker Customer' });
    const projectRes = await agent.post('/api/projects').send({
      customer_id: customerRes.body.id,
      title: 'Blocker Project',
    });
    projectId = projectRes.body.id;
    const taskRes = await agent.post(`/api/projects/${projectId}/tasks`).send({ title: 'Blocker Task' });
    taskId = taskRes.body.id;
  });

  it('requires auth (returns 401 when not logged in)', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/blockers`);
    expect(res.status).toBe(401);
  });

  it('creates a project-level blocker (task_id null)', async () => {
    const res = await agent
      .post(`/api/projects/${projectId}/blockers`)
      .send({ description: 'Waiting on client approval' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: 'Waiting on client approval', resolved: 0 });
    expect(res.body.task_id).toBeNull();
    expect(res.body.project_id).toBe(projectId);
  });

  it('creates a task-level blocker', async () => {
    const res = await agent
      .post(`/api/projects/${projectId}/blockers`)
      .send({ description: 'Missing design assets', task_id: taskId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: 'Missing design assets', task_id: taskId });
    expect(res.body.resolved).toBe(0);
  });

  it('rejects creation without description', async () => {
    const res = await agent.post(`/api/projects/${projectId}/blockers`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('lists all blockers for a project', async () => {
    await agent.post(`/api/projects/${projectId}/blockers`).send({ description: 'Blocker A' });
    await agent.post(`/api/projects/${projectId}/blockers`).send({ description: 'Blocker B', task_id: taskId });

    const res = await agent.get(`/api/projects/${projectId}/blockers`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it('filters blockers by taskId', async () => {
    await agent.post(`/api/projects/${projectId}/blockers`).send({ description: 'Project blocker' });
    await agent.post(`/api/projects/${projectId}/blockers`).send({ description: 'Task blocker', task_id: taskId });

    const res = await agent.get(`/api/projects/${projectId}/blockers?taskId=${taskId}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].task_id).toBe(taskId);
  });

  it('resolves a blocker (resolved=1 and resolved_at set)', async () => {
    const createRes = await agent
      .post(`/api/projects/${projectId}/blockers`)
      .send({ description: 'Unblocked soon' });
    const blockerId = createRes.body.id;

    const res = await agent.put(`/api/projects/${projectId}/blockers/${blockerId}`).send({ resolved: 1 });
    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(1);
    expect(res.body.resolved_at).not.toBeNull();
  });

  it('unresolves a previously resolved blocker', async () => {
    const createRes = await agent
      .post(`/api/projects/${projectId}/blockers`)
      .send({ description: 'Already resolved' });
    const blockerId = createRes.body.id;

    await agent.put(`/api/projects/${projectId}/blockers/${blockerId}`).send({ resolved: 1 });
    const res = await agent.put(`/api/projects/${projectId}/blockers/${blockerId}`).send({ resolved: 0 });
    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(0);
    expect(res.body.resolved_at).toBeNull();
  });

  it('deletes a blocker', async () => {
    const createRes = await agent
      .post(`/api/projects/${projectId}/blockers`)
      .send({ description: 'Delete me' });
    const blockerId = createRes.body.id;

    const deleteRes = await agent.delete(`/api/projects/${projectId}/blockers/${blockerId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toMatchObject({ success: true });

    const listRes = await agent.get(`/api/projects/${projectId}/blockers`);
    const ids = listRes.body.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(blockerId);
  });
});
