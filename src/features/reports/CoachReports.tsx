import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMyGroups, usePlayers, useMyOneToOneBlocks } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { generateReport } from '@/lib/ai';
import { downloadReportPdf } from '@/lib/reportPdf';
import { sendWhatsApp, templates } from '@/lib/whatsapp';
import { firstName, clsx } from '@/lib/utils';
import { LoopRing } from '@/components/brand/LoopRing';
import { Button, ScreenTitle, Chip } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import type { Player } from '@/lib/types';

// Two-tier coach-triggered reports (nothing auto-fires):
//  • Quick      — per-session feedback: 2–3 words → warm message by first name.
//  • Development — end-of-block report in the branded template.
// Both expand via generateReport() (placeholder today, real AI later — one swap).
// 3 regenerations max; manual editing is always free.
type Mode = 'quick' | 'development';
type Step = 'pick' | 'notes' | 'generating' | 'draft' | 'sent';

const MAX_REGENS = 3;

export default function CoachReports() {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: groups = [] } = useMyGroups();
  const groupIds = groups.map((g) => g.id);
  const { data: players = [] } = usePlayers(groupIds.length ? groupIds : undefined);
  // 1-on-1 players — may not be in any group (e.g. adults / kids who only do
  // one-on-one), so include them so they can get development reports too.
  const { data: blocks = [] } = useMyOneToOneBlocks();

  const [mode, setMode] = useState<Mode>('quick');
  const [step, setStep] = useState<Step>('pick');
  const [player, setPlayer] = useState<Player | null>(null);
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState('');
  const [regens, setRegens] = useState(0); // rewrites used after the first generation
  const [groupFilter, setGroupFilter] = useState<string>('all'); // pick-step batch filter
  const [playerSearch, setPlayerSearch] = useState('');

  // Distinct 1-on-1 players from this coach's blocks.
  const oneToOnePlayers: Player[] = [];
  const oneToOneIds = new Set<string>();
  for (const b of blocks) {
    if (b.player && !oneToOneIds.has(b.player.id)) {
      oneToOneIds.add(b.player.id);
      oneToOnePlayers.push(b.player);
    }
  }
  // Combined, de-duplicated pool: group players + 1-on-1 players.
  const poolMap = new Map<string, Player>();
  for (const p of players) poolMap.set(p.id, p);
  for (const p of oneToOnePlayers) poolMap.set(p.id, p);
  const pool = [...poolMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));

  // Narrow the picker by group/batch (or 1-on-1) + name so a coach with many
  // players isn't scrolling a huge flat list to find one.
  const visiblePlayers = pool.filter((p) => {
    if (groupFilter === 'one_to_one') {
      if (!oneToOneIds.has(p.id)) return false;
    } else if (groupFilter !== 'all') {
      if (p.group_id !== groupFilter) return false;
    }
    return p.full_name.toLowerCase().includes(playerSearch.toLowerCase());
  });

  const groupName = (p: Player | null) =>
    groups.find((g) => g.id === p?.group_id)?.name ?? undefined;

  async function runGenerate(rewrite = false) {
    if (!player) return;
    if (rewrite && regens >= MAX_REGENS) return; // enforce the regeneration cap
    setStep('generating');
    try {
      const text = await generateReport(
        mode === 'quick'
          ? {
              type: 'quick',
              childFirstName: firstName(player.full_name),
              coachName: profile?.full_name,
              notes,
              rewrite,
            }
          : {
              type: 'development',
              childFirstName: firstName(player.full_name),
              coachName: profile?.full_name,
              groupName: groupName(player),
              focusAreas: notes,
              rewrite,
            },
      );
      setDraft(text);
      setRegens((n) => (rewrite ? n + 1 : 0)); // first generation resets the counter
      setStep('draft');
    } catch {
      toast.show('Could not generate — try again');
      setStep('notes');
    }
  }

  async function send() {
    if (!player || !profile) return;
    const { error } = await supabase.from('reports').insert({
      academy_id: profile.academy_id,
      player_id: player.id,
      coach_id: profile.id,
      type: mode,
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
    setRegens(0);
    setPlayerSearch('');
  }

  const isDev = mode === 'development';
  const regensLeft = MAX_REGENS - regens;

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Coach · AI" title={isDev ? 'Development Report' : 'Quick Feedback'} />

      {/* Quick / Development toggle */}
      {step === 'pick' && (
        <div className="flex gap-2">
          {(['quick', 'development'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                'flex-1 rounded-chip px-3 py-2 text-[12px] font-semibold transition',
                mode === m ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
              )}
            >
              {m === 'quick' ? 'Quick feedback' : 'End-of-block report'}
            </button>
          ))}
        </div>
      )}

      {/* Step 1 — pick a player */}
      {step === 'pick' && (
        <>
          <div className="text-[13px] text-ink/55">
            {isDev
              ? 'Pick a player who finished a block to create a full development report.'
              : "Pick a player, jot 2–3 words, and we'll expand it into a warm message addressed to them by name."}
          </div>
          {/* Group/batch (+ 1-on-1) filter chips */}
          {(groups.length > 1 || oneToOnePlayers.length > 0) && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setGroupFilter('all')}
                className={clsx(
                  'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition',
                  groupFilter === 'all' ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
                )}
              >
                All
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGroupFilter(g.id)}
                  className={clsx(
                    'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition',
                    groupFilter === g.id ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
                  )}
                >
                  {g.name}
                </button>
              ))}
              {oneToOnePlayers.length > 0 && (
                <button
                  onClick={() => setGroupFilter('one_to_one')}
                  className={clsx(
                    'rounded-pill px-3 py-1.5 text-[12px] font-semibold transition',
                    groupFilter === 'one_to_one' ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60',
                  )}
                >
                  1-on-1
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
            <Icon name="search" size={16} stroke="#9A938A" />
            <input
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players…"
              className="h-10 w-full bg-transparent text-[14px] outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {visiblePlayers.map((p) => (
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
            {!visiblePlayers.length && (
              <div className="text-[13px] text-ink/45">
                {players.length ? 'No players match.' : 'No players in your groups yet.'}
              </div>
            )}
          </div>
        </>
      )}

      {/* Step 2 — notes (quick) / focus areas (development, optional) */}
      {step === 'notes' && player && (
        <>
          <div className="eyebrow">For {player.full_name}</div>
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isDev
                ? 'Optional: focus areas this block (e.g. front-foot drives, game awareness)'
                : 'e.g. great cover drive, focused, listened well'
            }
            className="h-32 w-full rounded-card border border-cardborder bg-white p-4 text-[15px] outline-none focus:border-gold"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={!isDev && !notes.trim()}
              onClick={() => runGenerate()}
            >
              {isDev ? 'Create Development Report' : 'Generate with AI'}
            </Button>
          </div>
        </>
      )}

      {/* Step 3 — generating (spinning loop ring) */}
      {step === 'generating' && (
        <div className="card flex h-64 flex-col items-center justify-center gap-4">
          <LoopRing size={64} className="animate-spin" />
          <div className="text-[13px] text-ink/55">
            {isDev ? 'Writing the development report…' : 'Writing a personal message…'}
          </div>
        </div>
      )}

      {/* Step 4 — editable draft + live WhatsApp preview */}
      {step === 'draft' && player && (
        <>
          <div className="flex items-center justify-between">
            <div className="eyebrow">Draft for {player.full_name}'s parent</div>
            <Chip tone={regensLeft > 0 ? 'neutral' : 'amber'}>
              {regensLeft > 0 ? `${regensLeft} rewrite${regensLeft === 1 ? '' : 's'} left` : 'Rewrite limit reached'}
            </Chip>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={clsx(
              'w-full rounded-card border border-cardborder bg-white p-4 text-[15px] outline-none focus:border-gold',
              isDev ? 'h-72 font-mono text-[13px]' : 'h-40',
            )}
          />
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-ink/45">Edit freely above — your changes are kept.</div>
            <button
              onClick={() =>
                downloadReportPdf({
                  kind: mode,
                  childName: player.full_name,
                  groupName: groupName(player),
                  coachName: profile?.full_name,
                  academyName: 'Loop by Zak Cricket',
                  date: new Date().toISOString().slice(0, 10),
                  body: draft,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-pill border border-cardborder bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-red hover:border-gold"
            >
              <Icon name="download" size={14} stroke="#9C1116" /> Download PDF
            </button>
          </div>
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
            <Button
              variant="ghost"
              disabled={regens >= MAX_REGENS}
              onClick={() => runGenerate(true)}
            >
              {regens >= MAX_REGENS ? 'No rewrites left' : 'Rewrite'}
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chip-green text-3xl">
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
