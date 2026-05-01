import type { Migration } from './types.js';

export const addResolutionFieldsToBlockers: Migration = {
  name: '003_add_resolution_fields_to_blockers',
  up(db) {
    const cols = (db.pragma('table_info(blockers)') as { name: string }[]).map((c) => c.name);

    if (!cols.includes('resolution_note')) {
      db.exec('ALTER TABLE blockers ADD COLUMN resolution_note TEXT');
    }

    if (!cols.includes('resolved_by_user_id')) {
      db.exec('ALTER TABLE blockers ADD COLUMN resolved_by_user_id TEXT REFERENCES users(id)');
    }
  },
  down(db) {
    const cols = (db.pragma('table_info(blockers)') as { name: string }[]).map((c) => c.name);

    if (cols.includes('resolved_by_user_id')) {
      db.exec('ALTER TABLE blockers DROP COLUMN resolved_by_user_id');
    }

    if (cols.includes('resolution_note')) {
      db.exec('ALTER TABLE blockers DROP COLUMN resolution_note');
    }
  },
};
