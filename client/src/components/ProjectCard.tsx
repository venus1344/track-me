import { useNavigate } from 'react-router-dom';

interface Project {
  id: string;
  title: string;
  stage: string;
  due_date?: string;
  customer_name?: string;
  customer_color?: string;
  tasks_total?: number;
  tasks_done?: number;
  active_blockers?: number;
  blocker_count?: number;
}

function customerColor(color?: string) {
  return color ?? '#6366f1';
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface ProgressRingProps {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
}

function ProgressRing({ pct, size = 36, stroke = 3, color = 'var(--accent)' }: ProgressRingProps) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const center = size / 2;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="var(--surface3)"
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  const total = project.tasks_total ?? 0;
  const done = project.tasks_done ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue = isOverdue(project.due_date);
  const hasBlockers = (project.active_blockers ?? project.blocker_count ?? 0) > 0;
  const blockerCount = project.active_blockers ?? project.blocker_count ?? 0;

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className="rounded-xl p-4 cursor-pointer transition-all hover:brightness-110 active:scale-[0.99]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* ID + customer */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
          PRJ-{project.id}
        </span>
        {project.customer_name && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: `${customerColor(project.customer_color)}22`,
              color: customerColor(project.customer_color),
            }}
          >
            {project.customer_name}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="font-semibold text-sm leading-snug mb-3" style={{ color: 'var(--text)' }}>
        {project.title}
      </p>

      {/* Due date */}
      {project.due_date && (
        <div className="mb-3">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: overdue ? 'var(--danger-bg)' : 'var(--surface2)',
              color: overdue ? 'var(--danger)' : 'var(--text2)',
            }}
          >
            {overdue ? '⚠ ' : ''}Due {formatDate(project.due_date)}
          </span>
        </div>
      )}

      {/* Progress + ring */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: 'var(--text2)' }}>
            {done}/{total} tasks
          </span>
          {hasBlockers && (
            <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
              {blockerCount} blocker{blockerCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ProgressRing
          pct={pct}
          color={pct === 100 ? 'var(--success)' : hasBlockers ? 'var(--danger)' : 'var(--accent)'}
        />
      </div>
    </div>
  );
}
