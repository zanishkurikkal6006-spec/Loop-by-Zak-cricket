import { jsPDF } from 'jspdf';
import { drawLoopMark, RED, DEEP, GOLD, INK, PAPER } from './brandPdf';

export interface PlayerMatchRow {
  opponent: string;
  date: string;
  position: number | null;
  runs: number;
  balls: number;
  howOut: string;
  wickets: number;
  catches: number;
  runOuts: number;
}

export interface PlayerRecordData {
  childName: string;
  groupName?: string | null;
  academyName: string;
  summary: { label: string; value: string | number }[];
  matches: PlayerMatchRow[];
}

// Parent-facing per-player record — season summary + per-match breakdown
// (batting, bowling, fielding) on a branded sheet a coach can share.
export function downloadPlayerRecord(d: PlayerRecordData): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(...DEEP);
  doc.rect(0, 0, W, 116, 'F');
  drawLoopMark(doc, 56, 58, 60);
  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('LOOP', 96, 52);
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'normal');
  doc.text('BY ZAK CRICKET', 97, 66);
  doc.setTextColor(...PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Player Match Record', W - 40, 52, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 200, 160);
  doc.text(d.academyName, W - 40, 66, { align: 'right' });

  // Player name
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(d.childName, 40, 158);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(40, 168, 90, 168);
  if (d.groupName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(d.groupName, 40, 186);
  }

  // Summary stat cards
  const top = 204;
  const perRow = 4;
  const gap = 12;
  const cardW = (W - 80 - (perRow - 1) * gap) / perRow;
  d.summary.forEach((s, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 40 + col * (cardW + gap);
    const y = top + row * 74;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(236, 231, 225);
    doc.roundedRect(x, y, cardW, 64, 8, 8, 'FD');
    doc.setTextColor(...RED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(String(s.value), x + cardW / 2, y + 32, { align: 'center' });
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(s.label.toUpperCase(), x + cardW / 2, y + 50, { align: 'center' });
  });

  // Per-match table
  const rows = Math.ceil(d.summary.length / perRow);
  let y = top + rows * 74 + 16;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Match by match', 40, y);
  y += 16;

  // table header
  const cols = [
    { label: 'Match', x: 40 },
    { label: 'Bat', x: 250 },
    { label: 'Bowl', x: 360 },
    { label: 'Field', x: 440 },
  ];
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  cols.forEach((c) => doc.text(c.label.toUpperCase(), c.x, y));
  y += 6;
  doc.setDrawColor(236, 231, 225);
  doc.line(40, y, W - 40, y);
  y += 14;

  doc.setFontSize(10);
  for (const m of d.matches) {
    if (y > H - 50) {
      doc.addPage();
      y = 50;
    }
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(`vs ${m.opponent}`, 40, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.setFontSize(8);
    doc.text(new Date(m.date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }), 40, y + 12);
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`${m.runs} (${m.balls})${m.howOut ? ` ${m.howOut}` : ''}`, 250, y);
    doc.text(`${m.wickets} wkt`, 360, y);
    doc.text(`${m.catches}c ${m.runOuts}ro`, 440, y);
    y += 26;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })} · Loop by Zak Cricket`,
    40,
    H - 28,
  );

  const safe = d.childName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`loop-player-record-${safe}.pdf`);
}
