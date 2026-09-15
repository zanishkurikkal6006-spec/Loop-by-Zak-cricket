import { useState } from 'react';
import { Button } from '@/components/ui';
import { appBrandName, appBrandTagline, appBrandLogoUrl, platformCredit, hasAcademyBrand } from '@/lib/appBrand';

interface LoginProps {
  onSignIn?: (email: string, password: string) => Promise<void> | void;
  error?: string | null;
  loading?: boolean;
}

/**
 * Split-screen login. Left = bold Super-Kings-style yellow hero (logo + big
 * condensed name + tagline); right = sign-in form. Brand comes from build-time
 * env (see appBrand.ts) so it's fully branded before the tenant is known.
 * "Powered by Loop by Zak Cricket" stays as a small platform credit.
 */
export default function Login({ onSignIn, error, loading }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const name = appBrandName();
  const tagline = appBrandTagline();
  const logo = appBrandLogoUrl();
  const branded = hasAcademyBrand();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSignIn?.(email, password);
  }

  return (
    <div className="flex min-h-screen flex-wrap">
      {/* Bold yellow brand hero */}
      <div className="relative flex min-h-[320px] flex-1 basis-[420px] flex-col justify-center overflow-hidden bg-gold px-[8%] py-14">
        {/* faint oversized monogram, like their site */}
        <div className="pointer-events-none absolute -right-10 top-1/2 -translate-y-1/2 select-none font-hero text-[42vh] leading-none text-brand-deep/[0.06]">
          {name.charAt(0).toUpperCase()}
        </div>

        {logo ? (
          <span className="relative inline-flex w-fit items-center rounded-2xl bg-white px-6 py-5 shadow-md">
            <img src={logo} alt={name} className="h-auto w-auto object-contain" style={{ maxHeight: 150, maxWidth: 260 }} />
          </span>
        ) : (
          <h1 className="relative font-hero text-[clamp(40px,7vw,76px)] uppercase leading-[0.92] tracking-[0.01em] text-brand-deep">
            {name}
          </h1>
        )}
        <div className="relative mt-6 h-1.5 w-24 rounded-full bg-skorange" />
        {tagline && (
          <p className="relative mt-5 max-w-[420px] font-hero text-[clamp(20px,2.6vw,30px)] uppercase leading-[1.02] tracking-[0.01em] text-brand-deep">
            {tagline}
          </p>
        )}

        <div className="relative mt-8 text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-deep/55">
          {branded ? `Powered by ${platformCredit()}` : 'The complete cricket academy platform'}
        </div>
      </div>

      {/* Sign-in form */}
      <form
        onSubmit={submit}
        className="flex min-h-[320px] flex-1 basis-[360px] flex-col justify-center bg-paper px-[7%] py-14"
      >
        <div className="eyebrow text-brand-red">Sign in</div>
        <div className="mt-2 font-hero text-5xl uppercase leading-[0.95] tracking-[0.01em] text-ink">Welcome back</div>
        <div className="mt-2 text-[13.5px] text-ink/55">One login — your view opens to your role.</div>

        <div className="mt-7 flex max-w-[420px] flex-col gap-3">
          <label className="flex h-[54px] items-center gap-3 rounded-card border border-cardborder bg-white px-[18px] focus-within:border-brand-red">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#123A7B" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@academy.ae"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink/40"
            />
          </label>
          <label className="flex h-[54px] items-center gap-3 rounded-card border border-cardborder bg-white px-[18px] focus-within:border-brand-red">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#123A7B" strokeWidth="2">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <input
              type="password" required value={password}
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
        <div className="mt-5 text-[11px] text-ink/40">
          {branded ? <>Powered by <span className="font-semibold text-ink/55">{platformCredit()}</span></> : 'Parent or player? Use the link your academy sent you.'}
        </div>
      </form>
    </div>
  );
}
