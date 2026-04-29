import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from './setup.js';
import { createApp } from '../app.js';
import type Database from 'better-sqlite3';

describe('Customers routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    db = createTestDb();
    app = createApp(db, 'test-secret');
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  });

  it('requires auth (returns 401 when not logged in)', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  it('creates a customer', async () => {
    const res = await agent
      .post('/api/customers')
      .send({ name: 'Acme Corp', email: 'acme@example.com' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Acme Corp', email: 'acme@example.com', color: '#6366f1' });
    expect(res.body).toHaveProperty('id');
  });

  it('rejects creation without name', async () => {
    const res = await agent.post('/api/customers').send({ email: 'no-name@example.com' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('lists customers with project counts', async () => {
    await agent.post('/api/customers').send({ name: 'Customer A' });
    await agent.post('/api/customers').send({ name: 'Customer B' });

    const res = await agent.get('/api/customers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // Each customer should have project_count and active_blockers
    const customer = res.body[0];
    expect(customer).toHaveProperty('project_count');
    expect(customer).toHaveProperty('active_blockers');
  });

  it('gets a single customer by id', async () => {
    const createRes = await agent.post('/api/customers').send({ name: 'Single Customer' });
    const id = createRes.body.id;

    const res = await agent.get(`/api/customers/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Single Customer' });
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  it('returns 404 for non-existent customer', async () => {
    const res = await agent.get('/api/customers/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('updates a customer', async () => {
    const createRes = await agent.post('/api/customers').send({ name: 'Old Name' });
    const id = createRes.body.id;

    const res = await agent.put(`/api/customers/${id}`).send({ name: 'New Name', phone: '555-1234' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'New Name', phone: '555-1234' });
  });

  it('deletes a customer', async () => {
    const createRes = await agent.post('/api/customers').send({ name: 'To Delete' });
    const id = createRes.body.id;

    const deleteRes = await agent.delete(`/api/customers/${id}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toMatchObject({ success: true });

    const getRes = await agent.get(`/api/customers/${id}`);
    expect(getRes.status).toBe(404);
  });
});
