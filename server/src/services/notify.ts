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
  html: string,
  senderEmail = 'noreply@kanboard.app',
  senderName = 'Mooove'
): Promise<void> {
  if (!apiKey || apiKey.includes('xxx')) return;
  try {
    const { BrevoClient } = await import('@getbrevo/brevo');
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });
  } catch {
    // Best-effort — do not throw
  }
}

export async function sendEmailDigest(
  apiKey: string,
  recipients: string[],
  subject: string,
  html: string,
  senderEmail = 'noreply@kanboard.app',
  senderName = 'Mooove'
): Promise<void> {
  if (!apiKey || apiKey.includes('xxx')) return;
  if (recipients.length === 0) return;
  try {
    const { BrevoClient } = await import('@getbrevo/brevo');
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { email: senderEmail, name: senderName },
      to: recipients.map((email) => ({ email })),
      subject,
      htmlContent: html,
    });
  } catch {
    // Best-effort — do not throw
  }
}
