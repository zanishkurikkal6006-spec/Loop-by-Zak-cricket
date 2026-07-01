import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { ScreenTitle, Card, Button } from '@/components/ui';
import { createStaff } from '@/lib/staff';
import { setBranding } from '@/lib/branding';
import type { UserRole, Group, Profile, TrainingCenter, Batch } from '@/lib/types';

// Admin Settings — academy configuration: staff, training centres, batches &
// time slots, groups, coach assignments, and bank details. Split out of Payments
// into its own page so day-to-day money work and one-off setup stay separate.

type BatchRow = Batch & {
  center: TrainingCenter | null;
  batch_groups: { group: { name: string } | null }[];
};

export default function AdminSettings() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: centers = [] } = useQuery({
    queryKey: ['settings-centers', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<TrainingCenter[]> => {
      const { data } = await supabase.from('training_centers').select('*').order('name');
      return (data ?? []) as TrainingCenter[];
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['settings-batches', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<BatchRow[]> => {
      const { data } = await supabase
        .from('batches')
        .select('*, center:training_centers(*), batch_groups(group:groups(name))')
        .order('start_time');
      return (data ?? []) as BatchRow[];
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['settings-groups', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Group[]> => {
      const { data } = await supabase.from('groups').select('*').order('name');
      return (data ?? []) as Group[];
    },
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ['settings-coaches', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Profile[]> => {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'coach').order('full_name');
      return (data ?? []) as Profile[];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['settings-staff', profile?.academy_id],
    enabled: !!profile,
    queryFn: async (): Promise<Profile[]> => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['coach', 'head_coach', 'admin'])
        .order('role');
      return (data ?? []) as Profile[];
    },
  });

  const { data: academy } = useQuery({
    queryKey: ['settings-academy', profile?.academy_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from('academies')
        .select('id, name, logo_url, bank_details')
        .eq('id', profile!.academy_id)
        .single();
      return data as { id: string; name: string; logo_url: string | null; bank_details: Record<string, string> } | null;
    },
  });

  // ── Academy branding (name + logo, used on all reports & messages) ──────────
  const [acName, setAcName] = useState('');
  const [acLogo, setAcLogo] = useState('');
  useEffect(() => {
    if (academy) {
      setAcName(academy.name ?? '');
      setAcLogo(academy.logo_url ?? '');
    }
  }, [academy]);
  // Upload a logo file — downscale to <=256px and store it inline (a data URL),
  // so no image hosting / URL is needed.
  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.show('Please choose an image file');
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
      });
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      setAcLogo(canvas.toDataURL('image/png'));
      toast.show('Logo ready — tap Save branding');
    } catch {
      toast.show('Could not read that image');
    }
  }

  async function saveBranding() {
    if (!profile || !acName.trim()) return toast.show('Academy name is required');
    const { error } = await supabase
      .from('academies')
      .update({ name: acName.trim(), logo_url: acLogo.trim() || null })
      .eq('id', profile.academy_id);
    if (error) return toast.show('Could not save branding');
    setBranding(acName.trim(), acLogo.trim() || null);
    toast.show('Branding saved');
    qc.invalidateQueries({ queryKey: ['settings-academy'] });
  }

  // ── Training centers ───────────────────────────────────────────────────────
  const [centerName, setCenterName] = useState('');
  const [centerAddr, setCenterAddr] = useState('');
  async function addCenter() {
    if (!profile || !centerName.trim()) return;
    const { error } = await supabase.from('training_centers').insert({
      academy_id: profile.academy_id,
      name: centerName.trim(),
      address: centerAddr.trim() || null,
    });
    if (error) return toast.show('Could not add center');
    toast.show('Center added');
    setCenterName('');
    setCenterAddr('');
    qc.invalidateQueries({ queryKey: ['settings-centers'] });
  }

  // ── Batches ────────────────────────────────────────────────────────────────
  const [batchName, setBatchName] = useState('');
  const [batchStart, setBatchStart] = useState('');
  const [batchEnd, setBatchEnd] = useState('');
  const [batchCenter, setBatchCenter] = useState('');
  const [batchGroup, setBatchGroup] = useState('');
  async function addBatch() {
    if (!profile || !batchName.trim()) return;
    const { data: created, error } = await supabase
      .from('batches')
      .insert({
        academy_id: profile.academy_id,
        name: batchName.trim(),
        center_id: batchCenter || null,
        start_time: batchStart || null,
        end_time: batchEnd || null,
      })
      .select()
      .single();
    if (error) return toast.show('Could not add batch');
    // Link the batch to a group so it shows up as a time slot when marking
    // attendance for that group (Elite, Level Up, Launch Pad…).
    if (batchGroup) {
      await supabase.from('batch_groups').insert({ batch_id: created.id, group_id: batchGroup });
    }
    toast.show('Batch added');
    setBatchName('');
    setBatchStart('');
    setBatchEnd('');
    setBatchGroup('');
    qc.invalidateQueries({ queryKey: ['settings-batches'] });
  }

  // ── Groups ───────────────────────────────────────────────────────────────--
  const [groupName, setGroupName] = useState('');
  const [groupAge, setGroupAge] = useState('');
  const [groupCenter, setGroupCenter] = useState('');
  async function addGroup() {
    if (!profile || !groupName.trim()) return;
    const { error } = await supabase.from('groups').insert({
      academy_id: profile.academy_id,
      name: groupName.trim(),
      age_category: groupAge.trim() || null,
      default_center_id: groupCenter || null,
    });
    if (error) return toast.show('Could not add group');
    toast.show('Group added');
    setGroupName('');
    setGroupAge('');
    qc.invalidateQueries({ queryKey: ['settings-groups'] });
  }

  // ── Assign coach to group ─────────────────────────────────────────────────--
  const [assignCoach, setAssignCoach] = useState('');
  const [assignGroup, setAssignGroup] = useState('');
  async function assignCoachToGroup() {
    if (!profile || !assignCoach || !assignGroup) return;
    const { error } = await supabase.from('coach_groups').insert({
      academy_id: profile.academy_id,
      coach_id: assignCoach,
      group_id: assignGroup,
    });
    if (error) return toast.show('Already assigned, or failed');
    toast.show('Coach assigned to group');
    setAssignCoach('');
    setAssignGroup('');
  }

  // ── Bank details ─────────────────────────────────────────────────────────--
  const [bank, setBank] = useState<Record<string, string>>({});
  // Seed the editable bank fields once the academy record loads.
  useEffect(() => {
    if (academy?.bank_details) setBank(academy.bank_details);
  }, [academy]);
  async function saveBank() {
    if (!profile) return;
    const { error } = await supabase
      .from('academies')
      .update({ bank_details: bank })
      .eq('id', profile.academy_id);
    if (error) return toast.show('Could not save bank details');
    toast.show('Bank details saved');
    qc.invalidateQueries({ queryKey: ['settings-academy'] });
  }

  async function del(table: string, id: string, key: string) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return toast.show('Could not delete');
    toast.show('Deleted');
    qc.invalidateQueries({ queryKey: [key] });
  }

  // ── Add staff (coach / head coach) ─────────────────────────────────────────
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPass, setStaffPass] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('coach');
  const [addingStaff, setAddingStaff] = useState(false);
  async function addStaff() {
    if (!profile) return;
    if (!staffName.trim() || !staffEmail.trim() || staffPass.length < 6) {
      return toast.show('Name, email, and a 6+ char password required');
    }
    setAddingStaff(true);
    try {
      await createStaff({
        full_name: staffName.trim(),
        email: staffEmail.trim(),
        password: staffPass,
        role: staffRole,
        academyId: profile.academy_id,
      });
      toast.show('Staff member created');
      setStaffName('');
      setStaffEmail('');
      setStaffPass('');
      setStaffRole('coach');
      qc.invalidateQueries({ queryKey: ['settings-staff'] });
      qc.invalidateQueries({ queryKey: ['settings-coaches'] });
      qc.invalidateQueries({ queryKey: ['coaches'] });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not create staff member');
    } finally {
      setAddingStaff(false);
    }
  }

  const roleLabel: Record<string, string> = { coach: 'Coach', head_coach: 'Head Coach', admin: 'Admin' };

  const field = 'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Admin" title="Settings" />

      {/* Academy branding */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Academy Branding</div>
        <p className="mb-3 text-[12px] text-ink/50">
          Your academy name &amp; logo appear on all reports, certificates and parent messages.
          “Powered by Loop by Zak Cricket” stays as the platform credit.
        </p>
        <input value={acName} onChange={(e) => setAcName(e.target.value)} placeholder="Academy name (e.g. Danube Cricket Academy)" className={field} />
        <div className="mt-3 flex items-center gap-3">
          {acLogo.trim() ? (
            <img src={acLogo.trim()} alt="" className="h-14 w-14 rounded-card border border-cardborder object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-card border border-dashed border-cardborder text-[10px] text-ink/40">No logo</div>
          )}
          <label className="cursor-pointer rounded-pill border border-cardborder bg-white px-4 py-2 text-[12px] font-semibold text-brand-red">
            {acLogo ? 'Change logo' : 'Upload logo'}
            <input type="file" accept="image/*" onChange={onLogoFile} className="hidden" />
          </label>
          {acLogo && (
            <button onClick={() => setAcLogo('')} className="text-[12px] font-semibold text-danger">Remove</button>
          )}
        </div>
        <Button size="sm" className="mt-3" onClick={saveBranding}>Save branding</Button>
      </Card>

      {/* Coaches & staff */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Coaches &amp; Staff</div>
        <div className="divide-y divide-hairline">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-medium">{s.full_name}</span>
              <span className="text-ink/45">{roleLabel[s.role] ?? s.role}</span>
            </div>
          ))}
          {!staff.length && <div className="py-2 text-[13px] text-ink/45">No staff yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Full name" className={field} />
          <input value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="Email" className={field} />
          <input type="password" value={staffPass} onChange={(e) => setStaffPass(e.target.value)} placeholder="Temp password (6+)" className={field} />
          <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as UserRole)} className={field}>
            <option value="coach">Coach</option>
            <option value="head_coach">Head Coach</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button size="sm" className="mt-2" disabled={addingStaff} onClick={addStaff}>
          {addingStaff ? 'Creating…' : '+ Add staff member'}
        </Button>
        <p className="mt-2 text-[11px] text-ink/45">
          Creates a login. Share the email + temp password; they can sign in right away.
        </p>
      </Card>

      {/* Training centers */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Training Centers / Grounds</div>
        <div className="divide-y divide-hairline">
          {centers.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-medium">{c.name}</span>
              <span className="flex items-center gap-2 text-ink/45">
                {c.address}
                <DeleteX onClick={() => del('training_centers', c.id, 'settings-centers')} />
              </span>
            </div>
          ))}
          {!centers.length && <div className="py-2 text-[13px] text-ink/45">No centers yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={centerName} onChange={(e) => setCenterName(e.target.value)} placeholder="Center / ground name" className={field} />
          <input value={centerAddr} onChange={(e) => setCenterAddr(e.target.value)} placeholder="Address" className={field} />
        </div>
        <Button size="sm" className="mt-2" onClick={addCenter}>+ Add center / ground</Button>
      </Card>

      {/* Batches & time slots */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Batches &amp; Time Slots</div>
        <div className="divide-y divide-hairline">
          {batches.map((b) => {
            const grp = b.batch_groups?.map((bg) => bg.group?.name).filter(Boolean).join(', ');
            return (
              <div key={b.id} className="flex items-center justify-between py-2 text-[13px]">
                <span className="font-medium">
                  {b.name}
                  {grp ? <span className="ml-2 text-[11px] font-normal text-ink/45">· {grp}</span> : null}
                </span>
                <span className="flex items-center gap-2 text-ink/45">
                  {b.start_time?.slice(0, 5) ?? '—'}–{b.end_time?.slice(0, 5) ?? '—'}
                  {b.center ? ` · ${b.center.name}` : ''}
                  <DeleteX onClick={() => del('batches', b.id, 'settings-batches')} />
                </span>
              </div>
            );
          })}
          {!batches.length && <div className="py-2 text-[13px] text-ink/45">No batches yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Batch name (e.g. Elite Evening)" className={field} />
          <select value={batchGroup} onChange={(e) => setBatchGroup(e.target.value)} className={field}>
            <option value="">Group (for attendance)…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select value={batchCenter} onChange={(e) => setBatchCenter(e.target.value)} className={field}>
            <option value="">Center…</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div />
          <input type="time" value={batchStart} onChange={(e) => setBatchStart(e.target.value)} className={field} />
          <input type="time" value={batchEnd} onChange={(e) => setBatchEnd(e.target.value)} className={field} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink/45">
          Tip: give Elite two batches (e.g. morning + evening), Level Up and Launch Pad one each.
        </p>
        <Button size="sm" className="mt-2" onClick={addBatch}>+ Add batch</Button>
      </Card>

      {/* Groups */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Groups</div>
        <div className="divide-y divide-hairline">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2 text-[13px]">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                {g.name}
              </span>
              <span className="flex items-center gap-2 text-ink/45">
                {g.age_category}
                <DeleteX onClick={() => del('groups', g.id, 'settings-groups')} />
              </span>
            </div>
          ))}
          {!groups.length && <div className="py-2 text-[13px] text-ink/45">No groups yet.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name (e.g. Elite)" className={field} />
          <input value={groupAge} onChange={(e) => setGroupAge(e.target.value)} placeholder="Age (e.g. Under 16)" className={field} />
          <select value={groupCenter} onChange={(e) => setGroupCenter(e.target.value)} className={field}>
            <option value="">Default center…</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <Button size="sm" className="mt-2" onClick={addGroup}>+ Add group</Button>
      </Card>

      {/* Assign coach to group */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Assign Coach to Group</div>
        <div className="grid grid-cols-2 gap-2">
          <select value={assignCoach} onChange={(e) => setAssignCoach(e.target.value)} className={field}>
            <option value="">Coach…</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <select value={assignGroup} onChange={(e) => setAssignGroup(e.target.value)} className={field}>
            <option value="">Group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <Button size="sm" className="mt-2" disabled={!assignCoach || !assignGroup} onClick={assignCoachToGroup}>
          Assign
        </Button>
      </Card>

      {/* Academy bank details */}
      <Card>
        <div className="eyebrow mb-3 text-ink/40">Academy Bank Details</div>
        <p className="mb-3 text-[12px] text-ink/50">Shared with parents for transfers.</p>
        <div className="grid grid-cols-2 gap-2">
          {(['bankName', 'accountName', 'iban', 'accountNumber'] as const).map((k) => (
            <input
              key={k}
              value={bank[k] ?? ''}
              onChange={(e) => setBank((b) => ({ ...b, [k]: e.target.value }))}
              placeholder={{
                bankName: 'Bank name',
                accountName: 'Account name',
                iban: 'IBAN',
                accountNumber: 'Account number',
              }[k]}
              className={field}
            />
          ))}
        </div>
        <Button size="sm" className="mt-3" onClick={saveBank}>Save bank details</Button>
      </Card>
    </div>
  );
}

function DeleteX({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete"
      className="flex h-5 w-5 items-center justify-center rounded-full text-ink/40 hover:bg-chip-red hover:text-danger"
    >
      ✕
    </button>
  );
}
