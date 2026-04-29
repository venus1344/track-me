import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface StatCard {
  label: string;
  value: number;
  color?: string;
}

interface BlockerItem {
  id: number;
  description: string;
  project: { id: number; title: string };
}

interface DueSoon {
  id: number;
  title: string;
  due_date: string;
  customer?: { name: string };
}

interface ActivityItem {
  id: number;
  action: string;
  details?: string;
  created_at: string;
  project?: { id: number; title: string };
  user?: { username: string };
}

interface DashboardData {
  stats: {
    active: number;
    blocked: number;
    due_this_week: number;
    completed: number;
  };
  active_blockers: BlockerItem[];
  due_soon: DueSoon[];
  recent_activity: ActivityItem[];
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="p-8">
        <p style={{ color: 'var(--text2)' }}>Loading dashboard…</p>
      </div>
    );
  }

  const stats: StatCard[] = [
    { label: 'Active Projects', value: data.stats.active, color: 'var(--accent)' },
    { label: 'Blocked', value: data.stats.blocked, color: 'var(--danger)' },
    { label: 'Due This Week', value: data.stats.due_this_week, color: '#f59e0b' },
    { label: 'Completed', value: data.stats.completed, color: 'var(--success)' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>
        Dashboard
      </h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-3xl font-bold mb-1" style={{ color: s.color ?? 'var(--text)' }}>
              {s.value}
            </p>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active blockers */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>
            Active Blockers
          </h2>
          {data.active_blockers.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>No active blockers</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text3)' }}>
                  <th className="text-left pb-2 font-medium">Blocker</th>
                  <th className="text-left pb-2 font-medium">Project</th>
                </tr>
              </thead>
              <tbody>
                {data.active_blockers.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer hover:brightness-110"
                    onClick={() => navigate(`/projects/${b.project.id}`)}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td className="py-2 pr-3" style={{ color: 'var(--danger)' }}>
                      {b.description}
                    </td>
                    <td className="py-2" style={{ color: 'var(--accent-text)' }}>
                      {b.project.title}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Due soon */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>
            Due Soon
          </h2>
          {data.due_soon.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>Nothing due soon</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.due_soon.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:brightness-110"
                  style={{ background: 'var(--surface2)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                      {p.title}
                    </p>
                    {p.customer && (
                      <p className="text-xs" style={{ color: 'var(--text2)' }}>{p.customer.name}</p>
                    )}
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: 'var(--surface3)', color: '#f59e0b' }}
                  >
                    {formatDate(p.due_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div
        className="mt-6 rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>
          Recent Activity
        </h2>
        {data.recent_activity.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text3)' }}>No recent activity</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.recent_activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                >
                  {(a.user?.username ?? 'S')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span style={{ color: 'var(--text)' }}>
                    <strong>{a.user?.username ?? 'System'}</strong> {a.action}
                  </span>
                  {a.project && (
                    <button
                      onClick={() => navigate(`/projects/${a.project!.id}`)}
                      className="ml-1 text-xs"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      {a.project.title}
                    </button>
                  )}
                  {a.details && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text2)' }}>
                      {a.details}
                    </p>
                  )}
                </div>
                <span className="text-xs shrink-0" style={{ color: 'var(--text3)' }}>
                  {formatDateTime(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
