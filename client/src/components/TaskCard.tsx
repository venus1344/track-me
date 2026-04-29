interface Task {
  id: string;
  title: string;
  stage: string;
  description?: string;
  blocker_count?: number;
  active_blockers?: number;
}

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onDuplicate?: () => void;
}

export default function TaskCard({ task, onClick, onDuplicate }: TaskCardProps) {
  const isDone = task.stage === 'done';
  const blockerCount = task.active_blockers ?? task.blocker_count ?? 0;
  const hasBlockers = blockerCount > 0;

  return (
    <div
      className="rounded-lg p-3 transition-all hover:brightness-110 active:scale-[0.99] group"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: isDone ? 0.6 : 1,
        cursor: 'pointer',
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0" onClick={onClick}>
          <span className="text-xs font-mono block mb-1" style={{ color: 'var(--text3)' }}>
            T-{task.id.slice(0, 8)}
          </span>
          <p
            className="text-sm leading-snug"
            style={{
              color: 'var(--text)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasBlockers && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              {blockerCount} ✕
            </span>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              title="Duplicate task"
              className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded transition-opacity"
              style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
            >
              ⧉
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
