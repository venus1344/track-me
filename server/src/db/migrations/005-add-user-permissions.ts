import type { Migration } from './types.js';

export const addUserPermissions: Migration = {
  name: '005_add_user_permissions',
  disableForeignKeys: true,
  up(db) {
    // --- Expand users table ---
    const userCols = (db.pragma('table_info(users)') as { name: string }[]).map((c) => c.name);

    if (!userCols.includes('email')) {
      db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    }
    if (!userCols.includes('display_name')) {
      db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
    }
    if (!userCols.includes('active')) {
      db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    }

    // SQLite cannot ALTER CHECK constraints, so we recreate the table
    // to expand role from ('admin','pa') to ('admin','manager','member','viewer')
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_new (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
        email TEXT,
        display_name TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Copy data, renaming 'pa' role to 'manager' in the process
    db.exec(`
      INSERT OR IGNORE INTO users_new (id, username, password_hash, role, email, display_name, active, created_at)
      SELECT id, username, password_hash,
        CASE WHEN role = 'pa' THEN 'manager' ELSE role END,
        email, display_name, COALESCE(active, 1), created_at
      FROM users
    `);

    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');

    // --- Project members table ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_members (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_access TEXT NOT NULL DEFAULT 'all' CHECK (task_access IN ('all', 'assigned')),
        granted_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, user_id)
      )
    `);

    // --- Task assignees table ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_assignees (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(task_id, user_id)
      )
    `);

    // --- Indexes ---
    db.exec('CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id)');

    // --- Grant admin users access to all existing projects ---
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: string }[];
    const projects = db.prepare('SELECT id FROM projects').all() as { id: string }[];
    const insertMember = db.prepare(
      'INSERT OR IGNORE INTO project_members (id, project_id, user_id, task_access) VALUES (?, ?, ?, ?)'
    );
    for (const admin of admins) {
      for (const project of projects) {
        insertMember.run(`pm_${admin.id}_${project.id}`, project.id, admin.id, 'all');
      }
    }

    // Grant existing manager (formerly pa) users access to all existing projects
    const managers = db.prepare("SELECT id FROM users WHERE role = 'manager'").all() as { id: string }[];
    for (const manager of managers) {
      for (const project of projects) {
        insertMember.run(`pm_${manager.id}_${project.id}`, project.id, manager.id, 'all');
      }
    }
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS task_assignees');
    db.exec('DROP TABLE IF EXISTS project_members');

    // Restore original users table structure
    db.exec("UPDATE users SET role = 'pa' WHERE role = 'manager'");
    db.exec("UPDATE users SET role = 'pa' WHERE role = 'member'");
    db.exec("UPDATE users SET role = 'pa' WHERE role = 'viewer'");

    db.exec(`
      CREATE TABLE IF NOT EXISTS users_old (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'pa')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      INSERT OR IGNORE INTO users_old (id, username, password_hash, role, created_at)
      SELECT id, username, password_hash, role, created_at FROM users
    `);

    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_old RENAME TO users');
  },
};
