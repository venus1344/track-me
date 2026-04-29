import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Draggable, DropResult } from '@hello-pangea/dnd';
import { api } from '../lib/api';
import KanbanColumn from '../components/KanbanColumn';
import ProjectCard from '../components/ProjectCard';

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
}

const STAGES: Array<{ key: string; label: string; color: string }> = [
  { key: 'scoping',    label: 'Scoping',     color: '#8b5cf6' },
  { key: 'quoted',     label: 'Quoted',      color: '#f59e0b' },
  { key: 'inprogress', label: 'In Progress', color: '#3b82f6' },
  { key: 'review',     label: 'Review',      color: '#14b8a6' },
  { key: 'blocked',    label: 'Blocked',     color: '#f87171' },
  { key: 'done',       label: 'Done',        color: '#34d399' },
];

interface Customer {
  id: string;
  name: string;
}

export default function Board() {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customerId');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', customer_id: '' });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects', customerId],
    queryFn: () =>
      api.get(`/projects${customerId ? `?customerId=${customerId}` : ''}`),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; customer_id: string }) =>
      api.post('/projects', data),
    onSuccess: (proj: unknown) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      setShowNew(false);
      setForm({ title: '', customer_id: '' });
      const p = proj as Project;
      if (p?.id) navigate(`/projects/${p.id}`);
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.put(`/projects/${id}`, { stage }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // Optimistic grouped view
  const grouped = STAGES.reduce<Record<string, Project[]>>((acc, s) => {
    acc[s.key] = projects.filter((p) => p.stage === s.key);
    return acc;
  }, {});

  const blockedProjects = projects.filter((p) => (p.active_blockers ?? 0) > 0);

  function handleCreate() {
    if (!form.title.trim() || !form.customer_id) return;
    createMutation.mutate({ title: form.title.trim(), customer_id: form.customer_id });
  }

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    moveStageMutation.mutate({ id: draggableId, stage: destination.droppableId });
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Board</h1>
          {customerId && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>Filtered by customer</p>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + New Project
        </button>
      </div>

      {/* Blocker alert strip */}
      {blockedProjects.length > 0 && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          <strong>{blockedProjects.length} project{blockedProjects.length > 1 ? 's' : ''} with active blockers:</strong>{' '}
          {blockedProjects.map((p) => p.title).join(', ')}
        </div>
      )}

      {/* New project form */}
      {showNew && (
        <div
          className="mb-4 p-4 rounded-xl flex items-end gap-3"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}
        >
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs" style={{ color: 'var(--text2)' }}>Project title</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
              placeholder="Project title…"
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text)' }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text2)' }}>Customer *</label>
            <select
              value={form.customer_id}
              onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text)' }}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={!form.title.trim() || !form.customer_id || createMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Create
          </button>
          <button
            onClick={() => setShowNew(false)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface3)', color: 'var(--text2)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Kanban columns */}
      {isLoading ? (
        <p style={{ color: 'var(--text2)' }}>Loading…</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage.key}
                label={stage.label}
                count={grouped[stage.key]?.length ?? 0}
                color={stage.color}
                droppableId={stage.key}
              >
                {(grouped[stage.key] ?? []).map((project, idx) => (
                  <Draggable key={project.id} draggableId={project.id} index={idx}>
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
                        <ProjectCard project={project} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {grouped[stage.key]?.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text3)' }}>
                    No projects
                  </p>
                )}
              </KanbanColumn>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
