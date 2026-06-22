import { jsPDF } from 'jspdf';
import { drawLoopMark, RED, DEEP, GOLD, INK, PAPER } from './brandPdf';

// Parent-facing report PDF — a polished, branded one-pager a coach can send
// alongside the WhatsApp message. Used for both the end-of-block Development
// Report and Quick Session Feedback (the title/eyebrow just change).

export interface ReportPdfData {
  kind: 'development' | 'quick';
  childName: string;
  groupName?: string | null;
  coachName?: string | null;
  academyName: string;
  date: string; // ISO yyyy-mm-dd
  body: string;
}

export function downloadReportPdf(data: ReportPdfData): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const isDev = data.kind === 'development';

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...DEEP);
  doc.rect(0, 0, W, 120, 'F');
  drawLoopMark(doc, 58, 60, 64);

  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('LOOP', 100, 56);
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'normal');
  doc.text('BY ZAK CRICKET', 101, 70);

  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(isDev ? 'Development Report' : 'Session Feedback', W - 40, 54, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 200, 160);
  doc.text(data.academyName, W - 40, 70, { align: 'right' });

  // ── Player header ────────────────────────────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(data.childName, 40, 168);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(40, 178, 90, 178);

  // Meta chips line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  const meta = [
    data.groupName ? `Group: ${data.groupName}` : null,
    data.coachName ? `Coach: ${data.coachName}` : null,
    `Date: ${new Date(data.date).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  ]
    .filter(Boolean)
    .join('    ·    ');
  doc.text(meta, 40, 198);

  // ── Body card ────────────────────────────────────────────────────────────────
  const cardTop = 220;
  const cardX = 40;
  const cardW = W - 80;
  const padding = 22;
  const textW = cardW - padding * 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(data.body.trim(), textW) as string[];
  const lineH = 18;
  const cardH = Math.min(padding * 2 + lines.length * lineH, H - cardTop - 70);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(236, 231, 225);
  doc.setLineWidth(1);
  doc.roundedRect(cardX, cardTop, cardW, cardH, 10, 10, 'FD');

  // gold accent bar on the card's left edge
  doc.setFillColor(...GOLD);
  doc.rect(cardX, cardTop + 14, 4, cardH - 28, 'F');

  doc.setTextColor(...INK);
  let y = cardTop + padding + 4;
  for (const line of lines) {
    if (y > cardTop + cardH - padding) break;
    doc.text(line, cardX + padding, y);
    y += lineH;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(...RED);
  doc.setLineWidth(2);
  doc.line(40, H - 50, W - 40, H - 50);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })} · Loop by Zak Cricket`,
    40,
    H - 34,
  );
  doc.text('Keep believing. Keep training. 🏏', W - 40, H - 34, { align: 'right' });

  const safe = data.childName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`loop-${isDev ? 'development' : 'feedback'}-${safe}.pdf`);
}
