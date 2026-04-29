import Database from 'better-sqlite3';

type Migration = {
  name: string;
  run: (db: Database.Database) => void;
};

const migrations: Migration[] = [
  {
    name: 'add_task_id_to_attachments',
    run(db) {
      const cols = (db.pragma('table_info(attachments)') as { name: string }[]).map((c) => c.name);
      if (!cols.includes('task_id')) {
        db.exec('ALTER TABLE attachments ADD COLUMN task_id TEXT REFERENCES tasks(id)');
      }
    },
  },
];

export function runMigrations(db: Database.Database): void {
  for (const migration of migrations) {
    migration.run(db);
  }
}
