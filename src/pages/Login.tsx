import { useState } from 'react';
import { LoopMark } from '@/components/brand/LoopMark';
import { Button } from '@/components/ui';

interface LoginProps {
  onSignIn?: (email: string, password: string) => Promise<void> | void;
  error?: string | null;
  loading?: boolean;
}

/**
 * Split-screen login (all roles). Left = deep-red seam-textured brand panel with
 * the glossy loop badge; right = email + password + Sign In. After sign-in the
 * router sends each user to their role's destination.
 */
export default function Login({ onSignIn, error, loading }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSignIn?.(email, password);
  }

  return (
    <div className="flex min-h-screen flex-wrap">
      {/* Brand panel */}
      <div className="relative flex min-h-[300px] flex-1 basis-[380px] flex-col items-center justify-center overflow-hidden bg-brand-panel px-6 py-12">
        <div className="absolute inset-0 bg-seam opacity-[0.06]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/10" />
        <LoopMark size={120} glossy className="relative drop-shadow-2xl" />
        <div className="relative mt-6 font-display text-7xl leading-[0.78] tracking-[0.04em] text-paper">
          LOOP
        </div>
        <div className="relative mt-3 flex items-center gap-3">
          <span className="h-px w-7 bg-gold/50" />
          <span className="text-xs font-medium uppercase tracking-[0.42em] text-gold">
            By Zak Cricket
          </span>
          <span className="h-px w-7 bg-gold/50" />
        </div>
        <div className="relative mt-5 max-w-[320px] text-center text-[13.5px] leading-relaxed text-paper/55">
          The complete cricket academy platform — coach, parent &amp; player, all in one loop.
        </div>
      </div>

      {/* Sign-in form */}
      <form
        onSubmit={submit}
        className="flex min-h-[300px] flex-1 basis-[360px] flex-col justify-center bg-paper px-[7%] py-12"
      >
        <div className="eyebrow">Sign in</div>
        <div className="mt-2 font-display text-5xl leading-none tracking-[0.02em]">Welcome back</div>
        <div className="mt-1.5 text-[13.5px] text-ink/55">One login — your view opens to your role.</div>

        <div className="mt-7 flex max-w-[420px] flex-col gap-3">
          <label className="flex h-[54px] items-center gap-3 rounded-card border border-cardborder bg-white px-[18px]">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9C1116" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@zakcricket.ae"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink/40"
            />
          </label>
          <label className="flex h-[54px] items-center gap-3 rounded-card border border-cardborder bg-white px-[18px]">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9C1116" strokeWidth="2">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink/40"
            />
          </label>
        </div>

        {error && <div className="mt-3 text-[13px] text-danger">{error}</div>}

        <Button type="submit" size="lg" disabled={loading} className="mt-4 max-w-[420px]">
          {loading ? 'Signing in…' : 'Sign In'}
        </Button>
        <div className="mt-4 text-xs text-ink/45">
          Parent or player? Use the link your academy sent you.
        </div>
      </form>
    </div>
  );
}
