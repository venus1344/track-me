import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface UserRow {
  id: string;
  username: string;
  role: string;
  email: string | null;
  display_name: string | null;
  active: number;
  created_at: string;
}

const ROLES = ['admin', 'manager', 'member', 'viewer'];

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    admin: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
    manager: { bg: 'var(--accent-bg)', color: 'var(--accent-text)' },
    member: { bg: 'var(--success-bg)', color: 'var(--success)' },
    viewer: { bg: 'var(--surface3)', color: 'var(--text2)' },
  };
  const s = styles[role] ?? styles.viewer;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {role}
    </span>
  );
}

export default function Users() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'member', email: '', display_name: '' });
  const [editForm, setEditForm] = useState({ role: '', email: '', display_name: '' });
  const [error, setError] = useState('');

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
    enabled: user?.role === 'admin',
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/users', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setForm({ username: '', password: '', role: 'member', email: '', display_name: '' });
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof editForm }) => api.put(`/users/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      setEditId(null);
      setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/users/${id}`, { active: 1 }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const resetPwMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => setError(''),
    onError: (err: Error) => setError(err.message),
  });

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEditForm({ role: u.role, email: u.email ?? '', display_name: u.display_name ?? '' });
  }

  if (user?.role !== 'admin') {
    return (
      <div className="p-6">
        <div
          className="text-center py-16 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-lg font-medium" style={{ color: 'var(--text2)' }}>Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Users</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          + New User
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Create User
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
            <input
              type="text"
              placeholder="Display name"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setError(''); }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: 'var(--text2)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <p style={{ color: 'var(--text2)' }}>Loading...</p>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text3)' }}>User</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text3)' }}>Email</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text3)' }}>Role</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text3)' }}>Status</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text3)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: u.active ? 1 : 0.5 }}>
                  <td className="px-4 py-3">
                    {editId === u.id ? (
                      <input
                        type="text"
                        value={editForm.display_name}
                        onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                        className="px-2 py-1 rounded text-sm w-full"
                        style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      />
                    ) : (
                      <div>
                        <p style={{ color: 'var(--text)' }}>{u.display_name || u.username}</p>
                        {u.display_name && (
                          <p className="text-xs" style={{ color: 'var(--text3)' }}>@{u.username}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>
                    {editId === u.id ? (
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        className="px-2 py-1 rounded text-sm w-full"
                        style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      />
                    ) : (
                      u.email || '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editId === u.id ? (
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className="px-2 py-1 rounded text-sm"
                        style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: u.active ? 'var(--success-bg)' : 'var(--surface3)',
                        color: u.active ? 'var(--success)' : 'var(--text3)',
                      }}
                    >
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editId === u.id ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => updateMutation.mutate({ id: u.id, body: editForm })}
                          className="text-xs px-3 py-1 rounded"
                          style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditId(null); setError(''); }}
                          className="text-xs px-3 py-1 rounded"
                          style={{ color: 'var(--text2)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(u)}
                          className="text-xs px-3 py-1 rounded"
                          style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            const pw = prompt('New password (min 6 chars):');
                            if (pw) resetPwMutation.mutate({ id: u.id, password: pw });
                          }}
                          className="text-xs px-3 py-1 rounded"
                          style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                        >
                          Reset PW
                        </button>
                        {u.active ? (
                          <button
                            onClick={() => deactivateMutation.mutate(u.id)}
                            className="text-xs px-3 py-1 rounded"
                            style={{ color: 'var(--danger)' }}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivateMutation.mutate(u.id)}
                            className="text-xs px-3 py-1 rounded"
                            style={{ color: 'var(--success)' }}
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
