import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, DropResult } from '@hello-pangea/dnd';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDateOnly, formatUtcDateTime, isDateOnlyPast } from '../lib/dates';
import KanbanColumn from '../components/KanbanColumn';
import TaskCard from '../components/TaskCard';
import BlockerBox from '../components/BlockerBox';
import AttachmentsSection from '../components/AttachmentsSection';
import RichTextEditor from '../components/RichTextEditor';
import RichTextRenderer from '../components/RichTextRenderer';
import { useDirtyGuard } from '../lib/useDirtyGuard';

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string;
}

interface TaskAssigneeInfo {
  user_id: string;
  username: string;
  display_name: string | null;
}

interface Task {
  id: string;
  title: string;
  stage: string;
  description?: string;
  blocker_count?: number;
  assignees?: TaskAssigneeInfo[];
  assignee_user_id?: string | null;
  assignee_username?: string | null;
  assignee_display_name?: string | null;
  qa_user_id?: string | null;
  qa_username?: string | null;
  qa_display_name?: string | null;
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

interface ProjectMember {
  id: string;
  user_id: string;
  task_access: string;
  username: string;
  display_name: string | null;
  user_role: string;
}

interface SimpleUser {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
}

interface Project {
  id: string;
  title: string;
  description?: string;
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

function formatTimeline(startDate?: string, dueDate?: string) {
  if (startDate && dueDate) {
    if (startDate === dueDate) return formatDateOnly(dueDate);
    return `${formatDateOnly(startDate)} - ${formatDateOnly(dueDate)}`;
  }
  if (startDate) return `Starts ${formatDateOnly(startDate)}`;
  if (dueDate) return `Due ${formatDateOnly(dueDate)}`;
  return 'No dates set';
}

export function formatActivityAction(action: string) {
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

// ── Avatar colors for member circles ──────────────────────────────────────────
const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#06b6d4',
];
function avatarColor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Members Dropdown (avatar cluster trigger) ────────────────────────────────
function MembersDropdown({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [addAccess, setAddAccess] = useState('all');
  const ref = useRef<HTMLDivElement>(null);

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/projects/${projectId}/members`),
    enabled: canManage,
  });

  const { data: allUsers = [] } = useQuery<SimpleUser[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
    enabled: canManage && user?.role === 'admin',
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['project-members', projectId] });

  const addMutation = useMutation({
    mutationFn: (body: { userId: string; taskAccess: string }) =>
      api.post(`/projects/${projectId}/members`, body),
    onSuccess: () => { setSearch(''); invalidate(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ memberId, taskAccess }: { memberId: string; taskAccess: string }) =>
      api.put(`/projects/${projectId}/members/${memberId}`, { taskAccess }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/projects/${projectId}/members/${memberId}`),
    onSuccess: invalidate,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!canManage) return null;

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = allUsers
    .filter((u) => !memberUserIds.has(u.id))
    .filter((u) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (u.display_name ?? '').toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });

  const MAX_SHOW = 4;
  const visible = members.slice(0, MAX_SHOW);
  const overflow = members.length - MAX_SHOW;

