import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePrograms } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/lib/toast';
import { ScreenTitle, Card, Chip, Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';

// Programs — program cards + a Create Program modal (emoji, accent, description).

const ACCENTS = ['#9C1116', '#C9A84C', '#1F8A4C', '#2563EB', '#7C3AED'];

export default function AdminPrograms() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: programs = [] } = usePrograms();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏏');
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!profile || !name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('programs').insert({
        academy_id: profile.academy_id,
        name: name.trim(),
        emoji,
        accent,
        description: description.trim() || null,
      });
      if (error) throw error;
      toast.show('Program created');
      setOpen(false);
      setName('');
      setDescription('');
      qc.invalidateQueries({ queryKey: ['programs'] });
    } catch {
      toast.show('Could not create program');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="Admin" title="Programs" />
        <Button size="sm" onClick={() => setOpen(true)}>
          + Create
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {programs.map((p) => (
          <Card key={p.id} className="border-t-[3px]" style={{ borderTopColor: p.accent }}>
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-pill text-2xl"
                style={{ background: `${p.accent}1a` }}
              >
                {p.emoji}
              </span>
              <div>
                <div className="text-[15px] font-semibold">{p.name}</div>
                <Chip tone="neutral">{p.enrolled} enrolled</Chip>
              </div>
            </div>
            {p.description && <p className="mt-3 text-[12px] text-ink/55">{p.description}</p>}
          </Card>
        ))}
        {!programs.length && <Card className="text-[13px] text-ink/45">No programs yet.</Card>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Program">
        <div className="space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Elite Batting"
              className="w-full rounded-pill border border-cardborder bg-white px-4 py-2.5 text-[14px]"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Emoji">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-20 rounded-pill border border-cardborder bg-white px-4 py-2.5 text-center text-[18px]"
              />
            </Field>
            <Field label="Accent">
              <div className="flex gap-2 py-1.5">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setAccent(c)}
                    className="h-7 w-7 rounded-full ring-offset-2"
                    style={{ background: c, outline: accent === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                    aria-label={`accent ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-card border border-cardborder bg-white px-4 py-2.5 text-[14px]"
            />
          </Field>
          <Button className="w-full" disabled={saving || !name.trim()} onClick={create}>
            {saving ? 'Creating…' : 'Create Program'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">{label}</div>
      {children}
    </label>
  );
}
