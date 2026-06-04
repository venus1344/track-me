import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { runMigrations } from './migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

export function openDb(dbPath = './kanboard.db'): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function bootstrapSchema(db: Database.Database): void {
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
}

export function closeDb(db: Database.Database): void {
  db.close();
}

export function getDb(dbPath = './kanboard.db'): Database.Database {
  if (_db) return _db;

  _db = openDb(dbPath);
  bootstrapSchema(_db);
  runMigrations(_db);

  return _db;
}

export function createDb(dbPath = './kanboard.db'): Database.Database {
  const db = openDb(dbPath);
  bootstrapSchema(db);
  runMigrations(db);

  return db;
}
