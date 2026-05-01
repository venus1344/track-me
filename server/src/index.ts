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

const SESSION_SECRET = requireEnv('SESSION_SECRET');

const db = createDb('./kanboard.db');

await seedUsers(db, process.env.ADMIN_PASSWORD, process.env.PA_PASSWORD);

const app = createApp(db, SESSION_SECRET);

startCronJobs(db);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
