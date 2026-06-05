import type { Migration } from './types.js';

export const addQaAssignee: Migration = {
  name: '006_add_qa_assignee',
  up(db) {
    const cols = (db.pragma('table_info(tasks)') as { name: string }[]).map((c) => c.name);
    if (!cols.includes('qa_user_id')) {
      db.exec('ALTER TABLE tasks ADD COLUMN qa_user_id TEXT REFERENCES users(id)');
    }
  },
  down(db) {
    db.exec('ALTER TABLE tasks DROP COLUMN qa_user_id');
  },
};
