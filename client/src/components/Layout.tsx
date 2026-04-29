import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

interface LayoutProps {
  children?: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
