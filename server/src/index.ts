import { createDb } from './db/db.js';
import { seedUsers } from './db/seed.js';
import { createApp } from './app.js';
import { startCronJobs } from './services/cron.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';
const PA_PASSWORD = process.env.PA_PASSWORD ?? 'pa123';

const db = createDb('./kanboard.db');

await seedUsers(db, ADMIN_PASSWORD, PA_PASSWORD);

const app = createApp(db, SESSION_SECRET);

startCronJobs(db);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
