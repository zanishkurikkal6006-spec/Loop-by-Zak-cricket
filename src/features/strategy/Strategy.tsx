import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { computeGrowthForecast, runScenario, type GrowthForecast } from '@/lib/forecast';
import { computeExpansion } from '@/lib/expansion';
import { generateMonthlyReview } from '@/lib/aiOps';
import { academyName, platformName } from '@/lib/branding';
import { htmlToPdf, brandHeader, escapeHtml } from '@/lib/htmlPdf';
import type { Brief } from '@/lib/aiOps';
import { useToast } from '@/lib/toast';
import { clsx } from '@/lib/utils';
import { Button, Card, Chip, ScreenTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';

type Tab = 'plan' | 'scenario' | 'expansion' | 'mbr';

// Strategy — the 500-player plan, deterministic forecasting, a scenario planner
// (clearly labelled, never a forecast), area-level expansion signals, and the
// AI Monthly Business Review. Every number is computed; assumptions are shown.
export default function Strategy() {
  const [tab, setTab] = useState<Tab>('plan');
  const forecast = useQuery({ queryKey: ['forecast'], queryFn: computeGrowthForecast });

  return (
    <div className="space-y-5">
      <ScreenTitle eyebrow="Management" title="Strategy" />
      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'plan'} onClick={() => setTab('plan')}>500 Plan &amp; Forecast</TabBtn>
        <TabBtn active={tab === 'scenario'} onClick={() => setTab('scenario')}>Scenario Planner</TabBtn>
        <TabBtn active={tab === 'expansion'} onClick={() => setTab('expansion')}>Expansion</TabBtn>
        <TabBtn active={tab === 'mbr'} onClick={() => setTab('mbr')}>Monthly Review</TabBtn>
      </div>
      {tab === 'plan' && <PlanTab f={forecast.data} loading={forecast.isLoading} />}
      {tab === 'scenario' && <ScenarioTab f={forecast.data} />}
      {tab === 'expansion' && <ExpansionTab />}
      {tab === 'mbr' && <MbrTab />}
    </div>
  );
}

