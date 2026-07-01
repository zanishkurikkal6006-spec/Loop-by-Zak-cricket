import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Render a designed HTML document to a multi-page A4 PDF via html2canvas. Gives
// full control over typography, spacing and logo aspect — so parent-facing
// reports look professionally designed rather than drawn with PDF primitives.
export async function htmlToPdf(innerHtml: string, filename: string): Promise<void> {
  const node = document.createElement('div');
  node.style.cssText =
    'position:fixed;left:-9999px;top:0;width:794px;background:#ffffff;' +
    "font-family:Jost,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#141414;";
  node.innerHTML = innerHtml;
  document.body.appendChild(node);
  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.95);
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(img, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(node);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Shared branded header markup (logo aspect-preserved, academy name, powered-by). */
export function brandHeader(opts: {
  academy: string;
  logoUrl: string | null;
  platform: string;
  title: string;
  subtitle?: string;
}): string {
  const logo = opts.logoUrl
    ? `<img src="${opts.logoUrl}" crossorigin="anonymous" style="width:52px;height:52px;border-radius:50%;background:#fff;object-fit:contain;padding:3px;box-sizing:border-box;" />`
    : `<div style="width:52px;height:52px;border-radius:50%;background:#9C1116;display:flex;align-items:center;justify-content:center;color:#FAF7F4;font-weight:800;font-size:24px;">Z</div>`;
  return `
  <div style="background:linear-gradient(120deg,#6E0C10,#141414);padding:26px 34px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logo}
      <div>
        <div style="font-size:22px;font-weight:800;letter-spacing:.3px;color:#FAF7F4;line-height:1.1;">${escapeHtml(opts.academy)}</div>
        <div style="margin-top:3px;font-size:8px;font-weight:700;letter-spacing:2.5px;color:#C9A84C;">POWERED BY ${escapeHtml(opts.platform.toUpperCase())}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:13px;font-weight:700;color:#FAF7F4;">${escapeHtml(opts.title)}</div>
      ${opts.subtitle ? `<div style="margin-top:3px;font-size:9px;color:#e6cfa0;letter-spacing:1px;">${escapeHtml(opts.subtitle)}</div>` : ''}
    </div>
  </div>`;
}
