import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface SettingsData {
  cron_schedule: string;
  stale_task_days: string;
  stale_blocker_days: string;
  email_enabled_overdue: string;
  email_enabled_stale_blockers: string;
  email_enabled_stale_tasks: string;
  slack_enabled: string;
  slack_webhook_url: string;
  email_recipients: string;
  brevo_api_key: string;
  email_sender_address: string;
  email_sender_name: string;
  qa_self_assign_blocked: string;
  block_project_done_if_tasks_not_done: string;
}

const DEFAULTS: SettingsData = {
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--surface3)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            background: '#fff',
            left: checked ? '22px' : '2px',
          }}
        />
      </button>
    </label>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<SettingsData>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
    enabled: user?.role === 'admin',
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (body: SettingsData) => api.put<SettingsData>('/settings', body),
    onSuccess: (newData) => {
      qc.setQueryData(['settings'], newData);
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function setField(key: keyof SettingsData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleField(key: keyof SettingsData) {
    const newValue = form[key] === 'true' ? 'false' : 'true';
    setForm((prev) => ({
      ...prev,
      [key]: newValue,
    }));
    // Auto-save workflow toggles
    if (key === 'qa_self_assign_blocked' || key === 'block_project_done_if_tasks_not_done') {
      saveMutation.mutate({ ...form, [key]: newValue });
    }
  }

  function handleSave() {
    saveMutation.mutate(form);
  }

  if (user?.role !== 'admin') {
    return (
      <div className="p-6">
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-lg font-medium" style={{ color: 'var(--text2)' }}>
            Admin access required
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <p style={{ color: 'var(--text2)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>
        Settings
      </h1>

      <div className="flex flex-col gap-6">
        {/* Schedule */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Schedule
          </h2>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
              Cron expression
            </label>
            <input
              type="text"
              value={form.cron_schedule}
              onChange={(e) => setField('cron_schedule', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
              e.g. "0 8 * * *" = daily at 08:00, "0 21 * * *" = daily at 21:00
            </p>
          </div>
        </div>

        {/* Thresholds */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Thresholds
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
                Stale task threshold (days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.stale_task_days}
                onChange={(e) => setField('stale_task_days', e.target.value)}
                className="w-24 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                Tasks with no activity for this many days are flagged
              </p>
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
                Stale blocker threshold (days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.stale_blocker_days}
                onChange={(e) => setField('stale_blocker_days', e.target.value)}
                className="w-24 px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                Unresolved blockers older than this are flagged
              </p>
            </div>
          </div>
        </div>

        {/* Workflow */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Workflow
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <Toggle
                label="Block assignee from being their own QA"
                checked={form.qa_self_assign_blocked === 'true'}
                onChange={() => toggleField('qa_self_assign_blocked')}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                When enabled, a user assigned to a task cannot also be set as that task's QA reviewer
              </p>
            </div>
            <div>
              <Toggle
                label="Block project completion if tasks remain undone"
                checked={form.block_project_done_if_tasks_not_done === 'true'}
                onChange={() => toggleField('block_project_done_if_tasks_not_done')}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                When enabled, a project cannot be marked as done until all tasks are completed
              </p>
            </div>
          </div>
        </div>

        {/* Email Notifications */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Email Notifications
          </h2>
          <div className="mb-4">
            <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
              Brevo API Key
            </label>
            <input
              type="password"
              value={form.brevo_api_key}
              onChange={(e) => setField('brevo_api_key', e.target.value)}
              placeholder="xkeysib-..."
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            />
          </div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
                Sender name
              </label>
              <input
                type="text"
                value={form.email_sender_name}
                onChange={(e) => setField('email_sender_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
                Sender email
              </label>
              <input
                type="email"
                value={form.email_sender_address}
                onChange={(e) => setField('email_sender_address', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
              Recipients
            </label>
            <input
              type="text"
              value={form.email_recipients}
              onChange={(e) => setField('email_recipients', e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
              Comma-separated email addresses for the daily digest
            </p>
          </div>
          <div className="flex flex-col">
            <Toggle
              label="Overdue projects"
              checked={form.email_enabled_overdue === 'true'}
              onChange={() => toggleField('email_enabled_overdue')}
            />
            <Toggle
              label="Stale blockers"
              checked={form.email_enabled_stale_blockers === 'true'}
              onChange={() => toggleField('email_enabled_stale_blockers')}
            />
            <Toggle
              label="Stale tasks"
              checked={form.email_enabled_stale_tasks === 'true'}
              onChange={() => toggleField('email_enabled_stale_tasks')}
            />
          </div>
        </div>

        {/* Slack */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Slack Notifications
          </h2>
          <Toggle
            label="Enable Slack notifications"
            checked={form.slack_enabled === 'true'}
            onChange={() => toggleField('slack_enabled')}
          />
          <div className="mt-3">
            <label className="block text-sm mb-1" style={{ color: 'var(--text)' }}>
              Webhook URL
            </label>
            <input
              type="text"
              value={form.slack_webhook_url}
              onChange={(e) => setField('slack_webhook_url', e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            />
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-sm" style={{ color: 'var(--success)' }}>
              Settings saved
            </span>
          )}
          {error && (
            <span className="text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
