import Database from 'better-sqlite3';
import cron from 'node-cron';
import { createInAppNotification, sendSlackNotification } from './notify.js';

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

export function startCronJobs(db: Database.Database): void {
  const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL ?? 'https://hooks.slack.com/xxx';

  // Run at 08:00 every day
  cron.schedule('0 8 * * *', async () => {
    // --- Overdue projects ---
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
      await sendSlackNotification(SLACK_WEBHOOK, message);
    }

    // --- Unresolved blockers 3+ days old ---
    const staleBlockers = db.prepare(`
      SELECT
        b.id,
        b.description,
        b.project_id,
        p.title AS project_title
      FROM blockers b
      JOIN projects p ON p.id = b.project_id
      WHERE b.resolved = 0
        AND b.created_at <= date('now', '-3 days')
    `).all() as StaleBlocker[];

    for (const blocker of staleBlockers) {
      const message = `Blocker on project "${blocker.project_title}" has been unresolved for 3+ days: ${blocker.description}`;
      createInAppNotification(db, {
        projectId: blocker.project_id,
        type: 'stale_blocker',
        message,
      });
      await sendSlackNotification(SLACK_WEBHOOK, message);
    }
  });
}
