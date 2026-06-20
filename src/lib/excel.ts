import * as XLSX from 'xlsx';

// Client-side Excel export for finance + month-end reports. Kept generic so any
// screen can hand it an array of flat row objects and a filename.
export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  sheetName = 'Sheet1',
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}-${stamp}.xlsx`);
}
