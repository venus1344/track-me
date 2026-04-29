import Database from 'better-sqlite3';
import { addTaskIdToAttachments } from './001-add-task-id-to-attachments.js';
import { addStartDateToProjects } from './002-add-start-date-to-projects.js';
import { addResolutionFieldsToBlockers } from './003-add-resolution-fields-to-blockers.js';
import type { Migration } from './types.js';

const migrations: Migration[] = [
  addTaskIdToAttachments,
  addStartDateToProjects,
  addResolutionFieldsToBlockers,
];

export function runMigrations(db: Database.Database): void {
  for (const migration of migrations) {
    migration.run(db);
  }
}
