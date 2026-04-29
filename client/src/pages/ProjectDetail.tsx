import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, DropResult } from '@hello-pangea/dnd';
import { api } from '../lib/api';
import KanbanColumn from '../components/KanbanColumn';
import TaskCard from '../components/TaskCard';
import BlockerBox from '../components/BlockerBox';
import AttachmentsSection from '../components/AttachmentsSection';

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string;
}

interface Task {
  id: string;
  title: string;
  stage: string;
  description?: string;
  blocker_count?: number;
}

interface Blocker {
  id: string;
  description: string;
  resolved: boolean;
  created_at: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  details?: string;
  created_at: string;
  user?: { username: string };
}

interface Project {
  id: string;
  title: string;
  stage: string;
  start_date?: string;
  due_date?: string;
  share_token?: string;
  customer?: Customer;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_color?: string;
  blockers?: Blocker[];
  activity?: ActivityEntry[];
}

const PROJECT_STAGES = [
  { key: 'scoping', label: 'Scoping', color: '#8b5cf6' },
  { key: 'quoted', label: 'Quoted', color: '#f59e0b' },
  { key: 'inprogress', label: 'In Progress', color: '#3b82f6' },
  { key: 'review', label: 'Review', color: '#14b8a6' },
  { key: 'blocked', label: 'Blocked', color: '#f87171' },
  { key: 'done', label: 'Done', color: '#34d399' },
];

const TASK_STAGES = [
  { key: 'todo', label: 'To Do', color: '#8b5cf6' },
  { key: 'inprogress', label: 'In Progress', color: '#3b82f6' },
  { key: 'blocked', label: 'Blocked', color: '#f87171' },
  { key: 'done', label: 'Done', color: '#34d399' },
];

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTimeline(startDate?: string, dueDate?: string) {
  if (startDate && dueDate) {
    if (startDate === dueDate) return formatDate(dueDate);
    return `${formatDate(startDate)} - ${formatDate(dueDate)}`;
  }
  if (startDate) return `Starts ${formatDate(startDate)}`;
  if (dueDate) return `Due ${formatDate(dueDate)}`;
  return 'No dates set';
}

function formatActivityAction(action: string) {
  switch (action) {
    case 'blocker_added':
      return 'added a blocker';
    case 'blocker_resolved':
      return 'resolved a blocker';
    case 'blocker_reopened':
      return 'reopened a blocker';
    default:
      return action.replace(/_/g, ' ');
  }
}

