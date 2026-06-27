import { jsPDF } from 'jspdf';
import { drawLoopMark, RED, DEEP, GOLD, INK, PAPER } from './brandPdf';

// A branded, parent-facing badge certificate — something worth keeping, not just
// a text message. Landscape A5 with the Loop mark, a big medallion, the badge
// name, the child's name, and the date.
export interface BadgeCertData {
  childName: string;
  badgeName: string;
  emblem: string | null;
  criteria: string | null;
  academyName: string;
  date: string; // ISO
}

export function downloadBadgeCertificate(d: BadgeCertData): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a5', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Paper background + deep border frame
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...DEEP);
  doc.setLineWidth(3);
  doc.rect(16, 16, W - 32, H - 32, 'S');
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.rect(22, 22, W - 44, H - 44, 'S');

  // Loop mark + wordmark, centred top
  drawLoopMark(doc, W / 2, 64, 46);
  doc.setTextColor(...DEEP);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('LOOP BY ZAK CRICKET', W / 2, 100, { align: 'center' });

  // "Certificate of Achievement"
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('CERTIFICATE OF ACHIEVEMENT', W / 2, 122, { align: 'center' });

  // Medallion: gold ring + emblem
  const cy = 170;
  doc.setFillColor(...RED);
  doc.circle(W / 2, cy, 34, 'F');
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(3);
  doc.circle(W / 2, cy, 28, 'S');
  doc.setTextColor(...PAPER);
  doc.setFontSize(26);
  doc.text(d.emblem || '★', W / 2, cy + 9, { align: 'center' });

  // Badge name
  doc.setTextColor(...RED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(d.badgeName, W / 2, cy + 70, { align: 'center' });

  // Awarded to
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Awarded to', W / 2, cy + 92, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(d.childName, W / 2, cy + 114, { align: 'center' });

  if (d.criteria) {
    doc.setTextColor(140, 140, 140);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(`"${d.criteria}"`, W / 2, cy + 132, { align: 'center' });
  }

  // Date footer
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    new Date(d.date).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' }),
    W / 2,
    H - 30,
    { align: 'center' },
  );

  const safe = `${d.childName}-${d.badgeName}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`loop-badge-${safe}.pdf`);
}
