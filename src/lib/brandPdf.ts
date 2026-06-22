import type { jsPDF } from 'jspdf';

// Shared Loop brand drawing for jsPDF documents (reports + portfolio), using the
// real identity mark from the design handoff: red disc + gold ring + the angular
// "Z" glyph (not a typed letter). Keeps every PDF on-brand and consistent.

export const RED: [number, number, number] = [156, 17, 22];
export const DEEP: [number, number, number] = [110, 12, 16];
export const GOLD: [number, number, number] = [201, 168, 76];
export const INK: [number, number, number] = [20, 20, 20];
export const PAPER: [number, number, number] = [250, 247, 244];

// The exact "Z" path from LoopMark.tsx (viewBox -100..100, so a 200×200 box),
// as absolute points. Only M/L commands + close — safe to render as a polygon.
const Z_POINTS: [number, number][] = [
  [23.6, -49.24],
  [11.04, -49.24],
  [11.04, -49.25],
  [-44.6, -49.25],
  [-28.43, -21.25],
  [-3.9, -21.25],
  [-5.74, -18.07],
  [-44.6, 49.24],
  [-23.6, 49.24],
  [-23.6, 49.25],
  [44.6, 49.24],
  [28.44, 21.25],
  [3.9, 21.25],
  [5.74, 18.06],
  [44.6, -49.24],
];

/**
 * Draw the Loop mark centred at (cx, cy). `size` is the disc diameter in points.
 */
export function drawLoopMark(doc: jsPDF, cx: number, cy: number, size: number): void {
  const s = size / 200; // the source artwork is a 200pt box
  const discR = 83.19 * s;
  const ringR = 73 * s;

  // Red disc
  doc.setFillColor(...RED);
  doc.circle(cx, cy, discR, 'F');
  // Gold ring
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(4.4 * s);
  doc.circle(cx, cy, ringR, 'S');

  // White angular "Z" as a filled polygon (lines() takes relative deltas).
  const start = Z_POINTS[0];
  const deltas: [number, number][] = [];
  for (let i = 1; i < Z_POINTS.length; i++) {
    deltas.push([(Z_POINTS[i][0] - Z_POINTS[i - 1][0]) * s, (Z_POINTS[i][1] - Z_POINTS[i - 1][1]) * s]);
  }
  doc.setFillColor(...PAPER);
  doc.lines(deltas, cx + start[0] * s, cy + start[1] * s, [1, 1], 'F', true);
}
