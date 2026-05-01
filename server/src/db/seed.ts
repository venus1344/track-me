import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function seedUsers(
  db: Database.Database,
  adminPassword?: string,
  paPassword?: string
): Promise<void> {
  const count = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (count > 0) {
    console.log('Users already seeded, skipping.');
    return;
  }

  if (!adminPassword || !paPassword) {
    throw new Error('ADMIN_PASSWORD and PA_PASSWORD are required before first startup');
  }

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const paHash = await bcrypt.hash(paPassword, 10);

  const insert = db.prepare(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
  );

  insert.run(uuidv4(), 'admin', adminHash, 'admin');
  insert.run(uuidv4(), 'pa', paHash, 'manager');

  console.log('Seeded users: admin, pa (as manager)');
}
