import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Blocker {
  id: string;
  description: string;
  resolved: boolean;
  created_at: string;
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
    mutationFn: (blockerId: string) =>
      api.put(`/projects/${projectId}/blockers/${blockerId}`, { resolved: 1 }),
    onSuccess: invalidate,
  });

  const active = (blockers ?? []).filter((b) => !b.resolved);

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
              className="flex items-start gap-2 text-sm"
              style={{ color: 'var(--danger)' }}
            >
              <span className="mt-0.5 shrink-0">✕</span>
              <span className="flex-1">{b.description}</span>
              <button
                onClick={() => resolveMutation.mutate(b.id)}
                className="text-xs px-2 py-0.5 rounded-lg shrink-0"
                style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                disabled={resolveMutation.isPending}
              >
                Resolve
              </button>
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
    </div>
  );
}
