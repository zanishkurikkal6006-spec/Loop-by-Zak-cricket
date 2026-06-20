import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, Chip, Button } from '@/components/ui';
import { counterState } from '@/lib/utils';
import { exportToExcel } from '@/lib/excel';
import type { Package, PackageType, Player, Group } from '@/lib/types';

// Month-End sessions-and-payments report. Group-by-group: per player the
// sessions used/remaining, package & payment status, and a "not seen" flag.
// Sorted action-first (renewals due, payment pending, not seen float to the
// top), with Excel export.

interface Row {
  player: Player;
  groupName: string;
  pkgName: string;
  used: number;
  remaining: number | null;
  paymentStatus: string;
  notSeen: boolean;
  noPackage: boolean;
  /** Higher = more urgent; drives the action-first sort. */
  priority: number;
}

const NOT_SEEN_DAYS = 14;

export default function MonthEndReport() {
  const { profile } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['month-end', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Row[]> => {
      const [players, groups, packages] = await Promise.all([
        supabase.from('players').select('*').eq('status', 'active'),
        supabase.from('groups').select('*'),
        supabase.from('packages').select('*, package_type:package_types(*)'),
      ]);

      const groupName = new Map(
        ((groups.data ?? []) as Group[]).map((g) => [g.id, g.name]),
      );
      // Latest package per player.
      const pkgByPlayer = new Map<string, Package & { package_type: PackageType | null }>();
      for (const p of (packages.data ?? []) as (Package & { package_type: PackageType | null })[]) {
        const cur = pkgByPlayer.get(p.player_id);
        if (!cur || p.created_at > cur.created_at) pkgByPlayer.set(p.player_id, p);
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - NOT_SEEN_DAYS);

      return ((players.data ?? []) as Player[]).map((player) => {
        const pkg = pkgByPlayer.get(player.id);
        const noPackage = !pkg;
        const kind = pkg?.package_type?.kind ?? 'standard';
        const state = counterState(pkg?.sessions_remaining ?? null, kind);
        const notSeen = !player.last_seen_at || new Date(player.last_seen_at) < cutoff;
        const paymentStatus = pkg?.payment_status ?? 'none';

        let priority = 0;
        if (noPackage) priority += 3; // surface alongside exhausted — needs a package
        if (state === 'exhausted') priority += 3;
        if (state === 'low') priority += 2;
        if (paymentStatus === 'pending') priority += 2;
        if (notSeen) priority += 1;

        return {
          player,
          groupName: player.group_id ? (groupName.get(player.group_id) ?? '—') : '—',
          pkgName: pkg?.package_type?.name ?? 'No package',
          used: pkg?.sessions_used ?? 0,
          remaining: pkg?.sessions_remaining ?? null,
          paymentStatus,
          notSeen,
          noPackage,
          priority,
        };
      });
    },
  });

  // Group rows by group name, each group sorted action-first.
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.groupName) ?? [];
      list.push(r);
      map.set(r.groupName, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.priority - a.priority);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  function handleExport() {
    exportToExcel(
      rows.map((r) => ({
        Player: r.player.full_name,
        Group: r.groupName,
        Package: r.pkgName,
        Used: r.used,
        Remaining: r.remaining ?? 'Unlimited',
        Payment: r.paymentStatus,
        'Not seen 14d+': r.notSeen ? 'Yes' : 'No',
      })),
      'loop-month-end',
      'Month-End',
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-ink/40">Month-End Report · sessions &amp; payments</div>
        <Button size="sm" variant="gold" onClick={handleExport}>
          ⬇ Export to Excel
        </Button>
      </div>

      {isLoading && <div className="text-[13px] text-ink/45">Building report…</div>}

      {grouped.map(([group, list]) => (
        <Card key={group} className="p-0">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <span className="text-[14px] font-semibold">{group}</span>
            <Chip tone="neutral">{list.length}</Chip>
          </div>
          <div className="divide-y divide-hairline">
            {list.map((r) => (
              <div key={r.player.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="flex-1 font-medium">{r.player.full_name}</span>
                <span className="text-ink/45">
                  {r.used}/{r.remaining == null ? '∞' : r.used + r.remaining}
                </span>
                <div className="flex gap-1.5">
                  {r.remaining != null && r.remaining <= 2 && (
                    <Chip tone={r.remaining <= 0 ? 'red' : 'amber'}>
                      {r.remaining <= 0 ? 'Exhausted' : `${r.remaining} left`}
                    </Chip>
                  )}
                  {r.noPackage && <Chip tone="red">No package</Chip>}
                  {r.paymentStatus === 'pending' && <Chip tone="amber">Payment pending</Chip>}
                  {r.notSeen && <Chip tone="red">Not seen</Chip>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
