import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMyGroups, usePlayers } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { generateReport } from '@/lib/ai';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { firstName, clsx } from '@/lib/utils';
import { LoopRing } from '@/components/brand/LoopRing';
import { Button, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import type { Player } from '@/lib/types';

// Report A — per-session quick feedback. Coach-triggered (nothing auto-fires):
// pick player → 2–3 rough words → AI expands into a warm message addressed to
// the child by first name → edit + live WhatsApp preview → Rewrite / Send.
type Step = 'pick' | 'notes' | 'generating' | 'draft' | 'sent';

export default function CoachReports() {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: groups = [] } = useMyGroups();
  const groupIds = groups.map((g) => g.id);
  const { data: players = [] } = usePlayers(groupIds.length ? groupIds : undefined);

  const [step, setStep] = useState<Step>('pick');
  const [player, setPlayer] = useState<Player | null>(null);
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState('');

  async function runGenerate(rewrite = false) {
    if (!player) return;
    setStep('generating');
    try {
      const text = await generateReport({
        type: 'quick',
        childFirstName: firstName(player.full_name),
        coachName: profile?.full_name,
        notes,
        rewrite,
      });
      setDraft(text);
      setStep('draft');
    } catch {
      toast.show('Could not generate — try again');
      setStep('notes');
    }
  }

  async function send() {
    if (!player || !profile) return;
    // Persist the report, then open WhatsApp pre-filled.
    const { error } = await supabase.from('reports').insert({
      academy_id: profile.academy_id,
      player_id: player.id,
      coach_id: profile.id,
      type: 'quick',
      raw_notes: notes,
      ai_draft: draft,
      final_text: draft,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });
    if (error) {
      toast.show('Could not save report');
      return;
    }
    if (player.parent_phone) {
      await sendWhatsApp(
        player.parent_phone,
        templates.reportSent(firstName(player.full_name), draft),
        { academyId: profile.academy_id, playerId: player.id, templateKey: 'reportSent' },
      );
    }
    queryClient.invalidateQueries({ queryKey: ['reports'] });
    setStep('sent');
  }

  function reset() {
    setStep('pick');
    setPlayer(null);
    setNotes('');
    setDraft('');
  }

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Coach · AI" title="Quick Feedback" />

      {/* Step 1 — pick a player */}
      {step === 'pick' && (
        <>
          <div className="text-[13px] text-ink/55">
            Pick a player, jot 2–3 words, and we'll expand it into a warm message addressed to{' '}
            them by name.
          </div>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPlayer(p);
                  setStep('notes');
                }}
                className="rounded-pill border border-cardborder bg-white px-4 py-2 text-[13px] font-medium hover:border-gold"
              >
                {p.full_name}
              </button>
            ))}
            {!players.length && (
              <div className="text-[13px] text-ink/45">No players in your groups yet.</div>
            )}
          </div>
        </>
      )}

      {/* Step 2 — rough notes */}
      {step === 'notes' && player && (
        <>
          <div className="eyebrow">For {player.full_name}</div>
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. great cover drive, focused, listened well"
            className="h-32 w-full rounded-card border border-cardborder bg-white p-4 text-[15px] outline-none focus:border-gold"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Back
            </Button>
            <Button className="flex-1" disabled={!notes.trim()} onClick={() => runGenerate()}>
              Generate with AI
            </Button>
          </div>
        </>
      )}

      {/* Step 3 — generating (spinning loop ring) */}
      {step === 'generating' && (
        <div className="card flex h-64 flex-col items-center justify-center gap-4">
          <LoopRing size={64} className="animate-spin" />
          <div className="text-[13px] text-ink/55">Writing a personal message…</div>
        </div>
      )}

      {/* Step 4 — editable draft + live WhatsApp preview */}
      {step === 'draft' && player && (
        <>
          <div className="eyebrow">Draft for {player.full_name}'s parent</div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-40 w-full rounded-card border border-cardborder bg-white p-4 text-[15px] outline-none focus:border-gold"
          />
          {/* WhatsApp preview bubble */}
          <div className="rounded-card bg-[#075E54] p-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
              <Icon name="whatsapp" size={13} stroke="#25D366" /> WhatsApp preview
            </div>
            <div className="whitespace-pre-wrap rounded-xl rounded-tl-none bg-[#dcf8c6] p-3 text-[13.5px] text-ink">
              {templates.reportSent(firstName(player.full_name), draft)}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => runGenerate(true)}>
              Rewrite
            </Button>
            <Button variant="whatsapp" className="flex-1" onClick={send}>
              <Icon name="whatsapp" size={16} /> Send to Parent
            </Button>
          </div>
        </>
      )}

      {/* Step 5 — sent confirmation */}
      {step === 'sent' && (
        <div className="card flex h-64 flex-col items-center justify-center gap-4">
          <div
            className={clsx(
              'flex h-16 w-16 items-center justify-center rounded-full bg-chip-green text-3xl',
            )}
          >
            ✓
          </div>
          <div className="text-[15px] font-semibold">Sent to parent</div>
          <Button variant="ghost" onClick={reset}>
            Write another
          </Button>
        </div>
      )}
    </div>
  );
}
