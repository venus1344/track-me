import type { Migration } from './types.js';

export const addQaAssignee: Migration = {
  name: '006_add_qa_assignee',
  up(db) {
    db.exec('ALTER TABLE tasks ADD COLUMN qa_user_id TEXT REFERENCES users(id)');
  },
  down(db) {
    db.exec('ALTER TABLE tasks DROP COLUMN qa_user_id');
  },
};
