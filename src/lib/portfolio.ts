import { jsPDF } from 'jspdf';
import { drawLoopMark, RED, DEEP, GOLD, INK, PAPER } from './brandPdf';

// Coach career-record (portfolio) PDF — a branded one-pager the coach can
// download from Home. Drawn with jsPDF primitives (no raster assets) to match
// the Loop identity: deep-red header band, the real Loop mark, Bebas-style title.

export interface PortfolioData {
  coachName: string;
  academyName: string;
  stats: { label: string; value: number | string }[];
  /** Optional recent highlights (e.g. groups, top players, recent reports). */
  highlights?: { label: string; value: string }[];
}

export function downloadPortfolio(data: PortfolioData): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...DEEP);
  doc.rect(0, 0, W, 150, 'F');

  // The real Loop mark (red disc + gold ring + angular Z)
  drawLoopMark(doc, 70, 75, 60);

  // Wordmark
  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.text('LOOP', 112, 70);
  doc.setFontSize(9);
  doc.setTextColor(201, 168, 76);
  doc.setFont('helvetica', 'normal');
  doc.text('BY ZAK CRICKET', 113, 86);

  doc.setFontSize(11);
  doc.setTextColor(...PAPER);
  doc.text('Coaching Career Record', W - 40, 70, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(220, 200, 160);
  doc.text(data.academyName, W - 40, 86, { align: 'right' });

  // ── Coach name ───────────────────────────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(data.coachName, 40, 200);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(40, 210, 90, 210);

  // ── Stat blocks ──────────────────────────────────────────────────────────
  const top = 240;
  const cardW = (W - 80 - (data.stats.length - 1) * 14) / data.stats.length;
  data.stats.forEach((s, i) => {
    const x = 40 + i * (cardW + 14);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(236, 231, 225);
    doc.roundedRect(x, top, cardW, 80, 8, 8, 'FD');
    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text(String(s.value), x + cardW / 2, top + 42, { align: 'center' });
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(s.label.toUpperCase(), x + cardW / 2, top + 64, { align: 'center' });
  });

  // ── Highlights ───────────────────────────────────────────────────────────
  let y = top + 130;
  if (data.highlights && data.highlights.length) {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Highlights', 40, y);
    y += 10;
    doc.setDrawColor(243, 238, 232);
    doc.setLineWidth(1);
    data.highlights.forEach((h) => {
      y += 24;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.text(h.label, 40, y);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'bold');
      doc.text(h.value, W - 40, y, { align: 'right' });
      doc.line(40, y + 8, W - 40, y + 8);
    });
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })} · Loop by Zak Cricket`,
    40,
    H - 30,
  );

  const safeName = data.coachName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`loop-career-record-${safeName}.pdf`);
}
