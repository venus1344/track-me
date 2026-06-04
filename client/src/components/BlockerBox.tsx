import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatUtcDateTime } from '../lib/dates';

interface Blocker {
  id: string;
  description: string;
  resolved: boolean;
  created_at: string;
  resolved_at?: string | null;
  resolution_note?: string | null;
  resolved_by_username?: string | null;
}

interface BlockerBoxProps {
  projectId: string | undefined;
  blockers?: Blocker[];
  taskId?: string;
}

export default function BlockerBox({ projectId, blockers: initialBlockers, taskId }: BlockerBoxProps) {
  const qc = useQueryClient();
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  const queryKey = taskId
    ? ['blockers', 'task', taskId]
    : ['blockers', 'project', projectId];

  const { data: blockers } = useQuery<Blocker[]>({
    queryKey,
    queryFn: () =>
      taskId
        ? api.get(`/projects/${projectId}/blockers?taskId=${taskId}`)
        : api.get(`/projects/${projectId}/blockers`),
    initialData: initialBlockers,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey });
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
    void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const addMutation = useMutation({
    mutationFn: (description: string) =>
      api.post(`/projects/${projectId}/blockers`, {
        description,
        ...(taskId ? { task_id: taskId } : {}),
      }),
    onSuccess: () => {
      setNewText('');
      setAdding(false);
      invalidate();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ blockerId, resolutionNote }: { blockerId: string; resolutionNote: string }) =>
      api.put(`/projects/${projectId}/blockers/${blockerId}`, {
        resolved: 1,
        resolution_note: resolutionNote,
      }),
    onSuccess: (_data, { blockerId }) => {
      setResolvingId(null);
      setResolutionNotes((prev) => ({ ...prev, [blockerId]: '' }));
      invalidate();
    },
  });

  const active = (blockers ?? []).filter((b) => !b.resolved);
  const resolved = (blockers ?? []).filter((b) => b.resolved);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: active.length > 0 ? 'var(--danger-bg)' : 'var(--surface2)',
        border: `1px solid ${active.length > 0 ? 'var(--danger)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: active.length > 0 ? 'var(--danger)' : 'var(--text2)' }}>
          {active.length > 0 ? `${active.length} Active Blocker${active.length > 1 ? 's' : ''}` : 'Blockers'}
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
          >
            + Add
          </button>
        )}
      </div>

      {active.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {active.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-2 text-sm"
              style={{ color: 'var(--danger)' }}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">✕</span>
                <span className="flex-1">{b.description}</span>
                <button
                  onClick={() => setResolvingId((current) => current === b.id ? null : b.id)}
                  className="text-xs px-2 py-0.5 rounded-lg shrink-0"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                  disabled={resolveMutation.isPending}
                >
                  Resolve
                </button>
              </div>

              {resolvingId === b.id && (
                <div className="ml-6 flex flex-col gap-2">
                  <textarea
                    autoFocus
                    rows={2}
                    value={resolutionNotes[b.id] ?? ''}
                    onChange={(e) => setResolutionNotes((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    placeholder="Describe how this blocker was resolved…"
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border2)',
                      color: 'var(--text)',
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const resolutionNote = (resolutionNotes[b.id] ?? '').trim();
                        if (resolutionNote) {
                          resolveMutation.mutate({ blockerId: b.id, resolutionNote });
                        }
                      }}
                      disabled={!(resolutionNotes[b.id] ?? '').trim() || resolveMutation.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'var(--success)', color: '#fff' }}
                    >
                      Save Resolution
                    </button>
                    <button
                      onClick={() => setResolvingId(null)}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newText.trim()) addMutation.mutate(newText.trim());
              if (e.key === 'Escape') { setAdding(false); setNewText(''); }
            }}
            placeholder="Describe the blocker…"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border2)',
              color: 'var(--text)',
            }}
          />
          <button
            onClick={() => { if (newText.trim()) addMutation.mutate(newText.trim()); }}
            disabled={!newText.trim() || addMutation.isPending}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setNewText(''); }}
            className="text-xs px-2 py-1.5 rounded-lg"
            style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
          >
            ✕
          </button>
        </div>
      )}

      {active.length === 0 && !adding && (
        <p className="text-xs" style={{ color: 'var(--text3)' }}>No active blockers</p>
      )}

      {resolved.length > 0 && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>
            Resolution History
          </p>
          <div className="flex flex-col gap-3">
            {resolved.map((b) => (
              <div
                key={b.id}
                className="rounded-lg px-3 py-2"
                style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
              >
                <p className="text-sm" style={{ color: 'var(--text)' }}>{b.description}</p>
                {b.resolution_note && (
                  <p className="text-sm mt-1">
                    Resolved: {b.resolution_note}
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                  {[
                    b.resolved_at ? formatUtcDateTime(b.resolved_at) : null,
                    b.resolved_by_username ? `by ${b.resolved_by_username}` : null,
                  ].filter(Boolean).join(' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
