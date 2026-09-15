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
const SkillAssessment = lazy(() => import('./features/reports/SkillAssessment'));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const AdminPlayers = lazy(() => import('./features/admin/AdminPlayers'));
const AdminAttendance = lazy(() => import('./features/admin/AdminAttendance'));
const AdminFinance = lazy(() => import('./features/admin/AdminFinance'));
const AdminPayments = lazy(() => import('./features/admin/AdminPayments'));
const AdminPrograms = lazy(() => import('./features/admin/AdminPrograms'));
const AdminSettings = lazy(() => import('./features/admin/AdminSettings'));
const MatchesList = lazy(() => import('./features/matches/MatchesList'));
const Rankings = lazy(() => import('./features/rankings/Rankings'));
const Badges = lazy(() => import('./features/badges/Badges'));
const HeadCoachDashboard = lazy(() => import('./features/head-coach/HeadCoachDashboard'));
const HeadCoachReports = lazy(() => import('./features/head-coach/HeadCoachReports'));
const HeadCoachFlags = lazy(() => import('./features/head-coach/HeadCoachFlags'));
const CelebratePage = lazy(() => import('./pages/CelebratePage'));
// ── Growth Engine (Phase 1) — Director & Operations Manager ──
const CommandCenter = lazy(() => import('./features/command/CommandCenter'));
const TodaysActions = lazy(() => import('./features/command/TodaysActions'));
const LeadCRM = lazy(() => import('./features/growth/LeadCRM'));
const Trials = lazy(() => import('./features/growth/Trials'));
const FollowUps = lazy(() => import('./features/growth/FollowUps'));
// ── Retention & Parent Experience (Phase 2) ──
const Retention = lazy(() => import('./features/experience/Retention'));
const ParentExperience = lazy(() => import('./features/experience/ParentExperience'));
const Churn = lazy(() => import('./features/experience/Churn'));
// ── Acquisition (Phase 3) ──
const Schools = lazy(() => import('./features/growth/Schools'));
const Events = lazy(() => import('./features/growth/Events'));
const Referrals = lazy(() => import('./features/growth/Referrals'));
const Campaigns = lazy(() => import('./features/growth/Campaigns'));
// ── Operations Intelligence (Phase 4) ──
const RevenueIntelligence = lazy(() => import('./features/ops/RevenueIntelligence'));
const Capacity = lazy(() => import('./features/ops/Capacity'));
const Venues = lazy(() => import('./features/ops/Venues'));
const CoachUtilization = lazy(() => import('./features/ops/CoachUtilization'));
// ── AI Operations (Phase 5) ──
const AskAI = lazy(() => import('./features/ai/AskAI'));
// ── Strategy (Phase 7) ──
const Strategy = lazy(() => import('./features/strategy/Strategy'));

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
            <Route path="/celebrate" element={<CelebratePage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* ── Director (Command Center + Growth, strategic view) ── */}
            <Route
              element={
                <RequireRole roles={['director']}>
                  <AppShell role="director" />
                </RequireRole>
              }
            >
              <Route path="/director" element={<CommandCenter base="/director" />} />
              <Route path="/director/ai" element={<AskAI />} />
              <Route path="/director/actions" element={<TodaysActions base="/director" />} />
              <Route path="/director/leads" element={<LeadCRM base="/director" />} />
              <Route path="/director/trials" element={<Trials />} />
              <Route path="/director/followups" element={<FollowUps />} />
              <Route path="/director/schools" element={<Schools />} />
              <Route path="/director/events" element={<Events />} />
              <Route path="/director/referrals" element={<Referrals />} />
              <Route path="/director/campaigns" element={<Campaigns />} />
              <Route path="/director/players" element={<AdminPlayers />} />
              <Route path="/director/retention" element={<Retention />} />
              <Route path="/director/experience" element={<ParentExperience />} />
              <Route path="/director/churn" element={<Churn />} />
              <Route path="/director/capacity" element={<Capacity />} />
              <Route path="/director/venues" element={<Venues />} />
              <Route path="/director/coaches" element={<CoachUtilization />} />
              <Route path="/director/revenue" element={<RevenueIntelligence />} />
              <Route path="/director/strategy" element={<Strategy />} />
            </Route>

            {/* ── Operations Manager (full operational control) ── */}
            <Route
              element={
                <RequireRole roles={['operations_manager']}>
                  <AppShell role="operations_manager" />
                </RequireRole>
              }
            >
              <Route path="/ops" element={<CommandCenter base="/ops" />} />
              <Route path="/ops/ai" element={<AskAI />} />
              <Route path="/ops/actions" element={<TodaysActions base="/ops" />} />
              <Route path="/ops/leads" element={<LeadCRM base="/ops" />} />
              <Route path="/ops/trials" element={<Trials />} />
              <Route path="/ops/followups" element={<FollowUps />} />
              <Route path="/ops/schools" element={<Schools />} />
              <Route path="/ops/events" element={<Events />} />
              <Route path="/ops/referrals" element={<Referrals />} />
              <Route path="/ops/campaigns" element={<Campaigns />} />
              <Route path="/ops/players" element={<AdminPlayers />} />
              <Route path="/ops/attendance" element={<AdminAttendance />} />
              <Route path="/ops/retention" element={<Retention />} />
              <Route path="/ops/experience" element={<ParentExperience />} />
              <Route path="/ops/churn" element={<Churn />} />
              <Route path="/ops/capacity" element={<Capacity />} />
              <Route path="/ops/venues" element={<Venues />} />
              <Route path="/ops/coaches" element={<CoachUtilization />} />
              <Route path="/ops/revenue" element={<RevenueIntelligence />} />
              <Route path="/ops/payments" element={<AdminPayments />} />
            </Route>

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
              <Route path="/coach/assessment" element={<SkillAssessment />} />
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
              <Route path="/head-coach/ai" element={<AskAI />} />
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
              <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
