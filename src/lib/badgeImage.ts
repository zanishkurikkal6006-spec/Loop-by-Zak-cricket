import html2canvas from 'html2canvas';
import { badgeSvgMarkup, type GlyphKey } from '@/features/badges/badgeArt';

// Render a parent-facing badge certificate as a PNG image. We build a real DOM
// node (with the premium medallion SVG) and rasterise it with html2canvas, so
// the coin, gradients and engraved glyph render exactly as designed.
export interface BadgeImageData {
  childName: string;
  badgeName: string;
  glyph: GlyphKey;
  criteria: string | null;
  accent?: string | null;
  academyName?: string;
}

const LOOP_SVG = `
<svg width="44" height="44" viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle r="83.19" fill="#9C1116"></circle>
  <circle r="73" fill="none" stroke="#C9A84C" stroke-width="4.4"></circle>
  <path d="M23.6 -49.24 L11.04 -49.24 L11.04 -49.25 L-44.6 -49.25 L-28.43 -21.25 L-3.9 -21.25 L-5.74 -18.07 L-44.6 49.24 L-23.6 49.24 L-23.6 49.25 L44.6 49.24 L28.44 21.25 L3.9 21.25 L5.74 18.06 L44.6 -49.24 Z" fill="#FAF7F4"></path>
</svg>`;

export async function downloadBadgeImage(d: BadgeImageData): Promise<void> {
  const accent = d.accent || '#9C1116';
  const date = new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' });

  const node = document.createElement('div');
  node.style.cssText =
    'position:fixed;left:-9999px;top:0;width:640px;background:#FAF7F4;font-family:Jost,Helvetica,Arial,sans-serif;';
  node.innerHTML = `
    <div style="margin:0;padding:36px;background:#FAF7F4;border:3px solid #6E0C10;box-sizing:border-box;">
      <div style="border:1px solid #C9A84C;padding:28px 24px;text-align:center;box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
          ${LOOP_SVG}
          <div style="text-align:left;line-height:1;">
            <div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#6E0C10;line-height:1;">LOOP</div>
            <div style="margin-top:5px;font-size:9px;font-weight:700;letter-spacing:3px;color:#C9A84C;">BY ZAK CRICKET</div>
          </div>
        </div>

        <div style="margin-top:14px;font-size:11px;letter-spacing:3px;color:#141414;opacity:.6;">CERTIFICATE OF ACHIEVEMENT</div>

        <div style="margin:18px auto 0;width:150px;height:150px;">
          ${badgeSvgMarkup(d.glyph, accent, 150)}
        </div>

        <div style="margin-top:18px;font-size:30px;font-weight:800;color:${accent};line-height:1.1;">${escapeHtml(d.badgeName)}</div>
        ${d.criteria ? `<div style="margin-top:6px;font-size:12px;font-style:italic;color:#141414;opacity:.55;">“${escapeHtml(d.criteria)}”</div>` : ''}

        <div style="margin-top:18px;font-size:11px;letter-spacing:2px;color:#141414;opacity:.5;">AWARDED TO</div>
        <div style="margin-top:4px;font-size:24px;font-weight:800;color:#141414;">${escapeHtml(d.childName)}</div>

        <div style="margin-top:22px;font-size:10px;color:#141414;opacity:.45;">${date} · ${escapeHtml(d.academyName || 'Loop by Zak Cricket')}</div>
      </div>
    </div>`;

  document.body.appendChild(node);
  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#FAF7F4', useCORS: true });
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loop-badge-${`${d.childName}-${d.badgeName}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    document.body.removeChild(node);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
