import type { jsPDF } from 'jspdf';
import { drawLoopMark } from './brandPdf';

// Per-tenant branding. The academy's own name + logo appear on all reports and
// messages; "Loop by Zak Cricket" becomes the platform "powered by" credit.
// Set once when the academy loads (see AuthContext), read everywhere.

const PLATFORM = 'Loop by Zak Cricket';

let _name = PLATFORM;
let _logoUrl: string | null = null;
let _logoData: string | null = null;
let _logoLoading: Promise<string | null> | null = null;

export function setBranding(name?: string | null, logoUrl?: string | null): void {
  _name = (name ?? '').trim() || PLATFORM;
  const next = logoUrl?.trim() || null;
  if (next !== _logoUrl) {
    _logoUrl = next;
    _logoData = null;
    _logoLoading = null;
  }
}

export function academyName(): string {
  return _name;
}
export function platformName(): string {
  return PLATFORM;
}
export function academyLogoUrl(): string | null {
  return _logoUrl;
}

/** Fetch the academy logo as a data URL (cached), for embedding in PDFs. */
export async function academyLogoDataUrl(): Promise<string | null> {
  if (!_logoUrl) return null;
  if (_logoUrl.startsWith('data:')) return _logoUrl; // already inline
  if (_logoData) return _logoData;
  if (!_logoLoading) {
    _logoLoading = fetch(_logoUrl)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string>((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result as string);
            fr.readAsDataURL(b);
          }),
      )
      .then((d) => {
        _logoData = d;
        return d;
      })
      .catch(() => null);
  }
  return _logoLoading;
}

/** Draw the academy logo (or the Loop mark) centred at (cx, cy), aspect-preserved. */
export function drawBrandLogo(doc: jsPDF, logo: string | null, cx: number, cy: number, size: number): void {
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const ratio = props.width / props.height;
      let w = size;
      let h = size;
      if (ratio > 1) h = size / ratio;
      else w = size * ratio;
      const fmt = (props.fileType as string) || (logo.startsWith('data:image/png') ? 'PNG' : 'JPEG');
      doc.addImage(logo, fmt, cx - w / 2, cy - h / 2, w, h, undefined, 'FAST');
      return;
    } catch {
      /* fall through to the Loop mark */
    }
  }
  drawLoopMark(doc, cx, cy, size);
}
