import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Seed test users synchronously using bcrypt sync
  const adminHash = bcrypt.hashSync('admin123', 10);
  const paHash = bcrypt.hashSync('pa123', 10);

  const insert = db.prepare(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  insert.run(uuidv4(), 'admin', adminHash, 'admin');
  insert.run(uuidv4(), 'pa', paHash, 'pa');

  return db;
}
