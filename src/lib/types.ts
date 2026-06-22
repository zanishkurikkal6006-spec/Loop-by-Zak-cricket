// Domain types mirroring the Supabase schema (supabase/migrations/0001_schema.sql).
// Hand-written for clarity; can be replaced with `supabase gen types` output later.

export type UserRole = 'admin' | 'head_coach' | 'coach';
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
