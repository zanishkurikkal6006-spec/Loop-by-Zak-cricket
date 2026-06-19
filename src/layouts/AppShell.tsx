import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { navByRole, roleLabel } from '@/lib/nav';
import { Wordmark } from '@/components/brand/LoopMark';
import { Icon } from '@/components/ui/Icon';
import { clsx } from '@/lib/utils';
import type { UserRole } from '@/lib/types';

/**
 * Role-aware app shell: 240px sidebar on desktop, bottom nav on mobile.
 * The Head Coach shell carries the green "Development view · no finance" pill.
 */
export function AppShell({ role }: { role: UserRole }) {
  const { profile, signOut } = useAuth();
  const items = navByRole[role];

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── Desktop sidebar ── */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink px-4 py-6 text-paper md:flex">
        <div className="px-2">
          <Wordmark size={22} light />
        </div>

        {role === 'head_coach' && (
          <div className="mx-1 mt-5 rounded-pill bg-success/15 px-3 py-2 text-[11px] font-semibold text-success">
            Development view · no finance
          </div>
        )}

        <nav className="mt-7 flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${role.replace('_', '-')}`}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-pill px-3 py-2.5 text-[13px] font-semibold transition',
                  isActive
                    ? 'bg-brand-red text-paper'
                    : 'text-paper/55 hover:bg-white/5 hover:text-paper',
                )
              }
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="px-2 text-[13px] font-semibold">{profile?.full_name}</div>
          <div className="px-2 text-[11px] text-paper/45">{roleLabel[role]}</div>
          <button
            onClick={() => signOut()}
            className="mt-3 flex w-full items-center gap-2 rounded-pill border border-white/15 px-3 py-2 text-[12px] font-semibold text-paper/70 hover:bg-white/5"
          >
            <Icon name="logout" size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-cardborder bg-paper px-4 py-3 md:hidden">
        <Wordmark size={18} />
        <button
          onClick={() => signOut()}
          className="flex items-center gap-1.5 rounded-pill border border-cardborder px-3 py-1.5 text-[11px] font-semibold text-ink/60"
        >
          <Icon name="logout" size={13} />
          Sign out
        </button>
      </header>

      {/* ── Content ── */}
      <main className="px-4 pb-24 pt-5 md:ml-60 md:px-8 md:pb-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-cardborder bg-paper md:hidden">
        {items.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === `/${role.replace('_', '-')}`}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold',
                isActive ? 'text-brand-red' : 'text-ink/45',
              )
            }
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
