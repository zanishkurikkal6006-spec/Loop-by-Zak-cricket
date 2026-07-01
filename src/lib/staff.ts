import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { UserRole } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Create a staff login WITHOUT an edge function:
//  1. Sign the new user up via an ISOLATED client (persistSession:false) so the
//     admin's own session is never replaced.
//  2. Insert their profile via the admin's client — RLS `profiles_admin_write`
//     allows an admin to add a profile in their own academy.
// Note: for the coach to log in immediately, "Confirm email" should be OFF in
// Supabase (Auth → Sign In / Providers → Email). Otherwise they must confirm
// via the email link first.
export async function createStaff(input: {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  academyId: string;
  phone?: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  const phone = input.phone?.trim() || null;

  const tmp = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'loop-staff-signup' },
  });
  const { data, error } = await tmp.auth.signUp({
    email,
    password: input.password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error('Sign-up did not return a user (email confirmation may be required)');

  const { error: pErr } = await supabase.from('profiles').insert({
    id,
    academy_id: input.academyId,
    role: input.role,
    full_name: fullName,
    email,
    phone,
  });
  if (pErr) throw pErr;
}
