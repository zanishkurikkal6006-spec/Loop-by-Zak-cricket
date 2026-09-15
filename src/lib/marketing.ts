import type {
  AcademyEvent, Campaign, EventType, ReferralStatus, RewardStatus, School, SchoolStage,
} from './types';

// Labels + derived-metric math for Phase 3 (Acquisition). Calculations live here
// so every screen (and later the AI) reads channel performance the same way.

export const SCHOOL_STAGES: { key: SchoolStage; label: string; tone: string }[] = [
  { key: 'target',            label: 'Target',            tone: 'neutral' },
  { key: 'contacted',         label: 'Contacted',         tone: 'blue' },
  { key: 'meeting',           label: 'Meeting',           tone: 'blue' },
  { key: 'proposal',          label: 'Proposal',          tone: 'gold' },
  { key: 'activation_agreed', label: 'Activation Agreed', tone: 'amber' },
  { key: 'active_partner',    label: 'Active Partner',    tone: 'green' },
  { key: 'closed_lost',       label: 'Closed Lost',       tone: 'red' },
];

export const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: 'junior_cricket_day', label: 'Junior Cricket Day' },
  { key: 'open_day',           label: 'Open Day' },
  { key: 'camp',               label: 'Camp' },
  { key: 'tournament',         label: 'Tournament' },
  { key: 'school_activation',  label: 'School Activation' },
  { key: 'community',          label: 'Community Event' },
  { key: 'awards',             label: 'Awards' },
  { key: 'talent_day',         label: 'Talent Day' },
  { key: 'other',              label: 'Other' },
];

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  created: 'Invited', lead: 'Lead', trial: 'Trial', enrolled: 'Enrolled', rewarded: 'Rewarded', expired: 'Expired',
};
export const REFERRAL_STATUS_TONE: Record<ReferralStatus, string> = {
  created: 'neutral', lead: 'blue', trial: 'gold', enrolled: 'green', rewarded: 'green', expired: 'red',
};
export const REWARD_STATUS_LABEL: Record<RewardStatus, string> = {
  none: 'No reward', pending: 'Reward pending', approved: 'Reward approved', paid: 'Reward paid',
};

export function schoolStageLabel(s: SchoolStage): string {
  return SCHOOL_STAGES.find((x) => x.key === s)?.label ?? s;
}
export function schoolStageTone(s: SchoolStage): string {
  return SCHOOL_STAGES.find((x) => x.key === s)?.tone ?? 'neutral';
}
export function eventTypeLabel(t: EventType): string {
  return EVENT_TYPES.find((x) => x.key === t)?.label ?? t;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export interface CampaignMetrics {
  cpl: number | null;         // cost per lead
  costPerTrial: number | null;
  cac: number | null;         // cost per enrolment (acquisition)
  leadToEnrol: number | null; // conversion %
  roas: number | null;        // revenue / spend
}
export function campaignMetrics(c: Campaign): CampaignMetrics {
  return {
    cpl: ratio(c.spend, c.leads),
    costPerTrial: ratio(c.spend, c.trials),
    cac: ratio(c.spend, c.enrolments),
    leadToEnrol: c.leads > 0 ? (c.enrolments / c.leads) * 100 : null,
    roas: ratio(c.revenue, c.spend),
  };
}

export interface EventMetrics {
  costPerAttendee: number | null;
  costPerLead: number | null;
  costPerEnrolment: number | null;
  roi: number | null; // (revenue − budget) / budget, as %
}
export function eventMetrics(e: AcademyEvent): EventMetrics {
  return {
    costPerAttendee: ratio(e.budget, e.attendance),
    costPerLead: ratio(e.budget, e.leads),
    costPerEnrolment: ratio(e.budget, e.enrolments),
    roi: e.budget > 0 ? ((e.revenue - e.budget) / e.budget) * 100 : null,
  };
}

export interface SchoolMetrics {
  leadToTrial: number | null;
  trialToEnrol: number | null;
  revenuePerStudent: number | null;
}
export function schoolMetrics(s: School): SchoolMetrics {
  return {
    leadToTrial: s.leads > 0 ? (s.trials / s.leads) * 100 : null,
    trialToEnrol: s.trials > 0 ? (s.enrolments / s.trials) * 100 : null,
    revenuePerStudent: ratio(s.revenue, s.enrolments),
  };
}

/** A shareable referral code from the referring family's name, e.g. SK-RAHU-4821. */
export function generateReferralCode(name: string): string {
  const stub = (name.trim().split(/\s+/)[0] ?? 'REF').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'REF';
  const n = Math.floor(1000 + Math.random() * 9000);
  return `SK-${stub}-${n}`;
}