// ── Task Modal Overlay ─────────────────────────────────────────────────────────
function TaskModalOverlay({
  task,
  projectId,
  onClose,
}: {
  task: Task;
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [stage, setStage] = useState(task.stage);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
    void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const stageMutation = useMutation({
    mutationFn: (newStage: string) =>
      api.put(`/projects/${projectId}/tasks/${task.id}`, { stage: newStage }),
    onSuccess: (_data, newStage) => { setStage(newStage); invalidate(); },
  });

  const doneMutation = useMutation({
    mutationFn: () =>
      api.put(`/projects/${projectId}/tasks/${task.id}`, { stage: 'done' }),
    onSuccess: () => { setStage('done'); invalidate(); },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put(`/projects/${projectId}/tasks/${task.id}`, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      }),
    onSuccess: () => { setEditing(false); invalidate(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete(`/projects/${projectId}/tasks/${task.id}`),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface2)',
    border: '1px solid var(--border2)',
    color: 'var(--text)',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border2)', maxHeight: '85vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
              T-{task.id.slice(0, 8)}
            </span>
            {editing ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
                className="mt-1 w-full px-2 py-1 rounded-lg text-lg font-bold outline-none"
                style={inputStyle}
              />
            ) : (
              <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{task.title}</h2>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <button
                onClick={() => { setEditing(true); setConfirmDelete(false); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              >
                Edit
              </button>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => { setConfirmDelete(true); setEditing(false); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: 'var(--text2)' }}>Sure?</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-2 py-1 rounded-lg font-semibold"
                  style={{ background: 'var(--danger)', color: '#fff' }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                >
                  No
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-lg" style={{ color: 'var(--text3)' }}>✕</button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Description</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                placeholder="Add a description…"
                className="px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={inputStyle}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!editTitle.trim() || updateMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditTitle(task.title); setEditDesc(task.description ?? ''); }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Description (view mode) */}
        {!editing && task.description && (
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text2)' }}>Description</p>
            <p className="text-sm" style={{ color: 'var(--text)' }}>{task.description}</p>
          </div>
        )}

        {/* Stage selector */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Stage</p>
          <div className="flex flex-wrap gap-2">
            {TASK_STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => stageMutation.mutate(s.key)}
                className="px-3 py-1 rounded-lg text-xs font-medium"
                style={{
                  background: stage === s.key ? s.color : 'var(--surface2)',
                  color: stage === s.key ? '#fff' : 'var(--text2)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task blockers */}
        <BlockerBox projectId={projectId} taskId={task.id} />

        {/* Task attachments */}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          <AttachmentsSection projectId={projectId} taskId={task.id} />
        </div>

        {/* Mark done */}
        {stage !== 'done' ? (
          <button
            onClick={() => doneMutation.mutate()}
            disabled={doneMutation.isPending}
            className="py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--success)', color: '#fff' }}
          >
            Mark Done
          </button>
        ) : (
          <div
            className="py-2.5 rounded-lg text-sm font-semibold text-center"
            style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
          >
            ✓ Completed
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [timelineForm, setTimelineForm] = useState({ start_date: '', due_date: '' });

  const { data: project, isLoading, error } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.get(`/projects/${projectId}/tasks`),
    enabled: !!projectId,
  });

  const { data: activity = [] } = useQuery<ActivityEntry[]>({
    queryKey: ['project-activity', projectId],
    queryFn: () => api.get(`/projects/${projectId}/activity`),
    enabled: !!projectId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
    void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    void qc.invalidateQueries({ queryKey: ['project-activity', projectId] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const moveTaskMutation = useMutation({
    mutationFn: ({ taskId, stage }: { taskId: string; stage: string }) =>
      api.put(`/projects/${projectId}/tasks/${taskId}`, { stage }),
    onSuccess: invalidate,
  });

  const duplicateTaskMutation = useMutation({
    mutationFn: (task: Task) =>
      api.post(`/projects/${projectId}/tasks`, {
        title: `${task.title} (copy)`,
        description: task.description,
        stage: task.stage,
      }),
    onSuccess: invalidate,
  });

  const stageMutation = useMutation({
    mutationFn: (stage: string) => api.put(`/projects/${projectId}`, { stage }),
    onSuccess: invalidate,
  });

  const timelineMutation = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}`, {
      start_date: timelineForm.start_date || null,
      due_date: timelineForm.due_date || null,
    }),
    onSuccess: invalidate,
  });

  const notifyMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/notify-pa`),
  });

  const addTaskMutation = useMutation({
    mutationFn: ({ title, stage }: { title: string; stage: string }) =>
      api.post(`/projects/${projectId}/tasks`, { title, stage }),
    onSuccess: (_data, { stage }) => {
      setNewTaskText((prev) => ({ ...prev, [stage]: '' }));
      invalidate();
    },
  });

  useEffect(() => {
    setTimelineForm({
      start_date: project?.start_date ?? '',
      due_date: project?.due_date ?? '',
    });
  }, [project?.start_date, project?.due_date]);


  function handleAddTask(stage: string) {
    const title = (newTaskText[stage] ?? '').trim();
    if (!title) return;
    addTaskMutation.mutate({ title, stage });
  }

  function copyShareLink() {
    if (!project || !projectId) return;
    const shareToken = (project as Project & { share_token?: string }).share_token;
    if (shareToken) {
      void navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
    } else {
      void navigator.clipboard.writeText(`${window.location.origin}/projects/${projectId}`);
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p style={{ color: 'var(--text2)' }}>Loading project…</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8">
        <p style={{ color: 'var(--danger)' }}>Project not found.</p>
        <button onClick={() => navigate('/board')} className="mt-4 text-sm" style={{ color: 'var(--accent)' }}>
          ← Back to Board
        </button>
      </div>
    );
  }

  const tasksByStage = TASK_STAGES.reduce<Record<string, Task[]>>((acc, s) => {
    acc[s.key] = tasks.filter((t) => t.stage === s.key);
    return acc;
  }, {});

  function onTaskDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    moveTaskMutation.mutate({ taskId: draggableId, stage: destination.droppableId });
  }

  const overdue = isOverdue(project.due_date);
  const currentStage = PROJECT_STAGES.find((s) => s.key === project.stage);
  const timelineInvalid = Boolean(timelineForm.start_date && timelineForm.due_date && timelineForm.start_date > timelineForm.due_date);

  return (
    <div className="p-6">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: 'var(--text2)' }}>
        <button onClick={() => navigate('/board')} style={{ color: 'var(--accent)' }}>
          ← Board
        </button>
        <span>/</span>
        <span style={{ color: 'var(--text3)' }}>{project.title}</span>
      </div>

      {/* Project header */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-wrap items-start gap-4 mb-4">
          <div className="flex-1 min-w-0">
            {/* <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>PRJ-{project.id}</span> */}
            <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{project.title}</h1>
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => notifyMutation.mutate()}
              disabled={notifyMutation.isPending}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              {notifyMutation.isPending ? 'Notifying…' : 'Notify PA'}
            </button>
            <button
              onClick={copyShareLink}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              Copy Share Link
            </button>
          </div>
        </div>

        {/* Customer strip */}
        {project.customer_name && (
          <div
            className="flex items-center gap-4 px-4 py-3 rounded-xl mb-4 flex-wrap"
            style={{ background: 'var(--surface2)' }}
          >
            <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              {project.customer_name}
            </span>
            {project.customer_email && (
              <span className="text-sm" style={{ color: 'var(--text2)' }}>
                {project.customer_email}
              </span>
            )}
            {project.customer_phone && (
              <span className="text-sm" style={{ color: 'var(--text2)' }}>
                {project.customer_phone}
              </span>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className="text-xs px-3 py-1 rounded-full"
              style={{
                background: overdue ? 'var(--danger-bg)' : 'var(--surface2)',
                color: overdue ? 'var(--danger)' : 'var(--text2)',
              }}
            >
              {overdue ? '⚠ ' : ''}{formatTimeline(project.start_date, project.due_date)}
            </span>
          </div>

          <div
            className="rounded-xl p-4 flex flex-wrap items-end gap-3"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Start date</label>
              <input
                type="date"
                value={timelineForm.start_date}
                onChange={(e) => setTimelineForm((prev) => ({ ...prev, start_date: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Due date</label>
              <input
                type="date"
                value={timelineForm.due_date}
                onChange={(e) => setTimelineForm((prev) => ({ ...prev, due_date: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              />
            </div>
            <button
              onClick={() => timelineMutation.mutate()}
              disabled={timelineInvalid || timelineMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {timelineMutation.isPending ? 'Saving…' : 'Save Timeline'}
            </button>
            <button
              onClick={() => setTimelineForm({ start_date: '', due_date: '' })}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
            >
              Clear
            </button>
            {timelineInvalid && (
              <p className="basis-full text-xs" style={{ color: 'var(--danger)' }}>
                Start date must be on or before due date.
              </p>
            )}
          </div>
        </div>

        {/* Stage selector */}
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Stage</p>
          <div className="flex flex-wrap gap-2">
            {PROJECT_STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => stageMutation.mutate(s.key)}
                disabled={stageMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: project.stage === s.key ? s.color : 'var(--surface2)',
                  color: project.stage === s.key ? '#fff' : 'var(--text2)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          {currentStage && (
            <p className="text-xs mt-2" style={{ color: 'var(--text3)' }}>
              Current: <span style={{ color: currentStage.color }}>{currentStage.label}</span>
            </p>
          )}
        </div>

        {/* Project blockers */}
        <BlockerBox projectId={projectId} blockers={project.blockers} />
      </div>

      {/* Task Kanban */}
      <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>Tasks</h2>
      <DragDropContext onDragEnd={onTaskDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 mb-8">
          {TASK_STAGES.map((stage) => (
            <KanbanColumn
              key={stage.key}
              label={stage.label}
              count={tasksByStage[stage.key]?.length ?? 0}
              color={stage.color}
              droppableId={stage.key}
            >
              {(tasksByStage[stage.key] ?? []).map((task, idx) => (
                <Draggable key={task.id} draggableId={task.id} index={idx}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? 0.85 : 1,
                      }}
                    >
                      <TaskCard
                        task={task}
                        onClick={() => setSelectedTask(task)}
                        onDuplicate={() => duplicateTaskMutation.mutate(task)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {/* Add task input — not draggable, sits below */}
              <div className="mt-1">
                <input
                  value={newTaskText[stage.key] ?? ''}
                  onChange={(e) =>
                    setNewTaskText((prev) => ({ ...prev, [stage.key]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTask(stage.key);
                  }}
                  placeholder="+ Add task…"
                  className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                  style={{
                    background: 'var(--surface3)',
                    color: 'var(--text2)',
                    border: '1px solid transparent',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1px solid var(--border2)';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1px solid transparent';
                    e.currentTarget.style.background = 'var(--surface3)';
                  }}
                />
              </div>
            </KanbanColumn>
          ))}
        </div>
      </DragDropContext>

      {/* Attachments */}
      {projectId && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <AttachmentsSection projectId={projectId} />
        </div>
      )}

      {/* Activity feed */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text3)' }}>No activity yet</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}
                >
                  {(a.user?.username ?? 'S')[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <span style={{ color: 'var(--text)' }}>
                    <strong>{a.user?.username ?? 'System'}</strong> {formatActivityAction(a.action)}
                  </span>
                  {a.details && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{a.details}</p>
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

      {/* Task Modal Overlay */}
      {selectedTask && projectId && (
        <TaskModalOverlay
          task={selectedTask}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
