import { createBrowserRouter, Navigate } from 'react-router';
import AppLayout from '@/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import Dashboard from '@/pages/Dashboard';
import Teams from '@/pages/Teams';
import TeamDetail from '@/pages/TeamDetail';
import Members from '@/pages/Members';
import MemberDetail from '@/pages/MemberDetail';
import Keys from '@/pages/Keys';
import Policies from '@/pages/Policies';
import PolicyEditor from '@/pages/PolicyEditor';
import Usage from '@/pages/Usage';
import AuditLogs from '@/pages/AuditLogs';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'teams', element: <Teams /> },
      { path: 'teams/:id', element: <TeamDetail /> },
      { path: 'members', element: <Members /> },
      { path: 'members/:id', element: <MemberDetail /> },
      {
        path: 'keys',
        element: (
          <AdminOnly>
            <Keys />
          </AdminOnly>
        ),
      },
      {
        path: 'policies',
        element: (
          <AdminOnly>
            <Policies />
          </AdminOnly>
        ),
      },
      {
        path: 'policies/new',
        element: (
          <AdminOnly>
            <PolicyEditor />
          </AdminOnly>
        ),
      },
      {
        path: 'policies/:id/edit',
        element: (
          <AdminOnly>
            <PolicyEditor />
          </AdminOnly>
        ),
      },
      { path: 'usage', element: <Usage /> },
      {
        path: 'reports',
        element: (
          <AdminOnly>
            <Reports />
          </AdminOnly>
        ),
      },
      {
        path: 'audit',
        element: (
          <AdminOnly>
            <AuditLogs />
          </AdminOnly>
        ),
      },
      {
        path: 'settings',
        element: (
          <AdminOnly>
            <Settings />
          </AdminOnly>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
