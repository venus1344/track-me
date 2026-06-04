import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatUtcDateTime } from '../lib/dates';

interface Notification {
  id: number;
  type: 'blocker' | 'overdue' | 'done' | 'follow_up' | string;
  message: string;
  read: boolean;
  created_at: string;
  project?: { id: number; title: string };
}

function typeStyle(type: string): { background: string; color: string; label: string } {
  switch (type) {
    case 'blocker':
      return { background: 'var(--danger-bg)', color: 'var(--danger)', label: 'Blocker' };
    case 'overdue':
      return { background: 'var(--danger-bg)', color: 'var(--danger)', label: 'Overdue' };
    case 'done':
      return { background: 'var(--success-bg)', color: 'var(--success)', label: 'Done' };
    case 'follow_up':
      return { background: 'var(--accent-bg)', color: 'var(--accent-text)', label: 'Follow-up' };
    default:
      return { background: 'var(--surface3)', color: 'var(--text2)', label: type };
  }
}

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleClick(n: Notification) {
    if (!n.read) markReadMutation.mutate(n.id);
    if (n.project) navigate(`/projects/${n.project.id}`);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--text2)' }}>Loading…</p>
      ) : notifications.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text2)' }}>All caught up!</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>No notifications yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => {
            const ts = typeStyle(n.type);
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className="flex items-start gap-4 px-5 py-4 rounded-2xl cursor-pointer hover:brightness-110 transition-all"
                style={{
                  background: n.read ? 'var(--surface)' : 'var(--surface2)',
                  border: `1px solid ${n.read ? 'var(--border)' : 'var(--border2)'}`,
                  opacity: n.read ? 0.7 : 1,
                }}
              >
                {/* Unread dot */}
                <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.read ? 'transparent' : 'var(--accent)' }} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: ts.background, color: ts.color }}
                    >
                      {ts.label}
                    </span>
                    {n.project && (
                      <span className="text-xs" style={{ color: 'var(--accent-text)' }}>
                        {n.project.title}
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{n.message}</p>
                </div>

                {/* Timestamp */}
                <span className="text-xs shrink-0 mt-1" style={{ color: 'var(--text3)' }}>
                  {formatUtcDateTime(n.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
