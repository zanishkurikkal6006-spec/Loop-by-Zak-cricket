import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { askAcademyAI, generateDailyBrief, generateWeeklyBrief, AI_PROVIDER, type AiAnswer, type Brief } from '@/lib/aiOps';
import { academyName, platformName } from '@/lib/branding';
import { htmlToPdf, brandHeader, escapeHtml } from '@/lib/htmlPdf';
import { useToast } from '@/lib/toast';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { clsx } from '@/lib/utils';

type Tab = 'ask' | 'daily' | 'weekly';

const SUGGESTED_MGMT = [
  'Are we on track for 500 players?',
  'Why did enrolments change this month?',
  'Which players are at risk?',
  'Who should I contact today?',
  'How much outstanding money do we have?',
  'Which sessions are near capacity?',
  'Which coaches have overdue reports?',
  'Which marketing campaign performs best?',
  'What are the top churn reasons?',
  'Give me this week’s summary.',
];

const SUGGESTED_COACH = [
  'Which assessments are overdue?',
  "Which players haven't had a report recently?",
  'Whose attendance is declining?',
  'Which players have no match exposure?',
  'Which coaches have overdue reports?',
  'Which players are at risk?',
  'Which batches are near capacity?',
];

// Ask SKA AI — the AI Operations console. A question is planned into approved
// deterministic tools, run under the caller's own access (tenant-safe), then
// explained in a fixed Answer / Evidence / Why / Actions / Confidence format
// with the supporting data one tap away. Numbers are never invented.
export default function AskAI() {
  const { profile } = useAuth();
  const isCoach = profile?.role === 'head_coach';
  const [tab, setTab] = useState<Tab>('ask');
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <ScreenTitle eyebrow={`${academyName()} · AI Operations`} title="Ask SKA AI" />
        {AI_PROVIDER === 'placeholder' && <Chip tone="gold">Placeholder mode</Chip>}
      </div>
      {/* Head Coach gets the coaching-scoped assistant only (no business briefs). */}
      {!isCoach && (
        <div className="flex gap-2">
          <TabBtn active={tab === 'ask'} onClick={() => setTab('ask')}>Ask</TabBtn>
          <TabBtn active={tab === 'daily'} onClick={() => setTab('daily')}>Daily Brief</TabBtn>
          <TabBtn active={tab === 'weekly'} onClick={() => setTab('weekly')}>Director Brief</TabBtn>
        </div>
      )}
      {(tab === 'ask' || isCoach) && <AskTab isCoach={isCoach} />}
      {!isCoach && tab === 'daily' && <BriefTab kind="daily" />}
      {!isCoach && tab === 'weekly' && <BriefTab kind="weekly" />}
    </div>
  );
}

interface Turn { question: string; answer: AiAnswer; }

