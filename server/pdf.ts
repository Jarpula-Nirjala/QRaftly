/**
 * A small PDF 1.4 writer: A4 pages of vector QR codes (filled rectangles) with labels in Helvetica, a font
 * every PDF reader has built in. Codes stay sharp at any print size.
 */

export interface PdfCell {
  modules: boolean[][];
  /** Up to two lines of text under the code. */
  label: string;
  sublabel?: string;
}

const A4 = { w: 595.28, h: 841.89 };

/** Helvetica in PDF strings takes Latin-1; other characters become "?". Parentheses and backslashes are escaped. */
function pdfText(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    const c = code < 256 ? ch : '?';
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return out;
}

/** Approximate Helvetica width (average 0.52 em) so long labels can be shortened to fit. */
const fit = (s: string, size: number, width: number) => {
  const max = Math.floor(width / (size * 0.52));
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
};

function hex(c: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  const v = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : [0, 0, 0];
  return v.map((x) => x.toFixed(3)).join(' ');
}

/** A sheet of codes: `cols` × `rows` per page, with page numbers. */
export function makeQrSheet(cells: PdfCell[], opts: { cols?: number; rows?: number; color?: string; title?: string } = {}): Buffer {
  const cols = opts.cols ?? 3;
  const rows = opts.rows ?? 4;
  const margin = 36;
  const header = opts.title ? 24 : 0;
  const cellW = (A4.w - margin * 2) / cols;
  const cellH = (A4.h - margin * 2 - header) / rows;
  const perPage = cols * rows;
  const pages: string[] = [];
  const pageCount = Math.max(1, Math.ceil(cells.length / perPage));
  for (let p = 0; p < pageCount; p++) {
    let s = '';
    if (opts.title) s += `BT /F2 13 Tf 0 0 0 rg ${margin} ${A4.h - margin - 10} Td (${pdfText(fit(opts.title, 13, A4.w - margin * 2 - 60))}) Tj ET\n`;
    s += `BT /F1 8 Tf 0.4 0.4 0.4 rg ${A4.w - margin - 40} ${margin - 20} Td (${p + 1} / ${pageCount}) Tj ET\n`;
    cells.slice(p * perPage, (p + 1) * perPage).forEach((cell, i) => {
      const cx = margin + (i % cols) * cellW;
      const cy = A4.h - margin - header - (Math.floor(i / cols) + 1) * cellH; // bottom of the cell
      const n = cell.modules.length;
      const side = Math.min(cellW - 24, cellH - 46);
      const unit = side / (n + 8); // quiet zone of 4 modules each side
      const x0 = cx + (cellW - side) / 2 + unit * 4;
      const y0 = cy + 38 + unit * 4; // leave room for labels below
      s += `${hex(opts.color ?? '#111111')} rg\n`;
      for (let y = 0; y < n; y++) {
        // One rectangle per horizontal run of dark modules.
        for (let x = 0; x < n; x++) {
          if (!cell.modules[y][x]) continue;
          let run = 1;
          while (x + run < n && cell.modules[y][x + run]) run++;
          s += `${(x0 + x * unit).toFixed(2)} ${(y0 + (n - 1 - y) * unit).toFixed(2)} ${(run * unit + 0.01).toFixed(2)} ${(unit + 0.01).toFixed(2)} re\n`;
          x += run - 1;
        }
      }
      s += 'f\n';
      const textW = cellW - 12;
      s += `BT /F2 9 Tf 0.07 0.08 0.1 rg ${cx + 6} ${cy + 24} Td (${pdfText(fit(cell.label, 9, textW))}) Tj ET\n`;
      if (cell.sublabel) s += `BT /F1 7 Tf 0.4 0.4 0.4 rg ${cx + 6} ${cy + 13} Td (${pdfText(fit(cell.sublabel, 7, textW))}) Tj ET\n`;
    });
    pages.push(s);
  }

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then a page and a content stream per page.
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content, i) => {
    const page = 5 + i * 2;
    objects[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${page + 1} 0 R >>`;
    objects[page + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`;
  });
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
