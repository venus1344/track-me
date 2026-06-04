import type { Migration } from './types.js';

export const singleAssignee: Migration = {
  name: '007_single_assignee',
  up(db) {
    db.exec('ALTER TABLE tasks ADD COLUMN assignee_user_id TEXT REFERENCES users(id)');

    // Migrate: copy first assignee from task_assignees into the new column
    db.exec(`
      UPDATE tasks SET assignee_user_id = (
        SELECT ta.user_id FROM task_assignees ta
        WHERE ta.task_id = tasks.id
        ORDER BY ta.created_at
        LIMIT 1
      )
    `);
  },
  down(db) {
    db.exec('ALTER TABLE tasks DROP COLUMN assignee_user_id');
  },
};
