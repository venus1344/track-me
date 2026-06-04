import type { Migration } from './types.js';

export const addStartDateToProjects: Migration = {
  name: '002_add_start_date_to_projects',
  up(db) {
    const cols = (db.pragma('table_info(projects)') as { name: string }[]).map((c) => c.name);
    if (!cols.includes('start_date')) {
      db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
    }
  },
  down(db) {
    const cols = (db.pragma('table_info(projects)') as { name: string }[]).map((c) => c.name);
    if (cols.includes('start_date')) {
      db.exec('ALTER TABLE projects DROP COLUMN start_date');
    }
  },
};
