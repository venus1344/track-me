import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  color?: string;
  project_count?: number;
  active_blockers?: number;
}

const CUSTOMER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ec4899', '#14b8a6', '#8b5cf6', '#f97316',
];

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
};

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CUSTOMER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-all"
          style={{
            background: c,
            borderColor: value === c ? '#fff' : 'transparent',
            boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
          }}
        />
      ))}
    </div>
  );
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  color: string;
}

const emptyForm: FormState = { name: '', email: '', phone: '', color: '#6366f1' };

export default function Customers() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  const [deleteError, setDeleteError] = useState<{ id: string; msg: string } | null>(null);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers'),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormState) => api.post('/customers', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      setShowCreate(false);
      setCreateForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormState }) =>
      api.put(`/customers/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      setDeleteError(null);
    },
    onError: (err: Error, id: string) => {
      setDeleteError({ id, msg: err.message });
    },
  });

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      color: c.color ?? '#6366f1',
    });
    setDeleteError(null);
  }

  function handleCreate() {
    if (!createForm.name.trim()) return;
    createMutation.mutate({
      ...createForm,
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      phone: createForm.phone.trim(),
    });
  }

  function handleUpdate(id: string) {
    if (!editForm.name.trim()) return;
    updateMutation.mutate({
      id,
      data: {
        ...editForm,
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
      },
    });
  }

  function handleDelete(id: string) {
    setDeleteError(null);
    deleteMutation.mutate(id);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Customers</h1>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + New Customer
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          className="mb-6 p-5 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}
        >
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>New Customer</h2>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Name *</label>
              <input
                autoFocus
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
                placeholder="Acme Corp"
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Email</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="contact@acme.com"
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Phone</label>
              <input
                type="tel"
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555 000 0000"
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text2)' }}>Color</label>
            <ColorPicker value={createForm.color} onChange={(c) => setCreateForm((f) => ({ ...f, color: c }))} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!createForm.name.trim() || createMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Customer'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateForm(emptyForm); }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Customer list */}
      {isLoading ? (
        <p style={{ color: 'var(--text2)' }}>Loading…</p>
      ) : customers.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text2)' }}>No customers yet</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>Click "+ New Customer" to add one</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {customers.map((c) => (
            <div key={c.id}>
              {editingId === c.id ? (
                /* ── Inline edit form ── */
                <div
                  className="p-5 rounded-2xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ background: editForm.color, color: '#fff' }}
                    >
                      {(editForm.name[0] ?? c.name[0]).toUpperCase()}
                    </div>
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>Editing customer</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3 mb-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Name *</label>
                      <input
                        autoFocus
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Phone</label>
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        className="px-3 py-2 rounded-lg text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text2)' }}>Color</label>
                    <ColorPicker value={editForm.color} onChange={(col) => setEditForm((f) => ({ ...f, color: col }))} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(c.id)}
                      disabled={!editForm.name.trim() || updateMutation.isPending}
                      className="px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Customer row ── */
                <div
                  className="flex items-center gap-4 px-5 py-4 rounded-2xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  {/* Color avatar */}
                  <div
                    onClick={() => navigate(`/board?customerId=${c.id}`)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0 cursor-pointer"
                    style={{ background: c.color ?? '#6366f1', color: '#fff' }}
                  >
                    {c.name[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/board?customerId=${c.id}`)}
                  >
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>{c.name}</p>
                    <div className="flex gap-4 mt-0.5">
                      {c.email && (
                        <span className="text-sm truncate" style={{ color: 'var(--text2)' }}>{c.email}</span>
                      )}
                      {c.phone && (
                        <span className="text-sm" style={{ color: 'var(--text2)' }}>{c.phone}</span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 shrink-0">
                    {c.project_count != null && (
                      <div className="text-center min-w-[3rem]">
                        <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{c.project_count}</p>
                        <p className="text-xs" style={{ color: 'var(--text3)' }}>projects</p>
                      </div>
                    )}
                    {(c.active_blockers ?? 0) > 0 && (
                      <div className="text-center min-w-[3rem]">
                        <p className="text-lg font-bold" style={{ color: 'var(--danger)' }}>{c.active_blockers}</p>
                        <p className="text-xs" style={{ color: 'var(--text3)' }}>blockers</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                      disabled={deleteMutation.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Deletion error */}
              {deleteError?.id === c.id && (
                <div
                  className="mt-1 px-4 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                >
                  {deleteError.msg}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
