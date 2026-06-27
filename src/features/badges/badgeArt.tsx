// Premium badge medallion — a crafted gold coin (enamel disc, double gold rim,
// sheen) with a clean engraved glyph instead of an emoji. One SVG generator is
// used everywhere: in-app reveal, the catalogue, the certificate image, and the
// public parent page — so badges look classy and consistent.

export type GlyphKey =
  | 'trophy' | 'star' | 'ball' | 'stumps' | 'calendar'
  | 'bolt' | 'flag' | 'chart' | 'medal' | 'rocket';

// Engraved glyphs in a 24×24 box. `fill` glyphs are solid cream; others are
// stroked cream lines. Drawn centred inside the coin.
const GLYPHS: Record<GlyphKey, { d: string[]; fill?: boolean }> = {
  trophy: { d: ['M6 9a6 6 0 0 0 12 0V4H6z', 'M6 4H4v2a3 3 0 0 0 3 3', 'M18 4h2v2a3 3 0 0 1-3 3', 'M9 20h6', 'M12 15v5'] },
  star: { fill: true, d: ['M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.9 6.7 19.6l1.1-6L3.4 9.5l6-.8z'] },
  ball: { d: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.6 3.6C11 8 11 16 8.6 20.4', 'M15.4 3.6C13 8 13 16 15.4 20.4'] },
  stumps: { d: ['M8 5v15', 'M12 5v15', 'M16 5v15', 'M7 7h10'] },
  calendar: { d: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 9h16', 'M8 3v4', 'M16 3v4'] },
  bolt: { fill: true, d: ['M13 2 4 13.5h6L9 22l9-12h-6l1-8z'] },
  flag: { d: ['M5 21V4', 'M5 4s1.2-1 4-1 5 2 8 2 3-1 3-1v9s-1.2 1-3 1-5-2-8-2-4 1-4 1z'] },
  chart: { d: ['M4 4v16h16', 'M8 16v-4', 'M12 16V8', 'M16 16v-6'] },
  medal: { d: ['M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M8.6 13 7 22l5-3 5 3-1.6-9', 'M12 11.5 10.8 9l2.4 0z'] },
  rocket: { d: ['M12 3c3.5 2.5 5 6.5 5 10l-2.5 2.5h-5L7 13c0-3.5 1.5-7.5 5-10z', 'M9.5 18 7.5 21', 'M14.5 18l2 3', 'M12 10.5a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z'] },
};

// Map a badge key (or its category) to the best-fitting glyph.
const KEY_TO_GLYPH: Record<string, GlyphKey> = {
  half_century: 'medal', century: 'trophy', first_fifty: 'star', run_machine: 'rocket', big_hitter: 'bolt',
  five_wicket: 'ball', hat_trick: 'ball', wicket_taker: 'stumps', first_wicket: 'stumps', sharp_fielder: 'star',
  session_keeper: 'calendar', all_season_pro: 'calendar', relentless: 'bolt', early_bird: 'star', comeback: 'rocket',
  rising_star: 'star', most_improved: 'chart', block_complete: 'trophy', goal_getter: 'flag',
  player_of_match: 'trophy', debut: 'medal', match_winner: 'trophy', clutch: 'bolt', duck_breaker: 'rocket',
  captains_knock: 'medal', partnership: 'star', allrounder: 'star',
};

export function glyphFor(key?: string | null, category?: string | null): GlyphKey {
  if (key && KEY_TO_GLYPH[key]) return KEY_TO_GLYPH[key];
  switch (category) {
    case 'performance': return 'star';
    case 'attendance': return 'calendar';
    case 'progress': return 'chart';
    case 'moment': return 'trophy';
    default: return 'star';
  }
}

function clampHex(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }
function shade(hex: string, pct: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => clampHex(c + (pct < 0 ? c : 255 - c) * pct);
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Full medallion SVG markup string (used by both React and the certificate). */
export function badgeSvgMarkup(glyph: GlyphKey, accent: string, size = 160): string {
  const id = Math.random().toString(36).slice(2, 8);
  const light = shade(accent, 0.45);
  const dark = shade(accent, -0.45);
  const g = GLYPHS[glyph] ?? GLYPHS.star;
  // Centre a 24-box glyph in the 200 viewBox: scale 3.6 → 24*3.6=86.4, offset 56.8.
  const s = 3.6;
  const off = 100 - 12 * s;
  const glyphAttrs = g.fill
    ? `fill="#FCF7EC" stroke="none"`
    : `fill="none" stroke="#FCF7EC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const paths = g.d.map((d) => `<path d="${d}"/>`).join('');
  return `
<svg width="${size}" height="${size}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="disc-${id}" cx="38%" cy="30%" r="78%">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="58%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </radialGradient>
    <linearGradient id="gold-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F6E4A6"/>
      <stop offset="45%" stop-color="#C9A84C"/>
      <stop offset="100%" stop-color="#7E631F"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="97" fill="url(#gold-${id})" opacity="0.22"/>
  <circle cx="100" cy="100" r="92" fill="url(#gold-${id})"/>
  <circle cx="100" cy="100" r="83" fill="${dark}"/>
  <circle cx="100" cy="100" r="80" fill="url(#disc-${id})"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#000000" stroke-opacity="0.15" stroke-width="1"/>
  <circle cx="100" cy="100" r="71" fill="none" stroke="url(#gold-${id})" stroke-width="3"/>
  <ellipse cx="82" cy="62" rx="42" ry="22" fill="#ffffff" opacity="0.12"/>
  <g transform="translate(${off} ${off}) scale(${s})" ${glyphAttrs}>${paths}</g>
</svg>`;
}

export default function PremiumBadge({
  glyph,
  accent = '#9C1116',
  size = 128,
}: {
  glyph: GlyphKey;
  accent?: string;
  size?: number;
}) {
  return (
    <span
      style={{ width: size, height: size, display: 'inline-block' }}
      dangerouslySetInnerHTML={{ __html: badgeSvgMarkup(glyph, accent, size) }}
    />
  );
}
