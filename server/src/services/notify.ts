import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

interface UserRow {
  id: string;
  username: string;
  role: string;
}

interface CreateNotificationParams {
  projectId?: string | null;
  type: string;
  message: string;
  userId?: string | null;
}

export function createInAppNotification(
  db: Database.Database,
  params: CreateNotificationParams
): void {
  const { projectId, type, message, userId } = params;

  if (userId) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, project_id, type, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid(), userId, projectId ?? null, type, message);
  } else {
    // Notify ALL users
    const users = db.prepare('SELECT id FROM users').all() as { id: string }[];
    for (const user of users) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, project_id, type, message)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), user.id, projectId ?? null, type, message);
    }
  }
}

export async function sendSlackNotification(webhookUrl: string, message: string): Promise<void> {
  if (webhookUrl.includes('xxx')) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    // Best-effort — do not throw
  }
}

export async function sendEmailNotification(
  apiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (apiKey.includes('xxx')) return;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: 'Kanboard <noreply@kanboard.app>',
      to,
      subject,
      html,
    });
  } catch {
    // Best-effort — do not throw
  }
}
