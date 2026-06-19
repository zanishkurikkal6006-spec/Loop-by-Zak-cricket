import { supabase } from './supabase';

// Calls the `generate-report` Supabase Edge Function, which talks to Anthropic
// server-side. The Anthropic key is never present in the browser.

export interface QuickReportInput {
  type: 'quick';
  childFirstName: string;
  coachName?: string;
  notes: string;
  rewrite?: boolean;
}

export interface DevelopmentReportInput {
  type: 'development';
  childFirstName: string;
  coachName?: string;
  groupName?: string;
  focusAreas?: string;
  stats?: Record<string, string | number>;
  rewrite?: boolean;
}

export type ReportInput = QuickReportInput | DevelopmentReportInput;

export async function generateReport(input: ReportInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text: string }>('generate-report', {
    body: input,
  });
  if (error) throw error;
  if (!data?.text) throw new Error('No report text returned');
  return data.text;
}
