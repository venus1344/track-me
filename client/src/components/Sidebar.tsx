import { useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

interface Customer {
  id: number;
  name: string;
  color?: string;
  project_count?: number;
}

interface UnreadCount {
  count: number;
}

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: '⊞', end: true },
  { to: '/board', label: 'Board', icon: '▦', end: false },
  { to: '/calendar', label: 'Calendar', icon: '◫', end: false },
  { to: '/customers', label: 'Customers', icon: '👥', end: false },
  { to: '/notifications', label: 'Notifications', icon: '🔔', end: false },
];

const CUSTOMER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ec4899', '#14b8a6', '#8b5cf6', '#f97316',
];

function colorForCustomer(id: number, color?: string) {
  if (color) return color;
  return CUSTOMER_COLORS[id % CUSTOMER_COLORS.length];
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers'),
  });

  const { data: unreadData } = useQuery<UnreadCount>({
    queryKey: ['unread-count'],
    queryFn: () => api.get('/notifications/unread-count'),
    refetchInterval: 30_000,
  });

  const unreadCount = unreadData?.count ?? 0;
  const prevUnreadRef = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      playNotificationSound();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside
      className="flex flex-col w-60 shrink-0 h-full overflow-y-auto"
      style={{
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          M
        </div>
        <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>
          Mooove
        </span>
      </div>

      {/* Nav Links */}
      <nav className="flex flex-col gap-1 px-2">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              color: isActive ? 'var(--accent-text)' : 'var(--text2)',
            })}
          >
            <span>{link.icon}</span>
            <span className="flex-1">{link.label}</span>
            {link.to === '/notifications' && unreadCount > 0 && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Customers */}
      {customers && customers.length > 0 && (
        <div className="mt-6 px-4">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
            Customers
          </p>
          <div className="flex flex-col gap-1">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/board?customerId=${c.id}`)}
                className="flex items-center gap-2 px-1 py-1 rounded-lg text-sm text-left w-full transition-colors hover:bg-[var(--surface2)]"
                style={{ color: 'var(--text2)' }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: colorForCustomer(c.id, c.color) }}
                />
                <span className="truncate flex-1">{c.name}</span>
                {c.project_count != null && (
                  <span className="text-xs" style={{ color: 'var(--text3)' }}>
                    {c.project_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="mt-auto px-2 py-4 flex flex-col gap-1">
        {user?.role === 'admin' && (
          <NavLink
            to="/settings"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              color: isActive ? 'var(--accent-text)' : 'var(--text2)',
            })}
          >
            <span>&#x2699;</span>
            <span>Settings</span>
          </NavLink>
        )}
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full"
          style={{ color: 'var(--text2)' }}
        >
          <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full"
          style={{ color: 'var(--danger)' }}
        >
          <span>→</span>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
