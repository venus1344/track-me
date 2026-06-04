import Database from 'better-sqlite3';

const DEFAULTS: Record<string, string> = {
  cron_schedule: '0 8 * * *',
  stale_task_days: '7',
  stale_blocker_days: '3',
  email_enabled_overdue: 'false',
  email_enabled_stale_blockers: 'false',
  email_enabled_stale_tasks: 'false',
  slack_enabled: 'true',
  slack_webhook_url: '',
  email_recipients: '',
  brevo_api_key: '',
  email_sender_address: 'noreply@kanboard.app',
  email_sender_name: 'Mooove',
  qa_self_assign_blocked: 'false',
  block_project_done_if_tasks_not_done: 'false',
};

export type SettingsMap = Record<string, string>;

export function getAllSettings(db: Database.Database): SettingsMap {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const map: SettingsMap = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function getSetting(db: Database.Database, key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? DEFAULTS[key] ?? '';
}

export function setSetting(
  db: Database.Database,
  key: string,
  value: string
): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value);
}

export function setSettings(
  db: Database.Database,
  entries: Record<string, string>
): void {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const apply = db.transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      upsert.run(key, value);
    }
  });
  apply();
}

export function getBool(settings: SettingsMap, key: string): boolean {
  return settings[key] === 'true';
}

export function getInt(settings: SettingsMap, key: string): number {
  return parseInt(settings[key], 10) || 0;
}
