import { htmlToPdf, escapeHtml, brandHeader } from './htmlPdf';
import { academyName, academyLogoUrl, platformName } from './branding';

// Parent-facing report — a professionally designed, HTML-rendered document
// (Development Report or Quick Feedback). Rendered via html2canvas so the
// logo keeps its aspect and the typography looks designed.

export interface ReportPdfData {
  kind: 'development' | 'quick';
  childName: string;
  groupName?: string | null;
  coachName?: string | null;
  academyName: string;
  date: string; // ISO yyyy-mm-dd
  body: string;
}

interface Section {
  heading: string;
  body: string;
}

function parseSections(text: string): Section[] {
  const isHeading = (l: string) => {
    const t = l.trim();
    return t.length > 0 && t.length <= 40 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/[a-z]/.test(t);
  };
  const lines = text.split('\n');
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      cur = { heading: line, body: '' };
      out.push(cur);
    } else if (cur) {
      cur.body += (cur.body ? ' ' : '') + line;
    } else {
      cur = { heading: 'Report', body: line };
      out.push(cur);
    }
  }
  return out.length ? out : [{ heading: 'Report', body: text.trim() }];
}

function titleCase(h: string): string {
  return h
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/'S\b/i, "'s");
}

export async function downloadReportPdf(data: ReportPdfData): Promise<void> {
  const isDev = data.kind === 'development';
  const brand = academyName();
  const dateLabel = new Date(data.date).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' });

  const meta = [
    data.groupName ? `Group · ${data.groupName}` : null,
    data.coachName ? `Coach · ${data.coachName}` : null,
    `Date · ${dateLabel}`,
  ]
    .filter(Boolean)
    .join('&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;');

  let bodyHtml: string;
  if (isDev) {
    bodyHtml = parseSections(data.body)
      .map(
        (s) => `
        <div style="margin-bottom:22px;break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:22px;height:3px;background:#C9A84C;border-radius:2px;"></div>
            <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:#9C1116;text-transform:uppercase;">${escapeHtml(titleCase(s.heading))}</div>
          </div>
          <div style="font-size:14.5px;line-height:1.7;color:#2b2b2b;">${escapeHtml(s.body)}</div>
        </div>`,
      )
      .join('');
  } else {
    bodyHtml = `
      <div style="border:1px solid #ece7e1;border-left:4px solid #C9A84C;border-radius:12px;padding:22px 24px;background:#fbf9f6;">
        <div style="font-size:15.5px;line-height:1.75;color:#2b2b2b;white-space:pre-wrap;">${escapeHtml(data.body.trim())}</div>
      </div>`;
  }

  const html = `
  <div>
    ${brandHeader({
      academy: brand,
      logoUrl: academyLogoUrl(),
      platform: platformName(),
      title: isDev ? 'Development Report' : 'Session Feedback',
      subtitle: dateLabel,
    })}
    <div style="padding:34px;">
      <div style="font-size:30px;font-weight:800;color:#141414;line-height:1.05;">${escapeHtml(data.childName)}</div>
      <div style="width:54px;height:3px;background:#C9A84C;border-radius:2px;margin:10px 0 12px;"></div>
      <div style="font-size:11.5px;color:#8a8078;letter-spacing:.3px;margin-bottom:26px;">${meta}</div>
      ${bodyHtml}
    </div>
    <div style="margin-top:8px;border-top:2px solid #9C1116;padding:14px 34px 26px;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:9px;color:#9a938a;">${escapeHtml(brand)} &nbsp;·&nbsp; ${dateLabel} &nbsp;·&nbsp; Powered by ${escapeHtml(platformName())}</div>
      <div style="font-size:9px;color:#C9A84C;font-weight:700;letter-spacing:1px;">KEEP BELIEVING. KEEP TRAINING.</div>
    </div>
  </div>`;

  const safe = data.childName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  await htmlToPdf(html, `loop-${isDev ? 'development' : 'feedback'}-${safe}.pdf`);
}
