import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { roleHome } from '@/lib/nav';
import Login from './Login';

/** Connects the presentational Login screen to Supabase auth + role routing. */
export default function LoginPage() {
  const { session, profile, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already signed in → straight to the role's home.
  if (session && profile) return <Navigate to={roleHome[profile.role]} replace />;

  async function handleSignIn(email: string, password: string) {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // Redirect happens via the Navigate above once the profile loads.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Check your details.');
    } finally {
      setLoading(false);
    }
  }

  return <Login onSignIn={handleSignIn} error={error} loading={loading} />;
}
