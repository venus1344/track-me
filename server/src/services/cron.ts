import Database from 'better-sqlite3';
import cron, { ScheduledTask } from 'node-cron';
import { createInAppNotification, sendSlackNotification, sendEmailDigest } from './notify.js';
import { getAllSettings, getBool, getInt } from './settings.js';

interface OverdueProject {
  id: string;
  title: string;
}

interface StaleBlocker {
  id: string;
  description: string;
  project_id: string;
  project_title: string;
}

interface StaleTask {
  id: string;
  title: string;
  project_id: string;
  project_title: string;
  days_idle: number;
}

let currentTask: ScheduledTask | null = null;

function buildCronHandler(db: Database.Database) {
  return async () => {
    const settings = getAllSettings(db);
    const SLACK_WEBHOOK = settings.slack_webhook_url || process.env.SLACK_WEBHOOK_URL || '';
    const BREVO_API_KEY = settings.brevo_api_key || process.env.BREVO_API_KEY || '';
    const senderEmail = settings.email_sender_address || 'noreply@kanboard.app';
    const senderName = settings.email_sender_name || 'Mooove';
    const slackEnabled = getBool(settings, 'slack_enabled');
    const staleBlockerDays = getInt(settings, 'stale_blocker_days');
    const staleTaskDays = getInt(settings, 'stale_task_days');

    const digestSections: string[] = [];

    // --- 1. Overdue projects ---
    const overdueProjects = db.prepare(`
      SELECT p.id, p.title
      FROM projects p
      WHERE p.due_date < date('now')
        AND p.stage != 'done'
        AND p.archived = 0
    `).all() as OverdueProject[];

    for (const project of overdueProjects) {
      const message = `Project "${project.title}" is overdue.`;
      createInAppNotification(db, {
        projectId: project.id,
        type: 'overdue',
        message,
      });
      if (slackEnabled) await sendSlackNotification(SLACK_WEBHOOK, message);
    }

    if (overdueProjects.length > 0 && getBool(settings, 'email_enabled_overdue')) {
      digestSections.push(
        `<h2>Overdue Projects (${overdueProjects.length})</h2><ul>` +
        overdueProjects.map((p) => `<li>${escapeHtml(p.title)}</li>`).join('') +
        '</ul>'
      );
    }

    // --- 2. Stale blockers ---
    const staleBlockers = db.prepare(`
      SELECT
        b.id,
        b.description,
        b.project_id,
        p.title AS project_title
      FROM blockers b
      JOIN projects p ON p.id = b.project_id
      WHERE b.resolved = 0
        AND b.created_at <= date('now', ? || ' days')
    `).all(`-${staleBlockerDays}`) as StaleBlocker[];

    for (const blocker of staleBlockers) {
      const message = `Blocker on "${blocker.project_title}" unresolved for ${staleBlockerDays}+ days: ${blocker.description}`;
      createInAppNotification(db, {
        projectId: blocker.project_id,
        type: 'stale_blocker',
        message,
      });
      if (slackEnabled) await sendSlackNotification(SLACK_WEBHOOK, message);
    }

    if (staleBlockers.length > 0 && getBool(settings, 'email_enabled_stale_blockers')) {
      digestSections.push(
        `<h2>Stale Blockers (${staleBlockers.length})</h2><ul>` +
        staleBlockers
          .map((b) => `<li><strong>${escapeHtml(b.project_title)}:</strong> ${escapeHtml(b.description)}</li>`)
          .join('') +
        '</ul>'
      );
    }

    // --- 3. Stale tasks ---
    const staleTasks = db.prepare(`
      SELECT
        t.id,
        t.title,
        t.project_id,
        p.title AS project_title,
        CAST(julianday('now') - julianday(
          COALESCE(
            (SELECT MAX(a.created_at) FROM activity a WHERE a.task_id = t.id),
            t.created_at
          )
        ) AS INTEGER) AS days_idle
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.stage != 'done'
        AND p.archived = 0
        AND CAST(julianday('now') - julianday(
          COALESCE(
            (SELECT MAX(a.created_at) FROM activity a WHERE a.task_id = t.id),
            t.created_at
          )
        ) AS INTEGER) >= ?
    `).all(staleTaskDays) as StaleTask[];

    for (const task of staleTasks) {
      const message = `Task "${task.title}" on "${task.project_title}" has had no activity for ${task.days_idle} days.`;
      createInAppNotification(db, {
        projectId: task.project_id,
        type: 'stale_task',
        message,
      });
      if (slackEnabled) await sendSlackNotification(SLACK_WEBHOOK, message);
    }

    if (staleTasks.length > 0 && getBool(settings, 'email_enabled_stale_tasks')) {
      digestSections.push(
        `<h2>Stale Tasks (${staleTasks.length})</h2><ul>` +
        staleTasks
          .map((t) => `<li><strong>${escapeHtml(t.project_title)}:</strong> ${escapeHtml(t.title)} (${t.days_idle} days idle)</li>`)
          .join('') +
        '</ul>'
      );
    }

    // --- 4. Send email digest ---
    if (digestSections.length > 0) {
      const recipients = settings.email_recipients
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      if (recipients.length > 0 && BREVO_API_KEY) {
        const html = `<h1>Mooove Daily Digest</h1>` + digestSections.join('<hr/>');
        await sendEmailDigest(BREVO_API_KEY, recipients, 'Mooove Daily Digest', html, senderEmail, senderName);
      }
    }
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function startCronJobs(db: Database.Database): void {
  const settings = getAllSettings(db);
  const schedule = settings.cron_schedule || '0 8 * * *';
  currentTask = cron.schedule(schedule, buildCronHandler(db));
}

export function reschedule(db: Database.Database): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  startCronJobs(db);
}
