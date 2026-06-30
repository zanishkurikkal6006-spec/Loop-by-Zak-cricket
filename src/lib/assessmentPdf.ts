import { jsPDF } from 'jspdf';
import { drawLoopMark, RED, DEEP, GOLD, INK, PAPER } from './brandPdf';

// The skill list for the 3-month assessment (Age 3–12 focus, but works for all).
export const ASSESSMENT_SKILLS: { key: string; label: string }[] = [
  { key: 'listening', label: 'Listening & Following Instructions' },
  { key: 'confidence', label: 'Confidence & Participation' },
  { key: 'balance', label: 'Balance & Coordination' },
  { key: 'agility', label: 'Running & Agility' },
  { key: 'throwing', label: 'Throwing Technique' },
  { key: 'catching', label: 'Catching Skills' },
  { key: 'grip', label: 'Bat Grip & Stance' },
  { key: 'contact', label: 'Bat-Ball Contact' },
  { key: 'bowling', label: 'Bowling Action' },
  { key: 'fielding', label: 'Fielding' },
  { key: 'teamwork', label: 'Teamwork & Sportsmanship' },
];

export interface AssessmentPdfData {
  childName: string;
  age?: number | null;
  groupName?: string | null;
  coachName?: string | null;
  academyName: string;
  date: string;
  ratings: Record<string, { rating: number; comment?: string }>;
  strengths?: string;
  areas?: string;
  coachComments?: string;
  goals?: string;
  videoUrl?: string;
  /** Photo data URLs to embed. */
  photos?: string[];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

export async function downloadAssessmentPdf(d: AssessmentPdfData): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;
  const ensure = (h: number) => {
    if (y + h > H - 50) {
      doc.addPage();
      y = 50;
    }
  };

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...DEEP);
  doc.rect(0, 0, W, 110, 'F');
  drawLoopMark(doc, 56, 55, 58);
  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('LOOP', 94, 50);
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'normal');
  doc.text('BY ZAK CRICKET', 95, 64);
  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('3-Month Skill Assessment', W - M, 50, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 200, 160);
  doc.text(d.academyName, W - M, 64, { align: 'right' });

  // ── Player info table ──────────────────────────────────────────────────────
  y = 134;
  const info: [string, string][] = [
    ['Player Name', d.childName],
    ['Age', d.age != null ? String(d.age) : '—'],
    ['Assessment Date', new Date(d.date).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Coach', d.coachName || '—'],
  ];
  doc.setDrawColor(225, 219, 211);
  doc.setLineWidth(1);
  const rowH = 24;
  const labelW = 150;
  info.forEach(([k, v], i) => {
    const ry = y + i * rowH;
    doc.setFillColor(248, 245, 240);
    doc.rect(M, ry, labelW, rowH, 'FD');
    doc.rect(M + labelW, ry, W - M * 2 - labelW, rowH, 'D');
    doc.setTextColor(90, 90, 90);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(k, M + 8, ry + 16);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.text(v, M + labelW + 8, ry + 16);
  });
  y += info.length * rowH + 26;

  // ── Skill assessment table ─────────────────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Skill Assessment', M, y);
  y += 14;

  const skillW = 250;
  const dotsW = 110;
  // header
  doc.setFillColor(...DEEP);
  doc.rect(M, y, W - M * 2, 22, 'F');
  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('SKILL', M + 8, y + 15);
  doc.text('RATING', M + skillW + 8, y + 15);
  doc.text('COMMENT', M + skillW + dotsW + 8, y + 15);
  y += 22;

  doc.setFontSize(10);
  for (const sk of ASSESSMENT_SKILLS) {
    const r = d.ratings[sk.key]?.rating ?? 0;
    const comment = d.ratings[sk.key]?.comment ?? '';
    ensure(24);
    const rowTop = y;
    doc.setDrawColor(230, 225, 218);
    doc.rect(M, rowTop, W - M * 2, 24, 'D');
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(sk.label, M + 8, rowTop + 15, { maxWidth: skillW - 12 });
    // rating dots
    for (let i = 0; i < 5; i++) {
      const cx = M + skillW + 14 + i * 18;
      if (i < r) {
        doc.setFillColor(...GOLD);
        doc.circle(cx, rowTop + 12, 5, 'F');
      } else {
        doc.setDrawColor(200, 195, 188);
        doc.circle(cx, rowTop + 12, 5, 'S');
      }
    }
    if (comment) {
      doc.setTextColor(90, 90, 90);
      doc.setFontSize(8.5);
      doc.text(comment, M + skillW + dotsW + 8, rowTop + 15, { maxWidth: W - M * 2 - skillW - dotsW - 12 });
    }
    y += 24;
  }
  y += 18;

  // ── Narrative sections ─────────────────────────────────────────────────────
  const section = (title: string, body?: string) => {
    if (!body || !body.trim()) return;
    ensure(54);
    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), M, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(M, y + 5, M + 30, y + 5);
    y += 18;
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(body.trim(), W - M * 2) as string[];
    for (const ln of lines) {
      ensure(15);
      doc.text(ln, M, y);
      y += 15;
    }
    y += 14;
  };
  section('Strengths', d.strengths);
  section('Areas to Improve', d.areas);
  section("Coach's Comments", d.coachComments);
  section('Next 3-Month Goals', d.goals);

  // ── Photos ─────────────────────────────────────────────────────────────────
  if (d.photos && d.photos.length) {
    ensure(40);
    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SESSION PHOTOS', M, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(M, y + 5, M + 30, y + 5);
    y += 16;
    const colW = (W - M * 2 - 12) / 2;
    let col = 0;
    let rowMaxH = 0;
    let rowTop = y;
    for (const src of d.photos.slice(0, 6)) {
      const img = await loadImage(src);
      if (!img) continue;
      const ratio = img.height / img.width;
      const w = colW;
      const h = Math.min(colW * ratio, 180);
      if (col === 0) {
        ensure(h + 8);
        rowTop = y;
        rowMaxH = h;
      }
      const x = M + col * (colW + 12);
      try {
        doc.addImage(src, 'JPEG', x, rowTop, w, h, undefined, 'FAST');
      } catch {
        /* skip unsupported image */
      }
      rowMaxH = Math.max(rowMaxH, h);
      if (col === 1) {
        y = rowTop + rowMaxH + 12;
        col = 0;
      } else {
        col = 1;
      }
    }
    if (col === 1) y = rowTop + rowMaxH + 12;
  }

  // ── Video link ─────────────────────────────────────────────────────────────
  if (d.videoUrl && d.videoUrl.trim()) {
    ensure(30);
    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SESSION VIDEO', M, y);
    y += 16;
    doc.setTextColor(37, 99, 235);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.textWithLink('▶ Watch the session video', M, y, { url: d.videoUrl.trim() });
    y += 18;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(...RED);
  doc.setLineWidth(2);
  doc.line(M, H - 40, W - M, H - 40);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`${d.academyName} · Generated ${new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, H - 26);
  doc.text('Keep believing. Keep training. 🏏', W - M, H - 26, { align: 'right' });

  const safe = d.childName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`loop-assessment-${safe}.pdf`);
}
