import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateOnlyShort } from '../lib/dates';

interface Project {
  id: string;
  title: string;
  stage: string;
  start_date?: string;
  due_date?: string;
  customer_name?: string;
  customer_color?: string;
  active_blockers?: number;
}

const STAGE_COLORS: Record<string, string> = {
  scoping: '#8b5cf6',
  quoted: '#f59e0b',
  inprogress: '#3b82f6',
  review: '#14b8a6',
  blocked: '#f87171',
  done: '#34d399',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseLocalDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(currentMonth: Date) {
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function getProjectRange(project: Project) {
  const start = project.start_date ?? project.due_date;
  const end = project.due_date ?? project.start_date;
  if (!start || !end) return null;
  return { start, end };
}

function projectMatchesDay(project: Project, dayKey: string) {
  const range = getProjectRange(project);
  return Boolean(range && range.start <= dayKey && dayKey <= range.end);
}

function projectOverlapsMonth(project: Project, monthStart: string, monthEnd: string) {
  const range = getProjectRange(project);
  return Boolean(range && range.start <= monthEnd && monthStart <= range.end);
}

function formatTimeline(project: Project) {
  if (project.start_date && project.due_date) {
    if (project.start_date === project.due_date) return formatDateOnlyShort(project.due_date);
    return `${formatDateOnlyShort(project.start_date)} - ${formatDateOnlyShort(project.due_date)}`;
  }
  if (project.start_date) return `Starts ${formatDateOnlyShort(project.start_date)}`;
  if (project.due_date) return `Due ${formatDateOnlyShort(project.due_date)}`;
  return 'No schedule';
}

export default function Calendar() {
  const navigate = useNavigate();
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects', 'calendar'],
    queryFn: () => api.get('/projects'),
  });

  const days = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const monthStartKey = toDateKey(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1));
  const monthEndKey = toDateKey(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0));
  const todayKey = toDateKey(new Date());

  const scheduledProjects = projects.filter((project) => getProjectRange(project));
  const visibleProjects = scheduledProjects.filter((project) => projectOverlapsMonth(project, monthStartKey, monthEndKey));
  const unscheduledProjects = projects.filter((project) => !getProjectRange(project));

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Calendar</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>
            Projects appear from start date to due date, or on a single day if only one date is set.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
          >
            ← Prev
          </button>
          <div
            className="px-4 py-2 rounded-lg text-sm font-semibold min-w-[180px] text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {monthLabel(viewMonth)}
          </div>
          <button
            onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="grid gap-4 mb-6 lg:grid-cols-3">
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text2)' }}>Scheduled this month</p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text)' }}>{visibleProjects.length}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text2)' }}>Unscheduled projects</p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text)' }}>{unscheduledProjects.length}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text2)' }}>Blocked on timeline</p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--danger)' }}>
            {visibleProjects.filter((project) => project.stage === 'blocked' || (project.active_blockers ?? 0) > 0).length}
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl p-4 mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="grid grid-cols-7 gap-3 mb-3">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              {label}
            </div>
          ))}
        </div>

        {isLoading ? (
          <p className="p-4 text-sm" style={{ color: 'var(--text2)' }}>Loading calendar…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {days.map((day) => {
              const dayKey = toDateKey(day);
              const dayProjects = visibleProjects.filter((project) => projectMatchesDay(project, dayKey));
              const inMonth = day.getMonth() === viewMonth.getMonth();
              const isToday = dayKey === todayKey;

              return (
                <div
                  key={dayKey}
                  className="min-h-[150px] rounded-xl p-3"
                  style={{
                    background: inMonth ? 'var(--surface2)' : 'var(--surface3)',
                    border: isToday ? '1px solid var(--accent)' : '1px solid var(--border)',
                    opacity: inMonth ? 1 : 0.7,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isToday ? 'var(--accent-text)' : 'var(--text)' }}
                    >
                      {day.getDate()}
                    </span>
                    {dayProjects.length > 0 && (
                      <span className="text-[11px]" style={{ color: 'var(--text3)' }}>
                        {dayProjects.length} project{dayProjects.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {dayProjects.slice(0, 3).map((project) => (
                      <button
                        key={project.id}
                        onClick={() => navigate(`/projects/${project.id}`)}
                        className="w-full text-left rounded-lg px-2.5 py-2 text-xs"
                        style={{
                          background: `${STAGE_COLORS[project.stage] ?? 'var(--accent)'}22`,
                          border: `1px solid ${STAGE_COLORS[project.stage] ?? 'var(--accent)'}`,
                          color: STAGE_COLORS[project.stage] ?? 'var(--accent-text)',
                        }}
                      >
                        <div className="font-semibold truncate">{project.title}</div>
                        <div className="truncate opacity-80">
                          {project.customer_name ?? 'No customer'}
                        </div>
                      </button>
                    ))}
                    {dayProjects.length > 3 && (
                      <span className="text-[11px]" style={{ color: 'var(--text3)' }}>
                        +{dayProjects.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Project timelines this month</h2>
          {visibleProjects.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>No scheduled projects in this month.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleProjects
                .slice()
                .sort((a, b) => (getProjectRange(a)?.start ?? '').localeCompare(getProjectRange(b)?.start ?? ''))
                .map((project) => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="w-full text-left rounded-xl p-4"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{project.title}</p>
                        <p className="text-sm truncate" style={{ color: 'var(--text2)' }}>
                          {project.customer_name ?? 'No customer'}
                        </p>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded-full shrink-0"
                        style={{
                          background: `${STAGE_COLORS[project.stage] ?? 'var(--accent)'}22`,
                          color: STAGE_COLORS[project.stage] ?? 'var(--accent-text)',
                        }}
                      >
                        {project.stage}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span style={{ color: 'var(--text2)' }}>{formatTimeline(project)}</span>
                      {(project.active_blockers ?? 0) > 0 && (
                        <span style={{ color: 'var(--danger)' }}>
                          {project.active_blockers} blocker{project.active_blockers === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Unscheduled</h2>
          {unscheduledProjects.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>Every project has at least one timeline date.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {unscheduledProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="w-full text-left rounded-xl px-3 py-3"
                  style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  <div className="font-medium truncate">{project.title}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>
                    {project.customer_name ?? 'No customer'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