  return (
    <div className="relative" ref={ref}>
      {/* Avatar cluster trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center -space-x-2 cursor-pointer px-1 py-1 rounded-lg transition-colors hover:bg-[var(--surface2)]"
        title={members.length ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Manage members'}
      >
        {visible.length > 0 ? (
          <>
            {visible.map((m) => (
              <div
                key={m.id}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-[var(--surface)]"
                style={{ background: avatarColor(m.user_id), color: '#fff' }}
                title={m.display_name || m.username}
              >
                {(m.display_name ?? m.username)[0].toUpperCase()}
              </div>
            ))}
            {overflow > 0 && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-[var(--surface)]"
                style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
              >
                +{overflow}
              </div>
            )}
          </>
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm ring-2 ring-[var(--surface)]"
            style={{ background: 'var(--surface3)', color: 'var(--text3)', border: '2px dashed var(--border2)' }}
          >
            +
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-xl z-40 flex flex-col overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}
        >
          {/* Header */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Team ({members.length})
            </p>
            <button onClick={() => setOpen(false)} className="text-sm" style={{ color: 'var(--text3)' }}>&times;</button>
          </div>

          {/* Member list */}
          <div className="max-h-60 overflow-y-auto px-2 pb-2">
            {members.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text3)' }}>No members yet</p>
            )}
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--surface2)] transition-colors group"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ background: avatarColor(m.user_id), color: '#fff' }}
                >
                  {(m.display_name ?? m.username)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight" style={{ color: 'var(--text)' }}>
                    {m.display_name || m.username}
                  </p>
                  <p className="text-[11px] leading-tight" style={{ color: 'var(--text3)' }}>{m.user_role}</p>
                </div>
                <select
                  value={m.task_access}
                  onChange={(e) => updateMutation.mutate({ memberId: m.id, taskAccess: e.target.value })}
                  className="text-[11px] px-1.5 py-0.5 rounded bg-transparent opacity-70 group-hover:opacity-100"
                  style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}
                >
                  <option value="all">All tasks</option>
                  <option value="assigned">Assigned only</option>
                </select>
                <button
                  onClick={() => removeMutation.mutate(m.id)}
                  className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity px-1"
                  style={{ color: 'var(--danger)' }}
                  title="Remove member"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          {/* Add member search */}
          {user?.role === 'admin' && (
            <div
              className="px-3 py-3 flex flex-col gap-2"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users to add..."
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                autoFocus
              />
              {search.trim() && availableUsers.length === 0 && (
                <p className="text-xs px-1" style={{ color: 'var(--text3)' }}>No matching users</p>
              )}
              {availableUsers.slice(0, 5).map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface2)] cursor-pointer transition-colors"
                  onClick={() => addMutation.mutate({ userId: u.id, taskAccess: addAccess })}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: avatarColor(u.id), color: '#fff' }}
                  >
                    {(u.display_name ?? u.username)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{u.display_name || u.username}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{u.role}</p>
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--accent)' }}>+ Add</span>
                </div>
              ))}
              {availableUsers.length > 0 && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[11px]" style={{ color: 'var(--text3)' }}>Access:</span>
                  <select
                    value={addAccess}
                    onChange={(e) => setAddAccess(e.target.value)}
                    className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                  >
                    <option value="all">All tasks</option>
                    <option value="assigned">Assigned only</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Task Assignee (single) ───────────────────────────────────────────────────
function TaskAssignee({ projectId, task, onUpdate }: { projectId: string; task: Task; onUpdate: () => void }) {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'member';

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/projects/${projectId}/members`),
    enabled: canManage,
  });

  const { data: publicSettings } = useQuery<Record<string, string>>({
    queryKey: ['settings-public'],
    queryFn: () => api.get('/settings/public'),
  });

  const qaBlocked = publicSettings?.qa_self_assign_blocked === 'true';

  const setAssigneeMutation = useMutation({
    mutationFn: (assigneeUserId: string | null) =>
      api.put(`/projects/${projectId}/tasks/${task.id}`, { assignee_user_id: assigneeUserId }),
    onSuccess: onUpdate,
  });

  const assigneeName = task.assignee_display_name || task.assignee_username;

  // When self-QA is blocked, filter out the QA user from assignee options
  const assigneeOptions = members.filter((m) => {
    if (m.user_id === task.assignee_user_id) return false;
    if (qaBlocked && task.qa_user_id && m.user_id === task.qa_user_id) return false;
    return true;
  });

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Assignee</p>
      <div className="flex items-center gap-2">
        {task.assignee_user_id && assigneeName ? (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
            style={{ background: 'var(--surface2)' }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: avatarColor(task.assignee_user_id), color: '#fff' }}
            >
              {assigneeName[0].toUpperCase()}
            </div>
            <span style={{ color: 'var(--text)' }}>{assigneeName}</span>
            {canManage && (
              <button
                onClick={() => setAssigneeMutation.mutate(null)}
                className="ml-1"
                style={{ color: 'var(--text3)' }}
              >
                &times;
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text3)' }}>Unassigned</span>
        )}
        {canManage && (
          <select
            value={task.assignee_user_id ?? ''}
            onChange={(e) => setAssigneeMutation.mutate(e.target.value || null)}
            className="text-xs px-2 py-1.5 rounded-lg"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <option value="">
              {task.assignee_user_id ? 'Change...' : 'Assign...'}
            </option>
            {assigneeOptions.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.username}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ── QA Assignee ──────────────────────────────────────────────────────────────
function QaAssignee({ projectId, task, onUpdate }: { projectId: string; task: Task; onUpdate: () => void }) {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'member';

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/projects/${projectId}/members`),
    enabled: canManage,
  });

  const { data: publicSettings } = useQuery<Record<string, string>>({
    queryKey: ['settings-public'],
    queryFn: () => api.get('/settings/public'),
  });

  const qaBlocked = publicSettings?.qa_self_assign_blocked === 'true';

  const setQaMutation = useMutation({
    mutationFn: (qaUserId: string | null) =>
      api.put(`/projects/${projectId}/tasks/${task.id}`, { qa_user_id: qaUserId }),
    onSuccess: onUpdate,
  });

  const qaName = task.qa_display_name || task.qa_username;

  // When self-QA is blocked, filter out the task's assignee from QA options
  const assigneeId = task.assignees?.[0]?.user_id;
  const qaOptions = members.filter((m) => {
    if (m.user_id === task.qa_user_id) return false;
    if (qaBlocked && assigneeId && m.user_id === assigneeId) return false;
    return true;
  });

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>QA Assignee</p>
      <div className="flex items-center gap-2">
        {task.qa_user_id && qaName ? (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
            style={{ background: 'var(--surface2)' }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: avatarColor(task.qa_user_id), color: '#fff' }}
            >
              {qaName[0].toUpperCase()}
            </div>
            <span style={{ color: 'var(--text)' }}>{qaName}</span>
            {canManage && (
              <button
                onClick={() => setQaMutation.mutate(null)}
                className="ml-1"
                style={{ color: 'var(--text3)' }}
              >
                &times;
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text3)' }}>None</span>
        )}
        {canManage && (
          <select
            value={task.qa_user_id ?? ''}
            onChange={(e) => setQaMutation.mutate(e.target.value || null)}
            className="text-xs px-2 py-1.5 rounded-lg"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <option value="">
              {task.qa_user_id ? 'Change QA...' : 'Set QA...'}
            </option>
            {qaOptions.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.username}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
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
  const [originalDesc, setOriginalDesc] = useState(task.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = editing && editDesc !== originalDesc;
  useDirtyGuard(isDirty);

  function handleCancelEdit() {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      setEditing(false);
      setEditTitle(task.title);
      setEditDesc(task.description ?? '');
    }
  }

  function handleClose() {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  function confirmDiscardAndClose() {
    setEditing(false);
    setEditTitle(task.title);
    setEditDesc(task.description ?? '');
    setConfirmDiscard(false);
    onClose();
  }

  function confirmDiscardEdit() {
    setEditing(false);
    setEditTitle(task.title);
    setEditDesc(task.description ?? '');
    setConfirmDiscard(false);
  }

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
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
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
            {!editing && !confirmDiscard && (
              <button
                onClick={() => { setEditing(true); setOriginalDesc(task.description ?? ''); setConfirmDelete(false); setConfirmDiscard(false); }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              >
                Edit
              </button>
            )}
            {!confirmDiscard && (
              !confirmDelete ? (
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
            ))}
            <button onClick={handleClose} className="text-lg" style={{ color: 'var(--text3)' }}>✕</button>
          </div>
        </div>

        {/* Discard confirmation */}
        {confirmDiscard && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
              You have unsaved changes. Discard them?
            </span>
            <button
              onClick={() => (editing ? confirmDiscardEdit() : confirmDiscardAndClose())}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--danger)', color: '#fff' }}
            >
              Discard
            </button>
            <button
              onClick={() => setConfirmDiscard(false)}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Keep Editing
            </button>
          </div>
        )}

        {/* Edit form */}
        {editing && !confirmDiscard && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Description</label>
              <RichTextEditor
                content={editDesc}
                onChange={setEditDesc}
                placeholder="Add a description…"
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
                onClick={handleCancelEdit}
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
            <RichTextRenderer html={task.description} />
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

        {/* Task assignee */}
        <TaskAssignee projectId={projectId} task={task} onUpdate={invalidate} />

        {/* QA assignee */}
        <QaAssignee projectId={projectId} task={task} onUpdate={invalidate} />

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

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [timelineForm, setTimelineForm] = useState({ start_date: '', due_date: '' });
  const [filterMembers, setFilterMembers] = useState<Set<string>>(new Set());
  const [editingProjectDesc, setEditingProjectDesc] = useState(false);
  const [projectDescEdit, setProjectDescEdit] = useState('');
  const [projectDescOriginal, setProjectDescOriginal] = useState('');
  const [projectDescConfirmDiscard, setProjectDescConfirmDiscard] = useState(false);

  const isProjectDescDirty = editingProjectDesc && projectDescEdit !== projectDescOriginal;
  useDirtyGuard(isProjectDescDirty);

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

  const { showToast } = useToast();

  const stageMutation = useMutation({
    mutationFn: (stage: string) => api.put(`/projects/${projectId}`, { stage }),
    onSuccess: invalidate,
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const timelineMutation = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}`, {
      start_date: timelineForm.start_date || null,
      due_date: timelineForm.due_date || null,
    }),
    onSuccess: invalidate,
  });

  const projectDescMutation = useMutation({
    mutationFn: (description: string) =>
      api.put(`/projects/${projectId}`, { description: description || null }),
    onSuccess: () => {
      setEditingProjectDesc(false);
      invalidate();
    },
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

  // Collect unique assignees across all tasks for the filter bar
  const allAssignees = (() => {
    const seen = new Map<string, TaskAssigneeInfo>();
    for (const t of tasks) {
      for (const a of t.assignees ?? []) {
        if (!seen.has(a.user_id)) seen.set(a.user_id, a);
      }
    }
    return Array.from(seen.values());
  })();

  function toggleMemberFilter(userId: string) {
    setFilterMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // Apply member filter
  const filteredTasks = filterMembers.size === 0
    ? tasks
    : tasks.filter((t) =>
        (t.assignees ?? []).some((a) => filterMembers.has(a.user_id))
      );

  const tasksByStage = TASK_STAGES.reduce<Record<string, Task[]>>((acc, s) => {
    acc[s.key] = filteredTasks.filter((t) => t.stage === s.key);
    return acc;
  }, {});

  function onTaskDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    moveTaskMutation.mutate({ taskId: draggableId, stage: destination.droppableId });
  }

  const overdue = isDateOnlyPast(project.due_date);
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
          <div className="flex items-center gap-3 shrink-0">
            {projectId && <MembersDropdown projectId={projectId} />}
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

        {/* Project description */}
        <div className="mb-4">
          {projectDescConfirmDiscard && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3"
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                You have unsaved changes. Discard them?
              </span>
              <button
                onClick={() => {
                  setEditingProjectDesc(false);
                  setProjectDescEdit(projectDescOriginal);
                  setProjectDescConfirmDiscard(false);
                }}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'var(--danger)', color: '#fff' }}
              >
                Discard
              </button>
              <button
                onClick={() => setProjectDescConfirmDiscard(false)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              >
                Keep Editing
              </button>
            </div>
          )}
          {editingProjectDesc && !projectDescConfirmDiscard ? (
            <div className="flex flex-col gap-2">
              <RichTextEditor
                content={projectDescEdit}
                onChange={setProjectDescEdit}
                placeholder="Add a project description…"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => projectDescMutation.mutate(projectDescEdit)}
                  disabled={projectDescMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {projectDescMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    if (isProjectDescDirty) {
                      setProjectDescConfirmDiscard(true);
                    } else {
                      setEditingProjectDesc(false);
                      setProjectDescEdit(project.description ?? '');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            !projectDescConfirmDiscard && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>Description</p>
                  <button
                    onClick={() => {
                      setProjectDescEdit(project.description ?? '');
                      setProjectDescOriginal(project.description ?? '');
                      setEditingProjectDesc(true);
                    }}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                  >
                    {project.description ? 'Edit' : '+ Add'}
                  </button>
                </div>
                {project.description ? (
                  <RichTextRenderer html={project.description} />
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>No description</p>
                )}
              </div>
            )
          )}
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
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Tasks</h2>

        {/* Member filter bar */}
        {allAssignees.length > 0 && (
          <div className="flex items-center gap-1">
            {allAssignees.map((a) => {
              const active = filterMembers.has(a.user_id);
              return (
                <button
                  key={a.user_id}
                  onClick={() => toggleMemberFilter(a.user_id)}
                  title={a.display_name || a.username}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: avatarColor(a.user_id),
                    color: '#fff',
                    opacity: filterMembers.size === 0 || active ? 1 : 0.35,
                    outline: active ? '2px solid var(--accent)' : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                >
                  {(a.display_name ?? a.username)[0].toUpperCase()}
                </button>
              );
            })}
            {filterMembers.size > 0 && (
              <button
                onClick={() => setFilterMembers(new Set())}
                className="ml-1 text-xs px-2 py-1 rounded-lg"
                style={{ color: 'var(--text3)', background: 'var(--surface2)' }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {filterMembers.size > 0 && (
          <span className="text-xs" style={{ color: 'var(--text3)' }}>
            Showing {filteredTasks.length} of {tasks.length} tasks
          </span>
        )}
      </div>
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
                        onClick={() => setSelectedTaskId(task.id)}
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
                  {formatUtcDateTime(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Modal Overlay */}
      {selectedTaskId && projectId && (() => {
        const currentTask = tasks.find((t) => t.id === selectedTaskId);
        if (!currentTask) return null;
        return (
          <TaskModalOverlay
            task={currentTask}
            projectId={projectId}
            onClose={() => setSelectedTaskId(null)}
          />
        );
      })()}
    </div>
  );
}
