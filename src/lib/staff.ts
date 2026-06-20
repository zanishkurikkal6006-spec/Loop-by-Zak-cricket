import { supabase } from './supabase';
import type { UserRole } from './types';

// Create a staff login (coach / head-coach / admin) by calling the create-staff
// edge function, which holds the service-role key server-side. Requires the
// caller to be a signed-in admin (enforced in the function).
export async function createStaff(input: {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'create-staff',
    { body: input },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}
