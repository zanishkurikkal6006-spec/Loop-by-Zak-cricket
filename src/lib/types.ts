// Domain types mirroring the Supabase schema (supabase/migrations/0001_schema.sql).
// Hand-written for clarity; can be replaced with `supabase gen types` output later.

export type UserRole = 'director' | 'operations_manager' | 'admin' | 'head_coach' | 'coach';
export type PackageKind = 'standard' | 'unlimited' | 'complimentary';
export type PackageSource = 'admin_assigned' | 'coach_added';
export type PaymentStatus = 'paid' | 'pending';
export type AttendanceState = 'present' | 'late';
export type AttendanceStatus = 'pending' | 'confirmed';
export type ReportType = 'quick' | 'development';
export type ReportStatus = 'draft' | 'sent';
export type MatchSource = 'manual' | 'cricheros';
export type PaymentCategory = 'package' | 'one_to_one' | 'match_fee' | 'ground_fee';
export type PaymentMode = 'cash' | 'bank' | 'pending' | 'screenshot';
export type PaymentState = 'confirmed' | 'pending' | 'awaiting';
export type BadgeCategory = 'performance' | 'attendance' | 'progress' | 'moment';
export type BadgeSendFlow = 'auto' | 'approval';
export type BadgeApproval = 'pending' | 'approved' | 'sent';

export interface Academy {
  id: string;
  name: string;
  logo_url: string | null;
  bank_details: Record<string, unknown>;
  wa_settings: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  academy_id: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
}

export interface TrainingCenter {
  id: string;
  academy_id: string;
  name: string;
  address: string | null;
}

export interface Group {
  id: string;
  academy_id: string;
  name: string;
  color: string;
  age_category: string | null;
  default_center_id: string | null;
}

export interface Batch {
  id: string;
  academy_id: string;
  name: string;
  center_id: string | null;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
}

export interface Player {
  id: string;
  academy_id: string;
  full_name: string;
  dob: string | null;
  age: number | null;
  group_id: string | null;
  center_id: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  avatar_url: string | null;
  joined_at: string | null;
  status: string;
  last_seen_at: string | null;
  /** Sessions taken without an active package; netted off the next package. */
  extra_sessions: number;
  // ── Acquisition history (carried over from the lead at conversion) ──
  lead_id: string | null;
  parent_id: string | null;
  lead_source: LeadSource | null;
  source_campaign: string | null;
  school: string | null;
  area: string | null;
  // ── Retention (Phase 2) ──
  renewal_date: string | null;
  exited_at: string | null;
  created_at: string;
}

export interface PackageType {
  id: string;
  academy_id: string;
  name: string;
  sessions: number | null;
  price: number;
  kind: PackageKind;
}

export interface Package {
  id: string;
  academy_id: string;
  player_id: string;
  package_type_id: string | null;
  sessions_total: number | null;
  sessions_used: number;
  sessions_remaining: number | null;
  source: PackageSource;
  payment_status: PaymentStatus;
  assigned_by: string | null;
  started_at: string | null;
  created_at: string;
}

export interface OneToOneBlock {
  id: string;
  academy_id: string;
  player_id: string;
  coach_id: string;
  focus_note: string | null;
  sessions_total: number;
  sessions_used: number;
  sessions_remaining: number;
  source: PackageSource;
  payment_status: PaymentStatus;
  assigned_by: string | null;
  created_at: string;
}

