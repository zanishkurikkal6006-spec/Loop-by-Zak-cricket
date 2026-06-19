import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { roleHome } from './lib/nav';
import { AppShell } from './layouts/AppShell';
import LoginPage from './pages/LoginPage';
import Placeholder from './pages/Placeholder';
import { LoopMark } from './components/brand/LoopMark';
import { Toast } from './components/ui/Toast';
import CoachHome from './features/coach/CoachHome';
import CoachOneToOne from './features/coach/CoachOneToOne';
import CoachAttendance from './features/attendance/CoachAttendance';
import CoachReports from './features/reports/CoachReports';
import type { UserRole } from './lib/types';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <LoopMark size={64} className="animate-pulse" />
    </div>
  );
}

/** Guards a route tree: must be signed in and have one of the allowed roles. */
function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && !roles.includes(profile.role)) {
    return <Navigate to={roleHome[profile.role]} replace />;
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to={roleHome[profile.role]} replace />;
  return <FullScreenLoader />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toast />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* ── Coach ── */}
            <Route
              element={
                <RequireRole roles={['coach']}>
                  <AppShell role="coach" />
                </RequireRole>
              }
            >
              <Route path="/coach" element={<CoachHome />} />
              <Route path="/coach/one-to-one" element={<CoachOneToOne />} />
              <Route path="/coach/attendance" element={<CoachAttendance />} />
              <Route path="/coach/matches" element={<Placeholder eyebrow="Coach" title="Matches" />} />
              <Route path="/coach/rankings" element={<Placeholder eyebrow="Coach" title="Rankings" />} />
              <Route path="/coach/reports" element={<CoachReports />} />
            </Route>

            {/* ── Head Coach ── */}
            <Route
              element={
                <RequireRole roles={['head_coach']}>
                  <AppShell role="head_coach" />
                </RequireRole>
              }
            >
              <Route path="/head-coach" element={<Placeholder eyebrow="Head Coach" title="Coaches" />} />
              <Route path="/head-coach/reports" element={<Placeholder eyebrow="Head Coach" title="All Reports" />} />
              <Route path="/head-coach/flags" element={<Placeholder eyebrow="Head Coach" title="Flags" />} />
              <Route path="/head-coach/matches" element={<Placeholder eyebrow="Head Coach" title="Matches" />} />
              <Route path="/head-coach/rankings" element={<Placeholder eyebrow="Head Coach" title="Rankings" />} />
              <Route path="/head-coach/badges" element={<Placeholder eyebrow="Head Coach" title="Badges" />} />
            </Route>

            {/* ── Admin ── */}
            <Route
              element={
                <RequireRole roles={['admin']}>
                  <AppShell role="admin" />
                </RequireRole>
              }
            >
              <Route path="/admin" element={<Placeholder eyebrow="Admin" title="Dashboard" />} />
              <Route path="/admin/players" element={<Placeholder eyebrow="Admin" title="Players" />} />
              <Route path="/admin/finance" element={<Placeholder eyebrow="Admin" title="Finance" />} />
              <Route path="/admin/attendance" element={<Placeholder eyebrow="Admin" title="Attendance" />} />
              <Route path="/admin/payments" element={<Placeholder eyebrow="Admin" title="Payments" />} />
              <Route path="/admin/programs" element={<Placeholder eyebrow="Admin" title="Programs" />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
