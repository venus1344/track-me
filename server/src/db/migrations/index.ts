import Database from 'better-sqlite3';
import { addTaskIdToAttachments } from './001-add-task-id-to-attachments.js';
import { addStartDateToProjects } from './002-add-start-date-to-projects.js';
import { addResolutionFieldsToBlockers } from './003-add-resolution-fields-to-blockers.js';
import { addSettingsTable } from './004-add-settings-table.js';
import { addUserPermissions } from './005-add-user-permissions.js';
import { addQaAssignee } from './006-add-qa-assignee.js';
import { singleAssignee } from './007-single-assignee.js';
import { softDelete } from './008-soft-delete.js';
import type { Migration } from './types.js';

const migrations: Migration[] = [
  addTaskIdToAttachments,
  addStartDateToProjects,
  addResolutionFieldsToBlockers,
  addSettingsTable,
  addUserPermissions,
  addQaAssignee,
  singleAssignee,
  softDelete,
];

export function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getAppliedMigrationNames(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT name FROM schema_migrations ORDER BY applied_at, name').all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

export function runMigrations(db: Database.Database): void {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrationNames(db);

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    if (migration.disableForeignKeys) {
      db.pragma('foreign_keys = OFF');
    }

    const applyMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name);
    });

    applyMigration();

    if (migration.disableForeignKeys) {
      db.pragma('foreign_keys = ON');
    }
  }
}

export function rollbackMigrations(db: Database.Database, steps = 1): string[] {
  ensureMigrationsTable(db);

  const appliedRows = db.prepare(`
    SELECT name
    FROM schema_migrations
    ORDER BY applied_at DESC, name DESC
    LIMIT ?
  `).all(steps) as { name: string }[];

  const rolledBack: string[] = [];

  for (const { name } of appliedRows) {
    const migration = migrations.find((entry) => entry.name === name);
    if (!migration) {
      throw new Error(`Applied migration "${name}" is not registered in code`);
    }

    const rollbackMigration = db.transaction(() => {
      migration.down(db);
      db.prepare('DELETE FROM schema_migrations WHERE name = ?').run(name);
    });

    rollbackMigration();
    rolledBack.push(name);
  }

  return rolledBack;
}

export function listMigrations(): Migration[] {
  return [...migrations];
}
