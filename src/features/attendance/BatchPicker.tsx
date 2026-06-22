import { useEffect, useState } from 'react';
import { useBatchesForGroup } from '@/lib/queries';
import { Chip } from '@/components/ui';
import { clsx } from '@/lib/utils';

export interface BatchSelection {
  batchId: string | null;
  startTime: string | null; // 'HH:MM' override for this session (weekend/one-off)
  endTime: string | null;
}

function hhmm(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5); // 'HH:MM:SS' -> 'HH:MM'
}

function slotLabel(start: string | null, end: string | null): string {
  const s = hhmm(start);
  const e = hhmm(end);
  if (s && e) return `${s}–${e}`;
  if (s) return s;
  return 'No time set';
}

// Batch (time-slot) picker for attendance. A group can run several batches
// (Elite has 2, Level Up / Launch Pad 1). The coach/admin picks the slot they
// are marking, and can customise the time for a one-off or recurring weekend
// session without touching the standing schedule.
export default function BatchPicker({
  groupId,
  value,
  onChange,
}: {
  groupId: string | null;
  value: BatchSelection;
  onChange: (next: BatchSelection) => void;
}) {
  const { data: batches = [] } = useBatchesForGroup(groupId);
  const [custom, setCustom] = useState(false);

  // Reset selection whenever the group changes.
  useEffect(() => {
    setCustom(false);
    onChange({ batchId: null, startTime: null, endTime: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (!groupId) return null;
  if (!batches.length) {
    return (
      <div className="text-[12px] text-ink/45">
        No batches set up for this group. Add batches (with times) in Payments → Settings.
      </div>
    );
  }

  const selected = batches.find((b) => b.id === value.batchId) ?? null;

  function pick(id: string) {
    const b = batches.find((x) => x.id === id);
    setCustom(false);
    onChange({ batchId: id, startTime: null, endTime: null });
    void b;
  }

  return (
    <div className="space-y-2">
      <div className="eyebrow text-ink/40">Batch / time slot</div>
      <div className="flex flex-wrap gap-2">
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => pick(b.id)}
            className={clsx(
              'rounded-pill border px-3 py-2 text-left text-[12px] font-semibold transition',
              value.batchId === b.id
                ? 'border-brand-red bg-brand-red text-paper'
                : 'border-cardborder bg-white text-ink/70',
            )}
          >
            <div>{b.name}</div>
            <div className={clsx('text-[10px] font-normal', value.batchId === b.id ? 'text-paper/70' : 'text-ink/45')}>
              {slotLabel(b.start_time, b.end_time)}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <label className="flex items-center gap-2 text-[12px] text-ink/60">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => {
              const on = e.target.checked;
              setCustom(on);
              onChange({
                batchId: value.batchId,
                startTime: on ? hhmm(selected.start_time) : null,
                endTime: on ? hhmm(selected.end_time) : null,
              });
            }}
          />
          Customise time for this session (weekend / one-off)
        </label>
      )}

      {custom && selected && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={value.startTime ?? ''}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            className="h-10 rounded-pill border border-cardborder bg-white px-3 text-[13px] outline-none focus:border-gold"
          />
          <span className="text-ink/40">to</span>
          <input
            type="time"
            value={value.endTime ?? ''}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            className="h-10 rounded-pill border border-cardborder bg-white px-3 text-[13px] outline-none focus:border-gold"
          />
          <Chip tone="amber">This session only</Chip>
        </div>
      )}
    </div>
  );
}
