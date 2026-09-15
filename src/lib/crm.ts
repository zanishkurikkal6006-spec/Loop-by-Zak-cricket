import { supabase } from './supabase';
import type {
  Lead, LeadActivityType, LeadSource, LeadStage, TaskKind, TaskPriority,
} from './types';

// ============================================================================
// Growth Engine helpers — CRM constants, labels, and the lead → player
// conversion. Conversion is the hinge of the whole platform: a lead becomes a
// row in the EXISTING players table, carrying its acquisition history forever.
// Nothing is duplicated.
// ============================================================================

/** The 24-month path to 500 active players (Super Kings operating targets). */
export const GROWTH_TARGETS: number[] = [
  10, 20, 40, 55, 65, 75, 100, 120, 140, 165, 180, 200,
  225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 500,
];

export const LEAD_STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: 'new',            label: 'New',            tone: 'blue' },
  { key: 'contacted',      label: 'Contacted',      tone: 'blue' },
  { key: 'qualified',      label: 'Qualified',      tone: 'gold' },
  { key: 'trial_booked',   label: 'Trial Booked',   tone: 'gold' },
  { key: 'trial_attended', label: 'Trial Attended', tone: 'gold' },
  { key: 'offer_sent',     label: 'Offer Sent',     tone: 'amber' },
  { key: 'enrolled',       label: 'Enrolled',       tone: 'green' },
  { key: 'nurture',        label: 'Nurture',        tone: 'neutral' },
  { key: 'lost',           label: 'Lost',           tone: 'red' },
];

export const LEAD_SOURCES: { key: LeadSource; label: string }[] = [
  { key: 'meta',                 label: 'Meta (FB/IG Ads)' },
  { key: 'google',               label: 'Google' },
  { key: 'instagram_organic',    label: 'Instagram (Organic)' },
  { key: 'website',              label: 'Website' },
  { key: 'whatsapp',             label: 'WhatsApp' },
  { key: 'school',               label: 'School' },
  { key: 'referral',             label: 'Referral' },
  { key: 'event',                label: 'Event' },
  { key: 'community',            label: 'Community' },
  { key: 'walk_in',              label: 'Walk-In' },
  { key: 'super_kings_database', label: 'Super Kings Database' },
  { key: 'partner',              label: 'Partner' },
  { key: 'other',                label: 'Other' },
];

/** The eight skills a coach scores on a trial (1–5). */
export const TRIAL_SKILLS: { key: string; label: string }[] = [
  { key: 'batting',        label: 'Batting' },
  { key: 'bowling',        label: 'Bowling' },
  { key: 'fielding',       label: 'Fielding' },
  { key: 'movement',       label: 'Movement' },
  { key: 'game_awareness', label: 'Game Awareness' },
  { key: 'coachability',   label: 'Coachability' },
];

export const TASK_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  new_lead: 'New lead follow-up',
  unanswered_enquiry: 'Unanswered enquiry',
  trial_reminder: 'Trial reminder',
  trial_no_show: 'Trial no-show',
  post_trial: 'Post-trial follow-up',
  offer_follow_up: 'Offer follow-up',
  nurture: 'Nurture lead',
  renewal_follow_up: 'Renewal follow-up',
  referral_follow_up: 'Referral follow-up',
  school_follow_up: 'School follow-up',
  other: 'Follow-up',
};

export function stageLabel(stage: LeadStage): string {
  return LEAD_STAGES.find((s) => s.key === stage)?.label ?? stage;
}
export function stageTone(stage: LeadStage): string {
  return LEAD_STAGES.find((s) => s.key === stage)?.tone ?? 'neutral';
}
export function sourceLabel(source: LeadSource): string {
  return LEAD_SOURCES.find((s) => s.key === source)?.label ?? source;
}

/** Age in whole years from a date-of-birth string, or null. */
export function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

/** Log an activity against a lead and stamp its last-interaction time. */
export async function addLeadActivity(input: {
  academyId: string;
  leadId: string;
  type: LeadActivityType;
  body?: string;
  createdBy?: string | null;
}): Promise<void> {
  await supabase.from('lead_activities').insert({
    academy_id: input.academyId,
    lead_id: input.leadId,
    type: input.type,
    body: input.body ?? null,
    created_by: input.createdBy ?? null,
  });
  await supabase
    .from('leads')
    .update({ last_interaction_at: new Date().toISOString() })
    .eq('id', input.leadId);
}

/** Move a lead to a new stage, recording the change on its timeline. */
export async function setLeadStage(input: {
  academyId: string;
  leadId: string;
  stage: LeadStage;
  createdBy?: string | null;
  lostReason?: string;
}): Promise<void> {
  await supabase
    .from('leads')
    .update({
      stage: input.stage,
      lost_reason: input.stage === 'lost' ? input.lostReason ?? null : null,
    })
    .eq('id', input.leadId);
  await addLeadActivity({
    academyId: input.academyId,
    leadId: input.leadId,
    type: 'stage_change',
    body: `Stage → ${stageLabel(input.stage)}${input.lostReason ? ` (${input.lostReason})` : ''}`,
    createdBy: input.createdBy,
  });
}

/**
 * Convert a lead into a player in the existing players table. The lead's
 * acquisition history (source, campaign, school, area, parent, lead id) is
 * copied onto the player so it stays attached for the player's whole life. The
 * lead is marked enrolled and linked to the new player; any related trial is
 * flagged converted. Returns the new player id.
 */
export async function convertLeadToPlayer(input: {
  academyId: string;
  lead: Lead;
  groupId?: string | null;
  centerId?: string | null;
  createdBy?: string | null;
}): Promise<string> {
  const { lead } = input;

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      academy_id: input.academyId,
      full_name: lead.player_name.trim(),
      dob: lead.dob,
      age: lead.age ?? ageFromDob(lead.dob),
      group_id: input.groupId || null,
      center_id: input.centerId || lead.preferred_center_id || null,
      parent_name: lead.parent_name,
      parent_phone: lead.phone,
      // Acquisition history — attached permanently.
      lead_id: lead.id,
      parent_id: lead.parent_id,
      lead_source: lead.source,
      source_campaign: lead.campaign,
      school: lead.school,
      area: lead.area,
    })
    .select('id')
    .single();
  if (error) throw error;

  const playerId = (player as { id: string }).id;

  await supabase
    .from('leads')
    .update({ stage: 'enrolled', converted_player_id: playerId })
    .eq('id', lead.id);

  await addLeadActivity({
    academyId: input.academyId,
    leadId: lead.id,
    type: 'system',
    body: `Converted to player · ${lead.player_name}`,
    createdBy: input.createdBy,
  });

  // Any trial tied to this lead is now converted.
  await supabase
    .from('trials')
    .update({ status: 'converted' })
    .eq('lead_id', lead.id)
    .neq('status', 'cancelled');

  return playerId;
}

/** Create a follow-up task (used across CRM, trials and Today's Actions). */
export async function createFollowUp(input: {
  academyId: string;
  kind: TaskKind;
  title: string;
  leadId?: string | null;
  trialId?: string | null;
  playerId?: string | null;
  ownerId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  await supabase.from('follow_up_tasks').insert({
    academy_id: input.academyId,
    kind: input.kind,
    title: input.title,
    lead_id: input.leadId ?? null,
    trial_id: input.trialId ?? null,
    player_id: input.playerId ?? null,
    owner_id: input.ownerId ?? null,
    due_date: input.dueDate ?? null,
    priority: input.priority ?? 'medium',
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });
}
