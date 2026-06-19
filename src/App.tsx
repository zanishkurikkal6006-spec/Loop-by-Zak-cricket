import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { roleHome } from './lib/nav';
import { AppShell } from './layouts/AppShell';
import LoginPage from './pages/LoginPage';
import { LoopMark } from './components/brand/LoopMark';
import { Toast } from './components/ui/Toast';
import CoachHome from './features/coach/CoachHome';
import CoachOneToOne from './features/coach/CoachOneToOne';
import CoachAttendance from './features/attendance/CoachAttendance';
import CoachReports from './features/reports/CoachReports';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminPlayers from './features/admin/AdminPlayers';
import AdminAttendance from './features/admin/AdminAttendance';
import AdminFinance from './features/admin/AdminFinance';
import AdminPayments from './features/admin/AdminPayments';
import AdminPrograms from './features/admin/AdminPrograms';
import MatchesList from './features/matches/MatchesList';
import Rankings from './features/rankings/Rankings';
import Badges from './features/badges/Badges';
import HeadCoachDashboard from './features/head-coach/HeadCoachDashboard';
import HeadCoachReports from './features/head-coach/HeadCoachReports';
import HeadCoachFlags from './features/head-coach/HeadCoachFlags';
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