export interface OneToOneSession {
  id: string;
  academy_id: string;
  block_id: string;
  session_date: string;
  time_slot: string | null;
  report_id: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface AttendanceSession {
  id: string;
  academy_id: string;
  batch_id: string | null;
  group_id: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  coach_id: string | null;
  credited_coach_id: string | null;
  status: AttendanceStatus;
  submitted_at: string | null;
  confirmed_by: string | null;
  dedup_choice: Record<string, unknown>;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  academy_id: string;
  session_id: string;
  player_id: string;
  state: AttendanceState;
  also_marked_by: string | null;
  deduct_sessions: number;
}

export interface Report {
  id: string;
  academy_id: string;
  player_id: string;
  coach_id: string;
  type: ReportType;
  raw_notes: string | null;
  ai_draft: string | null;
  final_text: string | null;
  status: ReportStatus;
  block_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface Match {
  id: string;
  academy_id: string;
  group_id: string | null;
  coach_id: string | null;
  center_id: string | null;
  match_date: string;
  opponent: string | null;
  team_score: string | null;
  result: string | null;
  player_of_match: string | null;
  source: MatchSource;
  season: string | null;
  created_at: string;
}

export interface MatchPlayer {
  id: string;
  academy_id: string;
  match_id: string;
  player_id: string;
  batting_position: number | null;
  runs: number;
  balls: number;
  how_out: string | null;
  wickets: number;
  catches: number;
  run_outs: number;
  coach_why_note: string | null;
}

export interface Payment {
  id: string;
  academy_id: string;
  player_id: string | null;
  category: PaymentCategory;
  ref_id: string | null;
  amount: number;
  mode: PaymentMode;
  status: PaymentState;
  screenshot_url: string | null;
  center_id: string | null;
  paid_at: string | null;
  confirmed_by: string | null;
  created_at: string;
}

export interface MatchFee {
  id: string;
  academy_id: string;
  match_id: string;
  player_id: string;
  fee: number;
  state: PaymentState;
  mode: PaymentMode | null;
  screenshot_url: string | null;
  confirmed_by: string | null;
  created_at: string;
}

export interface GroundFee {
  id: string;
  academy_id: string;
  center_id: string | null;
  booking_date: string;
  amount: number;
  paid_amount: number;
  mode: PaymentMode | null;
  status: PaymentState;
  created_at: string;
}

export interface BadgeType {
  id: string;
  academy_id: string | null;
  key: string;
  name: string;
  category: BadgeCategory;
  accent: string;
  emblem: string | null;
  criteria: string | null;
  send_flow: BadgeSendFlow;
}

export interface PlayerBadge {
  id: string;
  academy_id: string;
  player_id: string;
  badge_type_id: string;
  earned_at: string;
  approval_status: BadgeApproval;
  sent_at: string | null;
}

export interface AssessmentRating {
  rating: number; // 1–5
  comment?: string;
}

export interface Assessment {
  id: string;
  academy_id: string;
  player_id: string;
  coach_id: string | null;
  assessment_date: string;
  ratings: Record<string, AssessmentRating>;
  strengths: string | null;
  areas: string | null;
  coach_comments: string | null;
  goals: string | null;
  video_url: string | null;
  created_at: string;
}

export interface Program {
  id: string;
  academy_id: string;
  name: string;
  emoji: string | null;
  accent: string;
  description: string | null;
  /** Optional group/category link — players added to this group auto-enrol. */
  group_id: string | null;
}

// ── Growth Engine (Phase 1): CRM · Trials · Follow-ups ────────────────────────

export type LeadStage =
  | 'new' | 'contacted' | 'qualified' | 'trial_booked' | 'trial_attended'
  | 'offer_sent' | 'enrolled' | 'nurture' | 'lost';

export type LeadSource =
  | 'meta' | 'google' | 'instagram_organic' | 'website' | 'whatsapp' | 'school'
  | 'referral' | 'event' | 'community' | 'walk_in' | 'super_kings_database'
  | 'partner' | 'other';

export type LeadActivityType =
  | 'note' | 'call' | 'whatsapp' | 'email' | 'stage_change' | 'trial' | 'follow_up' | 'system';

export type TrialStatus = 'scheduled' | 'attended' | 'no_show' | 'converted' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'open' | 'done' | 'snoozed' | 'cancelled';
export type TaskKind =
  | 'new_lead' | 'unanswered_enquiry' | 'trial_reminder' | 'trial_no_show' | 'post_trial'
  | 'offer_follow_up' | 'nurture' | 'renewal_follow_up' | 'referral_follow_up'
  | 'school_follow_up' | 'other';

export interface Parent {
  id: string;
  academy_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  notes: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  academy_id: string;
  lead_date: string;
  parent_id: string | null;
  parent_name: string | null;
  player_name: string;
  dob: string | null;
  age: number | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  school: string | null;
  cricket_experience: string | null;
  playing_level: string | null;
  preferred_center_id: string | null;
  preferred_days: string | null;
  preferred_timing: string | null;
  source: LeadSource;
  campaign: string | null;
  assigned_to: string | null;
  stage: LeadStage;
  last_interaction_at: string | null;
  next_follow_up: string | null;
  trial_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  converted_player_id: string | null;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  academy_id: string;
  lead_id: string;
  type: LeadActivityType;
  body: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Trial {
  id: string;
  academy_id: string;
  lead_id: string | null;
  player_name: string;
  trial_date: string;
  time_slot: string | null;
  center_id: string | null;
  group_id: string | null;
  coach_id: string | null;
  status: TrialStatus;
  created_at: string;
}

export interface TrialAssessment {
  id: string;
  academy_id: string;
  trial_id: string;
  coach_id: string | null;
  ratings: Record<string, number>;
  strength: string | null;
  development_priority: string | null;
  recommended_program: string | null;
  recommended_level: string | null;
  comments: string | null;
  created_at: string;
}

export interface FollowUpTask {
  id: string;
  academy_id: string;
  kind: TaskKind;
  title: string;
  lead_id: string | null;
  trial_id: string | null;
  player_id: string | null;
  owner_id: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  outcome: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

// ── Retention & Parent Experience (Phase 2) ───────────────────────────────────

export type RiskLevel = 'green' | 'amber' | 'red';
export type IssueCategory =
  | 'coaching' | 'schedule' | 'payment' | 'communication' | 'facility'
  | 'match_selection' | 'tournament' | 'safety' | 'other';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';
export type ChurnReason =
  | 'price' | 'location' | 'timing' | 'coach' | 'school_pressure' | 'no_improvement'
  | 'insufficient_match_exposure' | 'child_lost_interest' | 'moved_country'
  | 'joined_competitor' | 'facility' | 'parent_experience' | 'other';

export interface Issue {
  id: string;
  academy_id: string;
  player_id: string | null;
  parent_id: string | null;
  category: IssueCategory;
  title: string;
  body: string | null;
  priority: TaskPriority;
  status: IssueStatus;
  owner_id: string | null;
  resolution: string | null;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PlayerHealthSnapshot {
  id: string;
  academy_id: string;
  player_id: string;
  score: number;
  risk: RiskLevel;
  factors: { label: string; penalty: number }[];
  snapshot_date: string;
  created_at: string;
}

export interface ChurnRecord {
  id: string;
  academy_id: string;
  player_id: string;
  exit_date: string;
  reason: ChurnReason;
  reason_detail: string | null;
  lead_source: LeadSource | null;
  join_cohort: string | null;
  recorded_by: string | null;
  created_at: string;
}

// ── Acquisition (Phase 3): Schools · Events · Campaigns · Referrals ────────────

export type SchoolStage =
  | 'target' | 'contacted' | 'meeting' | 'proposal' | 'activation_agreed'
  | 'active_partner' | 'closed_lost';
export type EventType =
  | 'junior_cricket_day' | 'open_day' | 'camp' | 'tournament' | 'school_activation'
  | 'community' | 'awards' | 'talent_day' | 'other';
export type ReferralStatus = 'created' | 'lead' | 'trial' | 'enrolled' | 'rewarded' | 'expired';
export type RewardStatus = 'none' | 'pending' | 'approved' | 'paid';

export interface School {
  id: string;
  academy_id: string;
  name: string;
  area: string | null;
  curriculum: string | null;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  email: string | null;
  stage: SchoolStage;
  potential_students: number | null;
  first_contact: string | null;
  last_contact: string | null;
  next_action: string | null;
  next_action_date: string | null;
  activation_date: string | null;
  students_reached: number;
  leads: number;
  trials: number;
  enrolments: number;
  revenue: number;
  notes: string | null;
  created_at: string;
}

export interface SchoolActivity {
  id: string;
  academy_id: string;
  school_id: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AcademyEvent {
  id: string;
  academy_id: string;
  name: string;
  type: EventType;
  event_date: string | null;
  center_id: string | null;
  budget: number;
  registrations: number;
  attendance: number;
  leads: number;
  trials: number;
  enrolments: number;
  revenue: number;
  notes: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  academy_id: string;
  platform: string | null;
  name: string;
  period: string | null;
  spend: number;
  leads: number;
  qualified_leads: number;
  trials: number;
  trial_attendance: number;
  enrolments: number;
  revenue: number;
  notes: string | null;
  created_at: string;
}

export interface Referral {
  id: string;
  academy_id: string;
  code: string;
  referrer_player_id: string | null;
  referrer_name: string | null;
  invited_name: string | null;
  invited_phone: string | null;
  invited_lead_id: string | null;
  status: ReferralStatus;
  reward: string | null;
  reward_status: RewardStatus;
  reward_value: number;
  created_at: string;
}

// ── Operations Intelligence (Phase 4) ─────────────────────────────────────────

export interface Venue {
  id: string;
  academy_id: string;
  name: string;
  center_id: string | null;
  rental_cost: number;
  available_hours: number;
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  created_at: string;
}
