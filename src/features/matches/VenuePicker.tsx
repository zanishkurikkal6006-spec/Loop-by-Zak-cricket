import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';

// Venue / ground picker with inline "add new ground". Grounds are stored as
// training_centers, so anything added here also appears in Payments → Settings →
// Training Centers and the ground-fee booking flow. RLS lets coaches add too, so
// a coach can add a ground on the fly when logging a match at a new venue.
export default function VenuePicker({
  value,
  onChange,
  enabled = true,
}: {
  value: string;
  onChange: (id: string) => void;
  enabled?: boolean;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: venues = [] } = useQuery({
    queryKey: ['venues', profile?.academy_id],
    enabled: !!profile && enabled,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data } = await supabase.from('training_centers').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  async function addGround() {
    if (!profile || !newName.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('training_centers')
        .insert({ academy_id: profile.academy_id, name: newName.trim() })
        .select('id, name')
        .single();
      if (error) throw error;
      // Refresh every list that shows centres/venues.
      qc.invalidateQueries({ queryKey: ['venues'] });
      qc.invalidateQueries({ queryKey: ['centers'] });
      qc.invalidateQueries({ queryKey: ['centers-list'] });
      qc.invalidateQueries({ queryKey: ['settings-centers'] });
      onChange(data.id);
      setNewName('');
      setAdding(false);
      toast.show('Ground added');
    } catch {
      toast.show('Could not add ground');
    } finally {
      setSaving(false);
    }
  }

  const field =
    'h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px] outline-none focus:border-gold';

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
          <option value="">Venue / ground…</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="shrink-0 rounded-pill border border-cardborder bg-white px-3 text-[12px] font-semibold text-brand-red"
        >
          {adding ? 'Cancel' : '+ New'}
        </button>
      </div>
      {adding && (
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New ground name (e.g. ICC Academy)"
            className={field}
          />
          <button
            type="button"
            onClick={addGround}
            disabled={saving || !newName.trim()}
            className="shrink-0 rounded-pill bg-brand-red px-4 text-[12px] font-semibold text-paper disabled:opacity-40"
          >
            {saving ? '…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
}
