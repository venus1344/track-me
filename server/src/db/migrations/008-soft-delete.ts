import type { Migration } from './types.js';

const TABLES = [
  'projects',
  'tasks',
  'customers',
  'blockers',
  'attachments',
  'project_members',
  'task_assignees',
];

export const softDelete: Migration = {
  name: '008_soft_delete',
  up(db) {
    for (const table of TABLES) {
      const cols = (db.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name);
      if (!cols.includes('deleted_at')) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
      }
    }
  },
  down(db) {
    for (const table of TABLES) {
      db.exec(`ALTER TABLE ${table} DROP COLUMN deleted_at`);
    }
  },
};
