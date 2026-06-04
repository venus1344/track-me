import type { Migration } from './types.js';

export const addSettingsTable: Migration = {
  name: '004_add_settings_table',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const insert = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );
    insert.run('cron_schedule', '0 8 * * *');
    insert.run('stale_task_days', '7');
    insert.run('stale_blocker_days', '3');
    insert.run('email_enabled_overdue', 'false');
    insert.run('email_enabled_stale_blockers', 'false');
    insert.run('email_enabled_stale_tasks', 'false');
    insert.run('slack_enabled', 'true');
    insert.run('email_recipients', '');
    insert.run('slack_webhook_url', process.env.SLACK_WEBHOOK_URL ?? '');
    insert.run('brevo_api_key', process.env.BREVO_API_KEY ?? '');
    insert.run('email_sender_address', 'noreply@kanboard.app');
    insert.run('email_sender_name', 'Mooove');
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS settings');
  },
};
