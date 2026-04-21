import { Outlet, NavLink } from 'react-router';
import { LayoutDashboard, Users, Shield, Key, BarChart2, ScrollText, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import keycloak from '@/lib/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/teams', label: 'Teams', icon: Users, adminOnly: false },
  { to: '/members', label: 'Members', icon: Users, adminOnly: false },
  { to: '/keys', label: 'API Keys', icon: Key, adminOnly: true },
  { to: '/policies', label: 'Policies', icon: Shield, adminOnly: true },
  { to: '/usage', label: 'Usage', icon: BarChart2, adminOnly: false },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, adminOnly: true },
];

export default function AppLayout() {
  const { userName, userEmail, isAdmin } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border flex flex-col">
        <div className="px-6 py-5 border-b border-border">
          <span className="text-lg font-semibold tracking-tight">AI Hub</span>
          <p className="text-xs text-muted-foreground mt-0.5">Admin Portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
              {userName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={() => keycloak.logout()}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
