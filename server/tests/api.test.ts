import request from 'supertest';
import { app } from '../src/app';

describe('API envelope and health route', () => {
  it('reports API and database liveness', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('database');
  });

  it('returns a consistent not-found error envelope', async () => {
    const response = await request(app).get('/api/v1/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, message: 'API route not found', data: null });
  });
});