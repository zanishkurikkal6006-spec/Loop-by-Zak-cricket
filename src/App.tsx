import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { roleHome } from './lib/nav';
import { AppShell } from './layouts/AppShell';
import LoginPage from './pages/LoginPage';
import { LoopMark } from './components/brand/LoopMark';
import { Toast } from './components/ui/Toast';
import type { UserRole } from './lib/types';

// Feature screens are code-split per route so the heavy admin bundles (charts +
// xlsx) never load for a coach on their phone.
const CoachHome = lazy(() => import('./features/coach/CoachHome'));
const CoachOneToOne = lazy(() => import('./features/coach/CoachOneToOne'));
const CoachAttendance = lazy(() => import('./features/attendance/CoachAttendance'));
const CoachReports = lazy(() => import('./features/reports/CoachReports'));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const AdminPlayers = lazy(() => import('./features/admin/AdminPlayers'));
const AdminAttendance = lazy(() => import('./features/admin/AdminAttendance'));
const AdminFinance = lazy(() => import('./features/admin/AdminFinance'));
const AdminPayments = lazy(() => import('./features/admin/AdminPayments'));
const AdminPrograms = lazy(() => import('./features/admin/AdminPrograms'));
const MatchesList = lazy(() => import('./features/matches/MatchesList'));
const Rankings = lazy(() => import('./features/rankings/Rankings'));
const Badges = lazy(() => import('./features/badges/Badges'));
const HeadCoachDashboard = lazy(() => import('./features/head-coach/HeadCoachDashboard'));
const HeadCoachReports = lazy(() => import('./features/head-coach/HeadCoachReports'));
const HeadCoachFlags = lazy(() => import('./features/head-coach/HeadCoachFlags'));

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
          <Suspense fallback={<FullScreenLoader />}>
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
              <Route path="/coach/matches" element={<MatchesList eyebrow="Coach" mine />} />
              <Route path="/coach/rankings" element={<Rankings eyebrow="Coach" />} />
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
              <Route path="/head-coach" element={<HeadCoachDashboard />} />
              <Route path="/head-coach/reports" element={<HeadCoachReports />} />
              <Route path="/head-coach/flags" element={<HeadCoachFlags />} />
              <Route path="/head-coach/matches" element={<MatchesList eyebrow="Head Coach" mine={false} />} />
              <Route path="/head-coach/rankings" element={<Rankings eyebrow="Head Coach" />} />
              <Route path="/head-coach/badges" element={<Badges eyebrow="Head Coach" canApprove={false} />} />
            </Route>

            {/* ── Admin ── */}
            <Route
              element={
                <RequireRole roles={['admin']}>
                  <AppShell role="admin" />
                </RequireRole>
              }
            >
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/players" element={<AdminPlayers />} />
              <Route path="/admin/finance" element={<AdminFinance />} />
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/programs" element={<AdminPrograms />} />
              <Route path="/admin/badges" element={<Badges eyebrow="Admin" canApprove />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
