import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayers } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { RingAvatar } from '@/components/brand/LoopRing';
import { Button, Card, ScreenTitle, Chip } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import PlayerDetail from './PlayerDetail';
import type { Group, PackageType, Player, Program } from '@/lib/types';

// Admin Players: search + group filter + Add Player. The Add modal supports
// day-one onboarding — "already has a running package": enter package size +
// sessions used, and remaining auto-calculates.
export default function AdminPlayers() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  // Filter tab: 'all', a group id, or 'one_to_one' (players with a 1-on-1 block).
  const [filter, setFilter] = useState<string>('all');
  const { data: players = [] } = usePlayers();

  const groups = useQuery({
    queryKey: ['groups', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase.from('groups').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });

  // Set of player ids that have at least one 1-on-1 block (for the 1-on-1 tab).
  const oneToOneIds = useQuery({
    queryKey: ['one-to-one-player-ids', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('one_to_one_blocks').select('player_id');
      if (error) throw error;
      return new Set((data ?? []).map((r) => (r as { player_id: string }).player_id));
    },
  });
  const oneToOne = oneToOneIds.data ?? new Set<string>();

  const filtered = useMemo(
    () =>
      players.filter((p) => {
        if (!p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filter === 'all') return true;
        if (filter === 'one_to_one') return oneToOne.has(p.id);
        return p.group_id === filter;
      }),
    [players, search, filter, oneToOne],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Admin" title="Players" />
        <Button size="sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
        <Icon name="search" size={16} stroke="#9A938A" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="h-10 w-full bg-transparent text-[14px] outline-none"
        />
      </div>

      {/* Filter tabs: All · each group (Elite / Level Up / Launch Pad) · 1-on-1 */}
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All players
        </FilterChip>
        {(groups.data ?? []).map((g) => (
          <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
            {g.name}
          </FilterChip>
        ))}
        <FilterChip active={filter === 'one_to_one'} onClick={() => setFilter('one_to_one')}>
          1-on-1
        </FilterChip>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((p) => (
          <Card key={p.id} className="flex cursor-pointer items-center gap-3" onClick={() => setSelected(p)}>
            <RingAvatar name={p.full_name} size={48} />
            <div className="flex-1">
              <div className="text-[15px] font-semibold">{p.full_name}</div>
              <div className="text-[12px] text-ink/45">
                {p.age ? `Age ${p.age}` : ''} {p.parent_name ? `· ${p.parent_name}` : ''}
              </div>
            </div>
            {p.parent_phone && <Chip tone="green">WhatsApp</Chip>}
          </Card>
        ))}
        {!filtered.length && (
          <div className="card flex h-24 items-center justify-center text-[13px] text-ink/40">
            No players found.
          </div>
        )}
      </div>

      <AddPlayerModal
        open={adding}
        onClose={() => setAdding(false)}
        groups={groups.data ?? []}
      />

      <PlayerDetail player={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AddPlayerModal({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [groupId, setGroupId] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [hasRunningPackage, setHasRunningPackage] = useState(false);
  const [packageTypeId, setPackageTypeId] = useState('');
  const [sessionsUsed, setSessionsUsed] = useState('0');
  const [extraSessions, setExtraSessions] = useState(''); // ad-hoc sessions on top of any package

  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyRow()]);

  const packageTypes = useQuery({
    queryKey: ['package-types', profile?.academy_id],
    enabled: !!profile && open,
    queryFn: async (): Promise<PackageType[]> => {
      const { data, error } = await supabase.from('package_types').select('*').order('price');
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

  // Programs linked to a group — used to auto-enrol a new player by category.
  const programs = useQuery({
    queryKey: ['programs-by-group', profile?.academy_id],
    enabled: !!profile && open,
    queryFn: async (): Promise<Program[]> => {
      const { data, error } = await supabase.from('programs').select('*');
      if (error) throw error;
      return (data ?? []) as Program[];
    },
  });

  // Insert enrolments into every program tied to the player's group. Best-effort:
  // a failure here never blocks player creation.
  async function autoEnrol(playerId: string, groupId: string | null) {
    if (!profile || !groupId) return;
    const linked = (programs.data ?? []).filter((p) => p.group_id === groupId);
    if (!linked.length) return;
    await supabase.from('program_enrollments').insert(
      linked.map((p) => ({
        academy_id: profile.academy_id,
        program_id: p.id,
        player_id: playerId,
      })),
    );
  }

  const selectedType = packageTypes.data?.find((t) => t.id === packageTypeId);
  const total = selectedType?.sessions ?? null;
  // remaining auto-calculates from total − used (the day-one migration rule)
  const remaining = total != null ? Math.max(0, total - Number(sessionsUsed || 0)) : null;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      if (!name.trim()) throw new Error('Name is required');
      const { data: player, error } = await supabase
        .from('players')
        .insert({
          academy_id: profile.academy_id,
          full_name: name.trim(),
          age: age ? Number(age) : null,
          group_id: groupId || null,
          parent_name: parentName || null,
          parent_phone: parentPhone || null,
          // Extra sessions already taken without a package — netted off the next
          // package the player buys.
          extra_sessions: Number(extraSessions) || 0,
        })
        .select()
        .single();
      if (error) throw error;

      if (hasRunningPackage && selectedType) {
        const { error: pErr } = await supabase.from('packages').insert({
          academy_id: profile.academy_id,
          player_id: player.id,
          package_type_id: selectedType.id,
          sessions_total: selectedType.sessions,
          sessions_used: Number(sessionsUsed || 0),
          source: 'admin_assigned',
          payment_status: 'paid',
          assigned_by: profile.id,
        });
        if (pErr) throw pErr;
      }

      await autoEnrol(player.id, groupId || null);
    },
    onSuccess: () => {
      toast.show('Player added');
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-packages'] });
      onClose();
      setName('');
      setAge('');
      setParentName('');
      setParentPhone('');
      setHasRunningPackage(false);
      setSessionsUsed('0');
      setExtraSessions('');
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not add'),
  });

  const typesById = new Map((packageTypes.data ?? []).map((t) => [t.id, t]));

  const createBulk = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const valid = bulkRows.filter((r) => r.name.trim());
      if (!valid.length) throw new Error('Add at least one named player');

      // Insert each player with its package in lockstep so a package is always
      // tied to the exact returned player id — never correlated by array
      // position (insert-returning order is not guaranteed). Import volume is
      // modest (onboarding), so per-row inserts are an acceptable trade-off.
      for (const row of valid) {
        const { data: player, error } = await supabase
          .from('players')
          .insert({
            academy_id: profile.academy_id,
            full_name: row.name.trim(),
            age: row.age ? Number(row.age) : null,
            group_id: row.groupId || null,
            parent_phone: row.parentPhone || null,
          })
          .select()
          .single();
        if (error) throw error;

        const type = row.packageTypeId ? typesById.get(row.packageTypeId) : undefined;
        if (type) {
          const { error: pErr } = await supabase.from('packages').insert({
            academy_id: profile.academy_id,
            player_id: player.id,
            package_type_id: type.id,
            sessions_total: type.sessions,
            sessions_used: Number(row.sessionsUsed || 0),
            source: 'admin_assigned',
            payment_status: 'paid',
            assigned_by: profile.id,
          });
          if (pErr) throw pErr;
        }

        await autoEnrol(player.id, row.groupId || null);
      }
      return valid.length;
    },
    onSuccess: (count) => {
      toast.show(`${count} player${count === 1 ? '' : 's'} imported`);
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      onClose();
      setBulkRows([emptyRow()]);
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not import'),
  });

  function patchRow(id: string, patch: Partial<BulkRow>) {
    setBulkRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Player">
      <div className="space-y-3">
        {/* Single / Bulk toggle */}
        <div className="flex gap-2">
          {(['single', 'bulk'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                'flex-1 rounded-chip px-3 py-2 text-[12px] font-semibold capitalize transition ' +
                (mode === m ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
              }
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'bulk' ? (
          <div className="space-y-3">
            <p className="text-[12px] text-ink/50">
              Add multiple players. For mid-package imports, pick a package and enter sessions used —
              remaining auto-calculates.
            </p>
            <div className="space-y-2">
              {bulkRows.map((r) => {
                const t = r.packageTypeId ? typesById.get(r.packageTypeId) : undefined;
                const rem = t?.sessions != null ? Math.max(0, t.sessions - Number(r.sessionsUsed || 0)) : null;
                return (
                  <div key={r.id} className="rounded-card border border-cardborder bg-white p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={r.name}
                        onChange={(e) => patchRow(r.id, { name: e.target.value })}
                        placeholder="Full name"
                        className={inputCls}
                      />
                      <input
                        type="number"
                        value={r.age}
                        onChange={(e) => patchRow(r.id, { age: e.target.value })}
                        placeholder="Age"
                        className={inputCls}
                      />
                      <select
                        value={r.groupId}
                        onChange={(e) => patchRow(r.id, { groupId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">Group…</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <input
                        value={r.parentPhone}
                        onChange={(e) => patchRow(r.id, { parentPhone: e.target.value })}
                        placeholder="Parent WhatsApp"
                        className={inputCls}
                      />
                      <select
                        value={r.packageTypeId}
                        onChange={(e) => patchRow(r.id, { packageTypeId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">No package</option>
                        {packageTypes.data?.map((pt) => (
                          <option key={pt.id} value={pt.id}>{pt.name}</option>
                        ))}
                      </select>
                      {r.packageTypeId && (
                        <input
                          type="number"
                          value={r.sessionsUsed}
                          onChange={(e) => patchRow(r.id, { sessionsUsed: e.target.value })}
                          placeholder="Sessions used"
                          className={inputCls}
                        />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      {rem != null ? (
                        <Chip tone="green">{rem} remaining</Chip>
                      ) : <span />}
                      {bulkRows.length > 1 && (
                        <button
                          onClick={() => setBulkRows((rows) => rows.filter((x) => x.id !== r.id))}
                          className="text-[12px] font-semibold text-danger"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setBulkRows((rows) => [...rows, emptyRow()])}
              className="w-full rounded-pill border border-dashed border-cardborder py-2 text-[12px] font-semibold text-ink/55"
            >
              + Add another row
            </button>
            <Button className="w-full" disabled={createBulk.isPending} onClick={() => createBulk.mutate()}>
              {createBulk.isPending ? 'Importing…' : `Import ${bulkRows.filter((r) => r.name.trim()).length} players`}
            </Button>
          </div>
        ) : (
        <>
        <Field label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Group">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Parent name">
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Parent WhatsApp">
            <input
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="+9715…"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Day-one mid-package import */}
        <label className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3 py-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={hasRunningPackage}
            onChange={(e) => setHasRunningPackage(e.target.checked)}
          />
          Already has a running package (day-one import)
        </label>

        {hasRunningPackage && (
          <div className="space-y-3 rounded-card border border-cardborder bg-white p-3">
            <Field label="Package">
              <select
                value={packageTypeId}
                onChange={(e) => setPackageTypeId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select…</option>
                {packageTypes.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sessions already used">
              <input
                type="number"
                value={sessionsUsed}
                onChange={(e) => setSessionsUsed(e.target.value)}
                className={inputCls}
              />
            </Field>
            {remaining != null && (
              <Chip tone="green">{remaining} sessions remaining (auto-calculated)</Chip>
            )}
          </div>
        )}

        {/* Extra sessions already taken without a package (netted off next pack) */}
        <Field label="Extra sessions already taken (optional)">
          <input
            type="number"
            value={extraSessions}
            onChange={(e) => setExtraSessions(e.target.value)}
            placeholder="e.g. 5"
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-ink/45">
            Sessions taken without a package. This keeps counting as they attend, and is
            deducted from the next package they buy.
          </p>
        </Field>

        <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Add Player'}
        </Button>
        </>
        )}
      </div>
    </Modal>
  );
}

interface BulkRow {
  id: string;
  name: string;
  age: string;
  groupId: string;
  parentPhone: string;
  packageTypeId: string;
  sessionsUsed: string;
}

function emptyRow(): BulkRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    age: '',
    groupId: '',
    parentPhone: '',
    packageTypeId: '',
    sessionsUsed: '0',
  };
}

const inputCls =
  'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition ' +
        (active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')
      }
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">
        {label}
      </span>
      {children}
    </label>
  );
}
