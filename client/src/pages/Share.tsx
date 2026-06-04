import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { formatDateOnly, getClientTimeZone } from '../lib/dates';

interface Task {
  id: number;
  title: string;
  stage: string;
}

interface SharedProject {
  id: number;
  title: string;
  stage: string;
  start_date?: string;
  due_date?: string;
  customer_name?: string;
  tasks?: Task[];
  tasks_done?: number;
  tasks_total?: number;
}

const TASK_STAGES = [
  { key: 'todo', label: 'To Do', color: '#8b5cf6' },
  { key: 'inprogress', label: 'In Progress', color: '#3b82f6' },
  { key: 'blocked', label: 'Blocked', color: '#f87171' },
  { key: 'done', label: 'Done', color: '#34d399' },
];

const STAGE_LABELS: Record<string, string> = {
  scoping: 'Scoping',
  quoted: 'Quoted',
  inprogress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

function formatTimeline(startDate?: string, dueDate?: string) {
  if (startDate && dueDate) {
    if (startDate === dueDate) return formatDateOnly(dueDate, { month: 'long', day: 'numeric', year: 'numeric' });
    return `${formatDateOnly(startDate, { month: 'long', day: 'numeric', year: 'numeric' })} - ${formatDateOnly(dueDate, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }
  if (startDate) return `Starts ${formatDateOnly(startDate, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  if (dueDate) return `Due ${formatDateOnly(dueDate, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  return null;
}

function ShareContent() {
  const { token } = useParams<{ token: string }>();

  const { data: project, isLoading, error } = useQuery<SharedProject>({
    queryKey: ['share', token],
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}`, {
        headers: { 'X-Client-Timezone': getClientTimeZone() },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('not_found');
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json() as Promise<SharedProject>;
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text2)' }}>Loading…</p>
      </div>
    );
  }

  if (error || !project) {
    const msg = error instanceof Error && error.message === 'not_found'
      ? 'This share link is invalid or has expired.'
      : 'Failed to load project.';
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-4"
        style={{ background: 'var(--bg)' }}
      >
        <p className="text-4xl">404</p>
        <p className="text-lg" style={{ color: 'var(--text2)' }}>{msg}</p>
      </div>
    );
  }

  const tasks = project.tasks ?? [];
  const tasksByStage = TASK_STAGES.reduce<Record<string, Task[]>>((acc, s) => {
    acc[s.key] = tasks.filter((t) => t.stage === s.key);
    return acc;
  }, {});

  const done = project.tasks_done ?? tasks.filter((t) => t.stage === 'done').length;
  const total = project.tasks_total ?? tasks.length;
  const timeline = formatTimeline(project.start_date, project.due_date);

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg)' }}>
      {/* Kanboard branding */}
      <div className="flex items-center gap-2 mb-8">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          K
        </div>
        <span className="font-semibold" style={{ color: 'var(--text2)' }}>Mooove</span>
        <span className="ml-2 text-sm" style={{ color: 'var(--text3)' }}>— Shared View</span>
      </div>

      {/* Project header */}
      <div
        className="rounded-2xl p-6 mb-6 max-w-4xl mx-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
          {project.title}
        </h1>

        <div className="flex flex-wrap gap-3 items-center">
          {project.customer_name && (
            <span
              className="text-sm px-3 py-1 rounded-full"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              {project.customer_name}
            </span>
          )}

          <span
            className="text-sm px-3 py-1 rounded-full font-medium"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
          >
            {STAGE_LABELS[project.stage] ?? project.stage}
          </span>

          {timeline && (
            <span
              className="text-sm px-3 py-1 rounded-full"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              {timeline}
            </span>
          )}

          <span className="text-sm" style={{ color: 'var(--text2)' }}>
            {done}/{total} tasks complete
          </span>
        </div>
      </div>

      {/* Task grid */}
      <div className="grid gap-4 max-w-4xl mx-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {TASK_STAGES.map((stage) => (
          <div
            key={stage.key}
            className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                {stage.label}
              </span>
              <span
                className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
              >
                {tasksByStage[stage.key]?.length ?? 0}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {(tasksByStage[stage.key] ?? []).length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text3)' }}>No tasks</p>
              ) : (
                (tasksByStage[stage.key] ?? []).map((task) => (
                  <div
                    key={task.id}
                    className="text-sm px-3 py-2 rounded-lg"
                    style={{
                      background: 'var(--surface2)',
                      color: 'var(--text)',
                      textDecoration: task.stage === 'done' ? 'line-through' : 'none',
                      opacity: task.stage === 'done' ? 0.6 : 1,
                    }}
                  >
                    {task.title}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Independent QueryClientProvider so Share page works without auth
const shareQueryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
});

export default function Share() {
  return (
    <QueryClientProvider client={shareQueryClient}>
      <ShareContent />
    </QueryClientProvider>
  );
}
