import { useState } from 'react';
import { useMyGroups, usePlayers, useMyOneToOneBlocks } from '@/lib/queries';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { generateReport } from '@/lib/ai';
import { sendWhatsApp } from '@/lib/whatsapp';
import { downloadAssessmentPdf, ASSESSMENT_SKILLS } from '@/lib/assessmentPdf';
import { firstName, clsx } from '@/lib/utils';
import { Button, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import type { Player } from '@/lib/types';

// 3-Month Skill Assessment — a structured, branded report (skill ratings 1–5 +
// comments + narrative sections + photos + video link). AI can draft the
// written sections so coaches barely type.
type Ratings = Record<string, { rating: number; comment: string }>;

export default function SkillAssessment() {
  const { profile } = useAuth();
  const toast = useToast();
  const { data: groups = [] } = useMyGroups();
  const groupIds = groups.map((g) => g.id);
  const { data: players = [] } = usePlayers(groupIds.length ? groupIds : undefined);
  const { data: blocks = [] } = useMyOneToOneBlocks();

  const [player, setPlayer] = useState<Player | null>(null);
  const [groupFilter, setGroupFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ratings, setRatings] = useState<Ratings>({});
  const [strengths, setStrengths] = useState('');
  const [areas, setAreas] = useState('');
  const [coachComments, setCoachComments] = useState('');
  const [goals, setGoals] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1-on-1 players (may not be in a group)
  const oneToOneIds = new Set<string>();
  const pool = new Map<string, Player>();
  for (const p of players) pool.set(p.id, p);
  for (const b of blocks) if (b.player) { pool.set(b.player.id, b.player); oneToOneIds.add(b.player.id); }
  const allPlayers = [...pool.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const visible = allPlayers.filter((p) => {
    if (groupFilter === 'one_to_one') { if (!oneToOneIds.has(p.id)) return false; }
    else if (groupFilter !== 'all') { if (p.group_id !== groupFilter) return false; }
    return p.full_name.toLowerCase().includes(search.toLowerCase());
  });
  const groupName = (p: Player | null) => groups.find((g) => g.id === p?.group_id)?.name ?? null;

  function setRating(key: string, rating: number) {
    setRatings((r) => ({ ...r, [key]: { rating, comment: r[key]?.comment ?? '' } }));
  }
  function setComment(key: string, comment: string) {
    setRatings((r) => ({ ...r, [key]: { rating: r[key]?.rating ?? 0, comment } }));
  }

  function reset() {
    setPlayer(null);
    setRatings({});
    setStrengths('');
    setAreas('');
    setCoachComments('');
    setGoals('');
    setVideoUrl('');
    setPhotos([]);
    setSearch('');
  }

  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - photos.length);
    for (const f of files) {
      const dataUrl = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(f);
      });
      setPhotos((p) => [...p, dataUrl]);
    }
    e.target.value = '';
  }

  // AI drafts the written sections from a development summary.
  async function aiDraft() {
    if (!player) return;
    setAiBusy(true);
    try {
      const text = await generateReport({
        type: 'development',
        childFirstName: firstName(player.full_name),
        coachName: profile?.full_name,
        groupName: groupName(player) ?? undefined,
        focusAreas: areas,
      });
      const sec = parseSections(text);
      if (sec['PROGRESS & STRENGTHS']) setStrengths(sec['PROGRESS & STRENGTHS']);
      if (sec['WHAT TO WORK ON NEXT']) setAreas(sec['WHAT TO WORK ON NEXT']);
      if (sec["COACH'S NOTE"]) setCoachComments(sec["COACH'S NOTE"]);
      if (sec['FOCUS AREAS THIS BLOCK']) setGoals(`Keep building on: ${sec['FOCUS AREAS THIS BLOCK']}`);
      toast.show('AI draft added — edit as you like');
    } catch {
      toast.show('Could not draft — try again');
    } finally {
      setAiBusy(false);
    }
  }

  function pdfData() {
    return {
      childName: player!.full_name,
      age: player!.age,
      groupName: groupName(player),
      coachName: profile?.full_name,
      academyName: 'Loop by Zak Cricket',
      date,
      ratings,
      strengths,
      areas,
      coachComments,
      goals,
      videoUrl,
      photos,
    };
  }

  async function save() {
    if (!profile || !player) return;
    setSaving(true);
    try {
      await supabase.from('assessments').insert({
        academy_id: profile.academy_id,
        player_id: player.id,
        coach_id: profile.id,
        assessment_date: date,
        ratings,
        strengths: strengths || null,
        areas: areas || null,
        coach_comments: coachComments || null,
        goals: goals || null,
        video_url: videoUrl || null,
      });
      toast.show('Assessment saved');
    } catch {
      toast.show('Could not save (run migration 0011?)');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-card border border-cardborder bg-white p-3 text-[14px] outline-none focus:border-gold';

  // ── Player pick ────────────────────────────────────────────────────────────
  if (!player) {
    return (
      <div className="space-y-5">
        <ScreenTitle eyebrow="Coach · AI" title="Skill Assessment" />
        <p className="text-[13px] text-ink/55">Pick a player to create their 3-month skill assessment.</p>
        {(groups.length > 1 || oneToOneIds.size > 0) && (
          <div className="flex flex-wrap gap-2">
            <Pill active={groupFilter === 'all'} onClick={() => setGroupFilter('all')}>All</Pill>
            {groups.map((g) => (
              <Pill key={g.id} active={groupFilter === g.id} onClick={() => setGroupFilter(g.id)}>{g.name}</Pill>
            ))}
            {oneToOneIds.size > 0 && (
              <Pill active={groupFilter === 'one_to_one'} onClick={() => setGroupFilter('one_to_one')}>1-on-1</Pill>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
          <Icon name="search" size={16} stroke="#9A938A" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="h-10 w-full bg-transparent text-[14px] outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          {visible.map((p) => (
            <button key={p.id} onClick={() => setPlayer(p)} className="rounded-pill border border-cardborder bg-white px-4 py-2 text-[13px] font-medium hover:border-gold">
              {p.full_name}
            </button>
          ))}
          {!visible.length && <div className="text-[13px] text-ink/45">No players found.</div>}
        </div>
      </div>
    );
  }

  // ── Assessment form ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow="3-Month Assessment" title={player.full_name} />
        <Button size="sm" variant="ghost" onClick={reset}>Change player</Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px]">
          <span className="mb-1 block text-ink/45">Assessment date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]" />
        </label>
        <div className="text-[12px]">
          <span className="mb-1 block text-ink/45">Player</span>
          <div className="flex h-11 items-center rounded-pill border border-cardborder bg-white px-3 text-[14px]">
            {groupName(player) ?? '1-on-1'}{player.age ? ` · Age ${player.age}` : ''}
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="space-y-2">
        <div className="eyebrow text-ink/40">Skill assessment (rate 1–5)</div>
        {ASSESSMENT_SKILLS.map((sk) => (
          <div key={sk.key} className="rounded-card border border-cardborder bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{sk.label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(sk.key, n)}
                    className={clsx(
                      'h-7 w-7 rounded-full text-[12px] font-semibold transition',
                      (ratings[sk.key]?.rating ?? 0) >= n ? 'bg-gold text-ink' : 'border border-cardborder bg-white text-ink/40',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={ratings[sk.key]?.comment ?? ''}
              onChange={(e) => setComment(sk.key, e.target.value)}
              placeholder="Comment (optional)"
              className="mt-2 h-9 w-full rounded-chip border border-cardborder bg-white px-3 text-[12px] outline-none focus:border-gold"
            />
          </div>
        ))}
      </div>

      {/* Narrative + AI */}
      <div className="flex items-center justify-between">
        <div className="eyebrow text-ink/40">Written sections</div>
        <Button size="sm" variant="gold" disabled={aiBusy} onClick={aiDraft}>
          {aiBusy ? 'Drafting…' : '✨ AI draft'}
        </Button>
      </div>
      <Labelled label="Strengths"><textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} className={field} /></Labelled>
      <Labelled label="Areas to improve"><textarea value={areas} onChange={(e) => setAreas(e.target.value)} rows={2} className={field} /></Labelled>
      <Labelled label="Coach's comments"><textarea value={coachComments} onChange={(e) => setCoachComments(e.target.value)} rows={2} className={field} /></Labelled>
      <Labelled label="Next 3-month goals"><textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={2} className={field} /></Labelled>

      {/* Media */}
      <Labelled label="Session video link (optional)">
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" className="h-11 w-full rounded-pill border border-cardborder bg-white px-3 text-[14px]" />
      </Labelled>
      <Labelled label="Session photos (optional)">
        <div className="flex flex-wrap items-center gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="h-16 w-16 rounded-card object-cover" />
              <button onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-paper">✕</button>
            </div>
          ))}
          {photos.length < 6 && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-card border border-dashed border-cardborder text-[11px] text-ink/45">
              + Photo
              <input type="file" accept="image/*" multiple onChange={onPhotos} className="hidden" />
            </label>
          )}
        </div>
      </Labelled>

      {/* Actions */}
      <div className="sticky bottom-20 flex gap-2 md:bottom-4">
        <Button variant="ghost" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button className="flex-1" onClick={() => downloadAssessmentPdf(pdfData())}>
          <Icon name="download" size={15} /> Download report
        </Button>
        {player.parent_phone && (
          <Button
            variant="whatsapp"
            onClick={() => {
              if (!profile || !player.parent_phone) return;
              sendWhatsApp(
                player.parent_phone,
                `Hi! Here's ${firstName(player.full_name)}'s 3-month skill assessment from Loop by Zak Cricket. (Coach will attach the report.)${videoUrl ? `\nSession video: ${videoUrl}` : ''}`,
                { academyId: profile.academy_id, playerId: player.id, templateKey: 'assessment' },
              );
            }}
          >
            <Icon name="whatsapp" size={15} />
          </Button>
        )}
      </div>
      <p className="text-[11px] text-ink/45">Download the report, then attach it (and photos) in WhatsApp to the parent. Saved assessments keep the ratings &amp; notes for next time.</p>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('rounded-pill px-3 py-1.5 text-[12px] font-semibold transition', active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')}>
      {children}
    </button>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-eyebrow text-ink/40">{label}</span>
      {children}
    </label>
  );
}

// Parse UPPERCASE-headed sections from the AI development text.
function parseSections(text: string): Record<string, string> {
  const isHeading = (l: string) => {
    const t = l.trim();
    return t.length > 0 && t.length <= 40 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/[a-z]/.test(t);
  };
  const out: Record<string, string> = {};
  let cur = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) { cur = line; out[cur] = ''; }
    else if (cur) out[cur] = (out[cur] ? out[cur] + ' ' : '') + line;
  }
  return out;
}
