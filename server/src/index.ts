import 'dotenv/config';
import { createDb } from './db/db.js';
import { seedUsers } from './db/seed.js';
import { createApp } from './app.js';
import { startCronJobs } from './services/cron.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function requireEnvInProd(name: string): void {
  if (process.env.NODE_ENV === 'test') return;
  if (!process.env[name]) {
    throw new Error(`${name} environment variable is required`);
  }
}

const SESSION_SECRET = requireEnv('SESSION_SECRET');

// Validate critical env vars in production (skipped in test)
requireEnvInProd('ADMIN_PASSWORD');
requireEnvInProd('PA_PASSWORD');
requireEnvInProd('ALLOWED_ORIGINS');

const dbPath = process.env.DB_PATH ?? './kanboard.db';
const db = createDb(dbPath);

await seedUsers(db, process.env.ADMIN_PASSWORD, process.env.PA_PASSWORD);

const app = createApp(db, SESSION_SECRET);

startCronJobs(db);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