function AskTab({ isCoach }: { isCoach: boolean }) {
  const { profile } = useAuth();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const convId = useRef<string | null>(null);
  const suggested = isCoach ? SUGGESTED_COACH : SUGGESTED_MGMT;

  async function ask(q: string) {
    const question = q.trim();
    if (!question || !profile || loading) return;
    setInput('');
    setLoading(true);
    try {
      if (!convId.current) {
        const { data } = await supabase.from('ai_conversations')
          .insert({ academy_id: profile.academy_id, user_id: profile.id, title: question.slice(0, 60) })
          .select('id').single();
        convId.current = (data as { id: string } | null)?.id ?? null;
      }
      const answer = await askAcademyAI(question, {
        academyId: profile.academy_id, userId: profile.id, conversationId: convId.current, role: profile.role,
        previousQuestion: turns.length ? turns[turns.length - 1].question : null,
      });
      setTurns((t) => [...t, { question, answer }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-pill border border-cardborder bg-white px-3">
        <Icon name="wand" size={18} stroke="#937328" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          placeholder="Ask anything about your academy…"
          className="h-11 w-full bg-transparent text-[14px] outline-none"
        />
        <Button size="sm" disabled={!input.trim() || loading} onClick={() => ask(input)}>
          <Icon name="send" size={14} /> Ask
        </Button>
      </div>

      {!turns.length && (
        <Card>
          <div className="eyebrow mb-2 text-ink/40">Try asking</div>
          <div className="flex flex-wrap gap-2">
            {suggested.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-pill border border-cardborder bg-white px-3 py-1.5 text-[12px] font-medium text-ink/70 hover:border-gold">
                {s}
              </button>
            ))}
          </div>
        </Card>
      )}

      {loading && <Card className="animate-pulse text-[13px] text-ink/45">Analysing academy data…</Card>}

      <div className="space-y-4">
        {[...turns].reverse().map((t, i) => <AnswerBlock key={turns.length - i} turn={t} />)}
      </div>
    </div>
  );
}

function AnswerBlock({ turn }: { turn: Turn }) {
  const [showData, setShowData] = useState(false);
  const a = turn.answer;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card rounded-br-sm bg-ink px-4 py-2.5 text-[14px] text-paper">{turn.question}</div>
      </div>
      <Card className="space-y-3">
        <Section label="Answer"><p className="text-[15px] font-semibold leading-snug">{a.answer}</p></Section>
        {a.evidence.length > 0 && (
          <Section label="Evidence">
            <ul className="space-y-1">
              {a.evidence.map((e, i) => <li key={i} className="flex gap-2 text-[13px] text-ink/70"><span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-gold" />{e}</li>)}
            </ul>
          </Section>
        )}
        <Section label="Why"><p className="text-[13px] text-ink/70">{a.why}</p></Section>
        <Section label="Recommended actions">
          <ol className="space-y-1">
            {a.actions.map((x, i) => <li key={i} className="flex gap-2 text-[13px] text-ink/80"><span className="font-display text-gold-dark">{i + 1}</span>{x}</li>)}
          </ol>
        </Section>
        <div className="flex items-center justify-between border-t border-hairline pt-2">
          <span className="text-[11px] text-ink/45">{a.confidence}</span>
          <button onClick={() => setShowData((v) => !v)} className="text-[12px] font-semibold text-brand-red">
            {showData ? 'Hide' : 'View'} supporting data
          </button>
        </div>
        {showData && (
          <div className="space-y-3 rounded-card bg-hairline p-3">
            {a.tools.map((t) => (
              <div key={t.key}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold">{t.label}</span>
                  {Object.entries(t.filters).map(([k, v]) => <Chip key={k} tone="neutral">{k}: {String(v)}</Chip>)}
                </div>
                {t.rows && t.rows.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {t.rows.map((r, i) => (
                      <div key={i} className="flex justify-between text-[12px] text-ink/65"><span>{r.label}</span><span className="font-medium text-ink/85">{r.value}</span></div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BriefTab({ kind }: { kind: 'daily' | 'weekly' }) {
  const toast = useToast();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      setBrief(kind === 'daily' ? await generateDailyBrief() : await generateWeeklyBrief());
    } finally { setLoading(false); }
  }

  async function download() {
    if (!brief) return;
    const title = kind === 'daily' ? 'Daily Operations Brief' : 'Weekly Director Brief';
    const rows = brief.metrics.map((m) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(m.label)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${escapeHtml(m.value)}</td></tr>`).join('');
    const sections = (brief.sections ?? []).map((s) => `<h3 style="margin:14px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#937328">${escapeHtml(s.title)}</h3>${s.lines.map((l) => `<p style="margin:2px 0;font-size:13px;color:#333">${escapeHtml(l)}</p>`).join('')}`).join('');
    const priorities = brief.priorities.map((p, i) => `<li style="margin:3px 0;font-size:13px">${i + 1}. ${escapeHtml(p)}</li>`).join('');
    const inner = `
      ${brandHeader({ academy: academyName(), logoUrl: null, platform: platformName(), title, subtitle: new Date(brief.generatedAt).toLocaleString('en-AE') })}
      <table style="width:100%;border-collapse:collapse;margin-top:8px">${rows}</table>
      ${sections}
      <h3 style="margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#937328">Priorities</h3>
      <ol style="margin:0;padding-left:18px">${priorities}</ol>`;
    try { await htmlToPdf(inner, `${title.replace(/\s+/g, '-')}.pdf`); }
    catch (e) { toast.show(e instanceof Error ? e.message : 'PDF failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={loading} onClick={generate}>
          <Icon name="sparkles" size={14} /> {loading ? 'Generating…' : brief ? 'Regenerate' : 'Generate brief'}
        </Button>
        {brief && <Button size="sm" variant="ghost" onClick={download}><Icon name="download" size={14} /> PDF</Button>}
      </div>

      {!brief && !loading && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="wand" size={24} stroke="#C4BDB2" />
          <p className="text-[13px] text-ink/45">
            {kind === 'daily' ? "Generate today's operations brief and priorities." : "Generate this week's executive brief across the whole academy."}
          </p>
        </Card>
      )}

      {brief && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {brief.metrics.map((m) => (
              <Card key={m.label} className="flex flex-col gap-0.5">
                <div className="eyebrow text-ink/40">{m.label}</div>
                <div className="font-display text-2xl leading-none">{m.value}</div>
              </Card>
            ))}
          </div>

          {brief.sections?.map((s) => (
            <Card key={s.title}>
              <div className="eyebrow mb-1.5 text-ink/40">{s.title}</div>
              {s.lines.map((l, i) => <p key={i} className="text-[13px] text-ink/70">{l}</p>)}
            </Card>
          ))}

          <Card className="bg-brand-panel text-paper">
            <div className="eyebrow mb-2 text-gold-light">AI priorities</div>
            <ol className="space-y-1.5">
              {brief.priorities.map((p, i) => (
                <li key={i} className="flex gap-2 text-[14px]"><span className="font-display text-gold-light">{i + 1}</span>{p}</li>
              ))}
            </ol>
          </Card>
          <p className="px-1 text-[11px] text-ink/40">Generated from live academy data · {new Date(brief.generatedAt).toLocaleString('en-AE')}</p>
        </>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-eyebrow text-gold-dark">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('rounded-pill px-3 py-1.5 text-[12px] font-semibold transition', active ? 'bg-brand-red text-paper' : 'border border-cardborder bg-white text-ink/60')}>
      {children}
    </button>
  );
}
