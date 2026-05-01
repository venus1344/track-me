import { openDb, bootstrapSchema, closeDb } from './db.js';
import { ensureMigrationsTable, listMigrations, rollbackMigrations, runMigrations } from './migrations/index.js';

function usage(): never {
  console.error('Usage: tsx src/db/migrate.ts <up|down|status> [steps]');
  process.exit(1);
}

const [, , command, stepsArg] = process.argv;
const dbPath = process.env.DB_PATH ?? './kanboard.db';

if (!command) usage();

const db = openDb(dbPath);
bootstrapSchema(db);

try {
  switch (command) {
    case 'up': {
      runMigrations(db);
      console.log(`Applied pending migrations to ${dbPath}`);
      break;
    }
    case 'down': {
      ensureMigrationsTable(db);
      const appliedCount = (db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }).count;
      const steps = stepsArg ? Number.parseInt(stepsArg, 10) : appliedCount;
      if (!Number.isInteger(steps) || steps < 1) {
        throw new Error('steps must be a positive integer when provided');
      }
      const rolledBack = rollbackMigrations(db, steps);
      if (rolledBack.length === 0) {
        console.log('No applied migrations to roll back');
      } else {
        console.log(`Rolled back migrations from ${dbPath}: ${rolledBack.join(', ')}`);
      }
      break;
    }
    case 'status': {
      ensureMigrationsTable(db);
      const applied = db.prepare('SELECT name, applied_at FROM schema_migrations ORDER BY applied_at, name').all() as {
        name: string;
        applied_at: string;
      }[];
      const appliedNames = new Set(applied.map((row) => row.name));

      for (const migration of listMigrations()) {
        const row = applied.find((entry) => entry.name === migration.name);
        const state = appliedNames.has(migration.name) ? `up (${row?.applied_at ?? 'unknown'})` : 'pending';
        console.log(`${migration.name}: ${state}`);
      }
      break;
    }
    default:
      usage();
  }
} finally {
  closeDb(db);
}
