import { NavLink } from 'react-router';
import { LayoutDashboard, Users, User, Key, Gavel, BarChart3, History, Settings, FileBox } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { id: 'dashboard', to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', adminOnly: false },
  { id: 'teams', to: '/teams', icon: Users, label: 'Teams', adminOnly: false },
  { id: 'members', to: '/members', icon: User, label: 'Members', adminOnly: false },
  { id: 'keys', to: '/keys', icon: Key, label: 'Keys', adminOnly: true },
  { id: 'policies', to: '/policies', icon: Gavel, label: 'Policies', adminOnly: true },
  { id: 'usage', to: '/usage', icon: BarChart3, label: 'Usage', adminOnly: false },
  { id: 'audit', to: '/audit', icon: History, label: 'Audit Logs', adminOnly: true },
  { id: 'reports', to: '/reports', icon: FileBox, label: 'Reports', adminOnly: false },
];

export const Sidebar = () => {
  const { isAdmin } = useAuth();

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 glass-panel border-r-0 py-6 space-y-1 z-40 rounded-r-3xl">
      <div className="px-8 mb-8 flex items-center gap-3">
        <div className="orb"></div>
        <div>
          <h1 className="text-xl font-bold text-on-surface tracking-tighter uppercase">AIHub</h1>
          <p className="text-[9px] uppercase tracking-[0.2em] text-primary font-bold">PROD // SYSTEM</p>
        </div>
      </div>

      <nav className="flex-1 flex flex-col px-3 space-y-1">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                className={({ isActive }) => `
                  flex items-center px-5 py-3 transition-all duration-300 group rounded-xl
                  ${isActive 
                    ? 'bg-primary/20 text-primary font-bold shadow-[0_0_15px_rgba(56,189,248,0.2)] border border-primary/20' 
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'}
                `}
              >
                <Icon className={`mr-3 w-4 h-4 group-hover:text-primary transition-colors`} />
                <span className="text-[10px] uppercase tracking-[0.15em] font-bold">{item.label}</span>
              </NavLink>
            );
          })}
      </nav>

      <div className="px-6 py-4">
        <div className="bg-primary/10 border border-primary/20 px-3 py-2 rounded-xl text-[10px] font-mono text-primary font-bold flex items-center justify-center status-glow">
          READY // 100%
        </div>
      </div>

      <div className="mt-auto space-y-1 px-3">
        <button className="w-full text-on-surface-variant hover:text-on-surface hover:bg-white/5 px-5 py-3 flex items-center transition-all rounded-xl group">
          <Settings className="mr-3 w-4 h-4 group-hover:text-primary" />
          <span className="text-[10px] uppercase tracking-widest font-bold">Settings</span>
        </button>
      </div>
    </aside>
  );
};