function PlanTab({ f, loading }: { f?: GrowthForecast; loading: boolean }) {
  const series = useMemo(() => {
    if (!f) return [];
    const hist = f.history.map((h) => ({ name: h.label, Actual: h.actual, Target: h.target }));
    const proj = f.projection.slice(0, 9).map((p) => ({ name: `+${p.month - f.monthsSinceLaunch}mo`, Projected: p.projected, Target: p.target }));
    return [...hist, ...proj];
  }, [f]);

  if (loading || !f) return <Card className="text-[13px] text-ink/45">Computing forecast…</Card>;

  return (
    <div className="space-y-4">
      {f.dataThin && (
        <Card className="border-amber-text/40 text-[13px] text-amber-text">
          Limited history recorded — the forecast will sharpen as more enrolments and exits are logged.
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Active now" value={String(f.current)} />
        <Tile label="Plan target" value={String(f.targetNow)} tone={f.onTrackDelta >= 0 ? 'green' : 'red'} hint={`${f.onTrackDelta >= 0 ? 'ahead' : 'behind'} by ${Math.abs(f.onTrackDelta)}`} />
        <Tile label="Net growth /mo" value={`${f.net >= 0 ? '+' : ''}${f.net}`} tone={f.net > 0 ? 'green' : 'red'} />
        <Tile label="Reach 500" value={f.reachDate ?? '—'} hint={f.reachMonthsTo500 != null ? `~${f.reachMonthsTo500} months` : 'not at current rate'} />
      </div>

      <Card>
        <div className="eyebrow mb-3 text-ink/40">Active players — actual vs plan, with projection</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series} margin={{ left: -18, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#F0EAE2" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B6660' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6B6660' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #ECE7E1', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Actual" stroke="#14387F" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="Projected" stroke="#FFC72C" strokeWidth={2.5} strokeDasharray="5 4" dot={false} />
            <Line type="monotone" dataKey="Target" stroke="#8B8680" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <div className="eyebrow mb-2 text-ink/40">Assumptions</div>
        <ul className="space-y-1">
          {f.assumptions.map((a, i) => <li key={i} className="flex gap-2 text-[12.5px] text-ink/65"><span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-gold" />{a}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function ScenarioTab({ f }: { f?: GrowthForecast }) {
  const [enrol, setEnrol] = useState(3);
  const [retention, setRetention] = useState(20);
  const [capacity, setCapacity] = useState(0);
  if (!f) return <Card className="text-[13px] text-ink/45">Computing base forecast…</Card>;
  const s = runScenario(f, { extraEnrolPerMonth: enrol, exitReductionPct: retention, capacityAddPerMonth: capacity });

  return (
    <div className="space-y-4">
      <div className="rounded-pill bg-chip-gold px-4 py-2 text-center text-[12px] font-semibold uppercase tracking-eyebrow text-gold-dark">
        Scenario — not a forecast
      </div>

      <Card className="space-y-4">
        <Slider label="Extra enrolments / month" value={enrol} min={0} max={20} onChange={setEnrol} suffix="/mo" />
        <Slider label="Retention improvement" value={retention} min={0} max={80} onChange={setRetention} suffix="% fewer exits" />
        <Slider label="Added capacity headroom" value={capacity} min={0} max={20} onChange={setCapacity} suffix="/mo" />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-1">
          <div className="eyebrow text-ink/40">Base (current rate)</div>
          <div className="font-display text-3xl leading-none">+{s.baseNet}<span className="text-base text-ink/40">/mo</span></div>
          <div className="text-[12px] text-ink/55">{s.base12} players in 12 mo · reach 500 in {s.reachBase != null ? `${s.reachBase} mo` : '—'}</div>
        </Card>
        <Card className="space-y-1 border-gold/60 bg-gold-light/10">
          <div className="eyebrow text-gold-dark">Scenario</div>
          <div className="font-display text-3xl leading-none text-gold-dark">+{s.scenarioNet}<span className="text-base text-ink/40">/mo</span></div>
          <div className="text-[12px] text-ink/55">{s.scenario12} players in 12 mo · reach 500 in {s.reachScenario != null ? `${s.reachScenario} mo` : '—'}</div>
        </Card>
      </div>

      <Card>
        <div className="eyebrow mb-2 text-ink/40">Assumptions</div>
        <ul className="space-y-1">
          {s.assumptions.map((a, i) => <li key={i} className="flex gap-2 text-[12.5px] text-ink/65"><span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-gold" />{a}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function ExpansionTab() {
  const { data, isLoading } = useQuery({ queryKey: ['expansion'], queryFn: computeExpansion });
  if (isLoading || !data) return <Card className="text-[13px] text-ink/45">Analysing area demand…</Card>;

  return (
    <div className="space-y-4">
      <Card className="border-info/30 text-[13px] text-info">
        These are areas to <b>investigate</b> for a future centre — not a site decision. Coverage: {data.covered}% of records have an area recorded.
      </Card>

      {data.areas.slice(0, 6).map((a) => (
        <Card key={a.area} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold">{a.area}</div>
            <Chip tone={a.score > 8 ? 'green' : a.score > 3 ? 'gold' : 'neutral'}>Demand {a.score}</Chip>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Mini label="Players" value={a.activePlayers} />
            <Mini label="Leads" value={a.leads} />
            <Mini label="Lost" value={a.lostLeads} />
            <Mini label="Distance" value={a.distanceObjections} />
          </div>
          {a.schoolPotential > 0 && <div className="text-[12px] text-ink/55">School pipeline: ~{a.schoolPotential} potential students</div>}
          {a.risks.map((r, i) => <div key={i} className="flex items-center gap-1.5 text-[12px] text-amber-text"><Icon name="alert" size={12} stroke="currentColor" />{r}</div>)}
        </Card>
      ))}
      {!data.areas.length && <Card className="text-[13px] text-ink/45">No area data recorded yet.</Card>}

      {data.missingData.length > 0 && (
        <Card>
          <div className="eyebrow mb-2 text-ink/40">Missing data to strengthen this</div>
          <ul className="space-y-1">
            {data.missingData.map((m, i) => <li key={i} className="flex gap-2 text-[12.5px] text-ink/65"><span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-danger" />{m}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MbrTab() {
  const toast = useToast();
  const [mbr, setMbr] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try { setMbr(await generateMonthlyReview()); }
    catch (e) { toast.show(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }

  async function download() {
    if (!mbr) return;
    const rows = mbr.metrics.map((m) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(m.label)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${escapeHtml(m.value)}</td></tr>`).join('');
    const sections = (mbr.sections ?? []).map((s) => `<h3 style="margin:14px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#937328">${escapeHtml(s.title)}</h3>${s.lines.map((l) => `<p style="margin:2px 0;font-size:13px;color:#333">${escapeHtml(l)}</p>`).join('')}`).join('');
    const pr = mbr.priorities.map((p, i) => `<li style="margin:3px 0;font-size:13px">${i + 1}. ${escapeHtml(p)}</li>`).join('');
    const inner = `${brandHeader({ academy: academyName(), logoUrl: null, platform: platformName(), title: 'Monthly Business Review', subtitle: new Date(mbr.generatedAt).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) })}
      <table style="width:100%;border-collapse:collapse;margin-top:8px">${rows}</table>${sections}
      <h3 style="margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#937328">Recommended decisions</h3><ol style="margin:0;padding-left:18px">${pr}</ol>`;
    try { await htmlToPdf(inner, 'Monthly-Business-Review.pdf'); }
    catch (e) { toast.show(e instanceof Error ? e.message : 'PDF failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={loading} onClick={generate}><Icon name="sparkles" size={14} /> {loading ? 'Generating…' : mbr ? 'Regenerate' : 'Generate MBR'}</Button>
        {mbr && <Button size="sm" variant="ghost" onClick={download}><Icon name="download" size={14} /> PDF</Button>}
      </div>
      {!mbr && !loading && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="compass" size={24} stroke="#C4BDB2" />
          <p className="text-[13px] text-ink/45">Generate a management-ready Monthly Business Review across the whole academy.</p>
        </Card>
      )}
      {mbr && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {mbr.metrics.map((m) => (
              <Card key={m.label} className="flex flex-col gap-0.5"><div className="eyebrow text-ink/40">{m.label}</div><div className="font-display text-2xl leading-none">{m.value}</div></Card>
            ))}
          </div>
          {mbr.sections?.map((s) => (
            <Card key={s.title}><div className="eyebrow mb-1.5 text-ink/40">{s.title}</div>{s.lines.map((l, i) => <p key={i} className="text-[13px] text-ink/70">{l}</p>)}</Card>
          ))}
          <Card className="bg-brand-panel text-paper">
            <div className="eyebrow mb-2 text-gold-light">Recommended decisions</div>
            <ol className="space-y-1.5">{mbr.priorities.map((p, i) => <li key={i} className="flex gap-2 text-[14px]"><span className="font-display text-gold-light">{i + 1}</span>{p}</li>)}</ol>
          </Card>
          <p className="px-1 text-[11px] text-ink/40">Generated from live academy data · {new Date(mbr.generatedAt).toLocaleString('en-AE')} · {academyName()}</p>
        </>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, onChange, suffix }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-eyebrow text-ink/40">{label}</span>
        <span className="text-[13px] font-semibold text-ink">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-red" />
    </label>
  );
}

function Tile({ label, value, tone, hint }: { label: string; value: string; tone?: 'green' | 'red'; hint?: string }) {
  return (
    <Card className="flex flex-col gap-0.5">
      <div className="eyebrow text-ink/40">{label}</div>
      <div className={clsx('font-display text-2xl leading-none', tone === 'green' && 'text-success', tone === 'red' && 'text-danger')}>{value}</div>
      {hint && <div className="text-[11px] text-ink/45">{hint}</div>}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-chip bg-hairline py-1.5">
      <div className="font-display text-lg leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-eyebrow text-ink/40">{label}</div>
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
