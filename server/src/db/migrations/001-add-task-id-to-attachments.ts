import type { Migration } from './types.js';

export const addTaskIdToAttachments: Migration = {
  name: '001_add_task_id_to_attachments',
  run(db) {
    const cols = (db.pragma('table_info(attachments)') as { name: string }[]).map((c) => c.name);
    if (!cols.includes('task_id')) {
      db.exec('ALTER TABLE attachments ADD COLUMN task_id TEXT REFERENCES tasks(id)');
    }
  },
};
