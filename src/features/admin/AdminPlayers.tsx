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
import type { Group, PackageType } from '@/lib/types';

// Admin Players: search + group filter + Add Player. The Add modal supports
// day-one onboarding — "already has a running package": enter package size +
// sessions used, and remaining auto-calculates.
export default function AdminPlayers() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
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

  const filtered = useMemo(
    () => players.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase())),
    [players, search],
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

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((p) => (
          <Card key={p.id} className="flex items-center gap-3">
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

  const packageTypes = useQuery({
    queryKey: ['package-types', profile?.academy_id],
    enabled: !!profile && open,
    queryFn: async (): Promise<PackageType[]> => {
      const { data, error } = await supabase.from('package_types').select('*').order('price');
      if (error) throw error;
      return (data ?? []) as PackageType[];
    },
  });

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
    },
    onSuccess: () => {
      toast.show('Player added');
      queryClient.invalidateQueries({ queryKey: ['players'] });
      onClose();
      setName('');
      setAge('');
      setParentName('');
      setParentPhone('');
      setHasRunningPackage(false);
      setSessionsUsed('0');
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Could not add'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add Player">
      <div className="space-y-3">
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

        <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Saving…' : 'Add Player'}
        </Button>
      </div>
    </Modal>
  );
}

const inputCls =
  'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

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
