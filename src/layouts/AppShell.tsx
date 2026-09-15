import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navByRole, roleHome, roleLabel } from '@/lib/nav';
import { Wordmark } from '@/components/brand/LoopMark';
import { Icon } from '@/components/ui/Icon';
import { clsx } from '@/lib/utils';
import { appBrandLogoUrl, appBrandName } from '@/lib/appBrand';
import type { UserRole } from '@/lib/types';

/** Academy logo (uploaded in Settings, or the env brand) in the header, else the Loop mark. */
function BrandHeader({ light, size }: { light?: boolean; size: number }) {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ['shell-brand', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from('academies').select('name, logo_url').eq('id', profile!.academy_id).single();
      return data as { name: string; logo_url: string | null } | null;
    },
  });
  const logo = data?.logo_url ?? appBrandLogoUrl();
  const name = data?.name ?? appBrandName();
  if (logo) {
    const img = <img src={logo} alt={name} className="w-auto object-contain" style={{ height: size + 8, maxWidth: 168 }} />;
    // On the dark (navy) sidebar, sit the logo on a white tile so navy-on-navy
    // logos stay visible — mirroring the academy's own site footer.
    return light
      ? <span className="inline-flex items-center rounded-xl bg-white px-2.5 py-1.5">{img}</span>
      : img;
  }
  return <Wordmark size={size} light={light} />;
}

/**
 * Role-aware app shell: 240px sidebar on desktop, bottom nav on mobile.
 * The Head Coach shell carries the green "Development view · no finance" pill.
 */
export function AppShell({ role }: { role: UserRole }) {
  const { profile, signOut } = useAuth();
  const items = navByRole[role];
  const [moreOpen, setMoreOpen] = useState(false);
  // Mobile bottom nav fits 5 slots. If there are more items, show the first 4
  // plus a "More" button that opens the rest in a sheet.
  const hasOverflow = items.length > 5;
  const primary = hasOverflow ? items.slice(0, 4) : items.slice(0, 5);
  const overflow = hasOverflow ? items.slice(4) : [];

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── Desktop sidebar ── */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink px-4 py-6 text-paper md:flex">
        <div className="px-2">
          <BrandHeader size={22} light />
        </div>

        {role === 'head_coach' && (
          <div className="mx-1 mt-5 rounded-pill bg-success/15 px-3 py-2 text-[11px] font-semibold text-success">
            Development view · no finance
          </div>
        )}

        <nav className="mt-7 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === roleHome[role]}
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
          <div className="mt-3 px-2 text-[9.5px] uppercase tracking-[0.22em] text-paper/30">
            Powered by Loop by Zak Cricket
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-cardborder bg-paper px-4 py-3 md:hidden">
        <BrandHeader size={18} />
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

      {/* ── Mobile "More" sheet ── */}
      {moreOpen && hasOverflow && (
        <>
          <div className="fixed inset-0 z-20 bg-ink/30 md:hidden" onClick={() => setMoreOpen(false)} />
          <div className="fixed inset-x-0 bottom-[58px] z-30 max-h-[60vh] overflow-y-auto rounded-t-card border-t border-cardborder bg-paper p-3 md:hidden">
            <div className="grid grid-cols-4 gap-2">
              {overflow.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex flex-col items-center gap-1 rounded-card py-3 text-[10px] font-semibold',
                      isActive ? 'bg-chip-red text-brand-red' : 'text-ink/55',
                    )
                  }
                >
                  <Icon name={item.icon} size={20} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-cardborder bg-paper md:hidden">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === roleHome[role]}
            onClick={() => setMoreOpen(false)}
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
        {hasOverflow && (
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={clsx(
              'flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold',
              moreOpen ? 'text-brand-red' : 'text-ink/45',
            )}
          >
            <Icon name="grid" size={20} />
            More
          </button>
        )}
      </nav>
    </div>
  );
}
