// App-level brand, resolved BEFORE sign-in (so the login screen can be fully
// branded even though the tenant isn't known yet). Driven by build-time env so
// the platform stays multi-tenant: a deployment for one academy sets these in
// Vercel; the default is the Loop platform brand.
//
//   VITE_BRAND_NAME     e.g. "Super Kings Academy Dubai"
//   VITE_BRAND_TAGLINE  e.g. "We don't just build players. We build character."
//   VITE_BRAND_LOGO_URL a public URL (or data: URI) for the academy logo
//
// "Loop by Zak Cricket" is always the platform credit, shown small.

const PLATFORM = 'Loop by Zak Cricket';
const env = import.meta.env as Record<string, string | undefined>;

// This deployment's default academy brand (Super Kings Academy Dubai). Any of
// these can still be overridden per-deployment via the VITE_BRAND_* env vars,
// so the platform stays reusable for other academies.
const DEFAULT_NAME = 'Super Kings Academy Dubai';
const DEFAULT_TAGLINE = "We don't just build players. We build character.";
const DEFAULT_LOGO = 'https://www.superkingsacademy.ca/assets/images/logo.png';

export function appBrandName(): string {
  return (env.VITE_BRAND_NAME ?? '').trim() || DEFAULT_NAME;
}
export function appBrandTagline(): string {
  const v = env.VITE_BRAND_TAGLINE;
  return v === undefined ? DEFAULT_TAGLINE : v.trim();
}
export function appBrandLogoUrl(): string | null {
  const v = env.VITE_BRAND_LOGO_URL;
  return (v === undefined ? DEFAULT_LOGO : v.trim()) || null;
}
export function platformCredit(): string {
  return PLATFORM;
}
/** True when a distinct academy brand is configured (not just the Loop default). */
export function hasAcademyBrand(): boolean {
  return appBrandName() !== PLATFORM;
}
