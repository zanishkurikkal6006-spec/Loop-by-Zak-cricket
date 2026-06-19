import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMyGroups, useMyOneToOneBlocks, useMyReports } from '@/lib/queries';
import { greeting, firstName } from '@/lib/utils';
import { downloadPortfolio } from '@/lib/portfolio';
import { useToast } from '@/lib/toast';
import { Card } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';

// Coach home: time-aware greeting, dark Coaching Portfolio card, my groups,
// and quick actions including a prominent "Write a Report" tile.
export default function CoachHome() {
  const { profile } = useAuth();
  const { data: groups = [] } = useMyGroups();
  const { data: blocks = [] } = useMyOneToOneBlocks();
  const { data: reports = [] } = useMyReports();
  const toast = useToast();

  const sessionsDelivered = blocks.reduce((sum, b) => sum + b.sessions_used, 0);
  const reportsSent = reports.filter((r) => r.status === 'sent').length;

  function handleDownloadPortfolio() {
    if (!profile) return;
    downloadPortfolio({
      coachName: profile.full_name,
      academyName: 'Loop by Zak Cricket',
      stats: [
        { label: 'Sessions', value: sessionsDelivered },
        { label: '1-on-1s', value: blocks.length },
        { label: 'Reports Sent', value: reportsSent },
        { label: 'Groups', value: groups.length },
      ],
      highlights: groups.slice(0, 5).map((g) => ({
        label: g.name,
        value: g.age_category ?? '—',
      })),
    });
    toast.show('Career record downloaded');
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow">{greeting()}</div>
        <h1 className="display-title mt-1 text-4xl leading-none">
          {profile ? firstName(profile.full_name) : 'Coach'}
        </h1>
      </div>

      {/* Coaching Portfolio — dark card */}
      <div className="rounded-card bg-ink p-5 text-paper shadow-card-lg">
        <div className="eyebrow text-gold">Coaching Portfolio</div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label="Sessions" value={sessionsDelivered} />
          <Metric label="1-on-1s" value={blocks.length} />
          <Metric label="Reports" value={reportsSent} />
        </div>
        <button
          onClick={handleDownloadPortfolio}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-pill border border-white/15 py-2.5 text-[12px] font-semibold text-paper/80 hover:bg-white/5"
        >
          <Icon name="download" size={14} /> Download Career Record
        </button>
      </div>

      {/* My Groups */}
      <Card>
        <div className="eyebrow text-ink/40">My Groups · this week</div>
        <div className="mt-3 space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                <span className="text-[14px] font-medium">{g.name}</span>
              </div>
              {g.age_category && (
                <span className="text-[12px] text-ink/45">{g.age_category}</span>
              )}
            </div>
          ))}
          {!groups.length && <div className="text-[13px] text-ink/45">No groups assigned yet.</div>}
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/coach/reports"
          className="flex flex-col gap-2 rounded-card bg-ink p-4 text-paper shadow-card"
        >
          <Icon name="message" size={22} stroke="#C9A84C" />
          <span className="text-[14px] font-semibold">Write a Report</span>
          <span className="text-[11px] text-paper/55">AI quick feedback</span>
        </Link>
        <Link to="/coach/attendance" className="card flex flex-col gap-2 p-4">
          <Icon name="check" size={22} stroke="#9C1116" />
          <span className="text-[14px] font-semibold">Take Attendance</span>
          <span className="text-[11px] text-ink/45">Present / Late</span>
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-3xl leading-none text-gold">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-eyebrow text-paper/50">{label}</div>
    </div>
  );
}
