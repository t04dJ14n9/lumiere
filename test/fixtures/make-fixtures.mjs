// Writes the PDFs the tests open into test/fixtures/generated/.
//
// short.pdf: 3 pages, no outline.
// outline.pdf: 12 pages of 300 x 400 points. Every page says "Synthetic page N"
// in 18 pt Helvetica on a baseline 100 points below the top (x 72 to about
// 206), and "Second line N" on a baseline 130 points below the top. It has a
// nested outline, page 1 links to page 5, and page 2 links to a web address.
// "Section 2.1" and the link to page 5 open 130 points down their page, at
// "Second line N"; the other entries open at the top of their page.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const PAGE_SIZE = { width: 300, height: 400 };
export const PAGE_COUNT = 12;
export const OUTLINE = [
  { title: 'Part One', page: 1, children: [
    { title: 'Section 1.1', page: 2, children: [] },
    { title: 'Section 1.2', page: 3, children: [] },
  ] },
  { title: 'Part Two', page: 6, children: [
    { title: 'Section 2.1', page: 9, top: 130, children: [] },
  ] },
];
export const INTERNAL_LINK = { page: 1, target: 5, top: 130, rect: [72, 300, 228, 330] };
export const WEB_LINK = { page: 2, url: 'https://example.com/paper', rect: [72, 300, 228, 330] };

/** A PDF assembled object by object; `add` returns the object's number. */
class PdfWriter {
  objects = [];

  add(body) {
    this.objects.push(body);
    return this.objects.length;
  }

  set(number, body) {
    this.objects[number - 1] = body;
  }

  reserve() {
    return this.add(null);
  }

  toBuffer(rootNumber) {
    let out = '%PDF-1.7\n';
    const offsets = [];
    this.objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${this.objects.length + 1} /Root ${rootNumber} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}

/** PDF rectangles count up from the bottom; the fixtures are described from the top. */
function fromTop([left, top, right, bottom]) {
  return [left, PAGE_SIZE.height - bottom, right, PAGE_SIZE.height - top].join(' ');
}

function stream(content) {
  return `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
}

export function outlinePdf() {
  const pdf = new PdfWriter();
  const catalog = pdf.reserve();
  const pagesNode = pdf.reserve();
  const font = pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pages = Array.from({ length: PAGE_COUNT }, () => pdf.reserve());

  pages.forEach((pageObject, index) => {
    const number = index + 1;
    const text = [
      `BT /F1 18 Tf 72 ${PAGE_SIZE.height - 100} Td (Synthetic page ${number}) Tj ET`,
      `BT /F1 14 Tf 72 ${PAGE_SIZE.height - 130} Td (Second line ${number}) Tj ET`,
    ].join('\n');
    const contents = pdf.add(stream(text));
    const annotations = [];
    if (number === INTERNAL_LINK.page) {
      annotations.push(pdf.add(`<< /Type /Annot /Subtype /Link /Rect [${fromTop(INTERNAL_LINK.rect)}] /Border [0 0 0] /Dest [${pages[INTERNAL_LINK.target - 1]} 0 R /XYZ 0 ${PAGE_SIZE.height - INTERNAL_LINK.top} 0] >>`));
    }
    if (number === WEB_LINK.page) {
      annotations.push(pdf.add(`<< /Type /Annot /Subtype /Link /Rect [${fromTop(WEB_LINK.rect)}] /Border [0 0 0] /A << /S /URI /URI (${WEB_LINK.url}) >> >>`));
    }
    const annots = annotations.length ? ` /Annots [${annotations.map(n => `${n} 0 R`).join(' ')}]` : '';
    pdf.set(pageObject, `<< /Type /Page /Parent ${pagesNode} 0 R /MediaBox [0 0 ${PAGE_SIZE.width} ${PAGE_SIZE.height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R${annots} >>`);
  });

  const outlineRoot = pdf.reserve();
  const writeLevel = (items, parent) => {
    const numbers = items.map(() => pdf.reserve());
    items.forEach((item, index) => {
      const children = item.children.length ? writeLevel(item.children, numbers[index]) : undefined;
      const links = [
        `/Title (${item.title})`,
        `/Parent ${parent} 0 R`,
        `/Dest [${pages[item.page - 1]} 0 R /XYZ 0 ${PAGE_SIZE.height - (item.top ?? 0)} 0]`,
        index > 0 ? `/Prev ${numbers[index - 1]} 0 R` : '',
        index < items.length - 1 ? `/Next ${numbers[index + 1]} 0 R` : '',
        children ? `/First ${children.first} 0 R /Last ${children.last} 0 R /Count ${item.children.length}` : '',
      ];
      pdf.set(numbers[index], `<< ${links.filter(Boolean).join(' ')} >>`);
    });
    return { first: numbers[0], last: numbers.at(-1) };
  };
  const top = writeLevel(OUTLINE, outlineRoot);
  pdf.set(outlineRoot, `<< /Type /Outlines /First ${top.first} 0 R /Last ${top.last} 0 R /Count ${OUTLINE.length} >>`);
  pdf.set(pagesNode, `<< /Type /Pages /Kids [${pages.map(n => `${n} 0 R`).join(' ')}] /Count ${PAGE_COUNT} >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesNode} 0 R /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines >>`);
  return pdf.toBuffer(catalog);
}

/** A 3-page PDF without an outline; the reload test swaps it in. */
export function shortPdf() {
  const pdf = new PdfWriter();
  const catalog = pdf.reserve();
  const pagesNode = pdf.reserve();
  const font = pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pages = [1, 2, 3].map(number => {
    const contents = pdf.add(stream(`BT /F1 18 Tf 72 ${PAGE_SIZE.height - 100} Td (Short page ${number}) Tj ET`));
    return pdf.add(`<< /Type /Page /Parent ${pagesNode} 0 R /MediaBox [0 0 ${PAGE_SIZE.width} ${PAGE_SIZE.height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`);
  });
  pdf.set(pagesNode, `<< /Type /Pages /Kids [${pages.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesNode} 0 R >>`);
  return pdf.toBuffer(catalog);
}

export const GENERATED = path.join(path.dirname(new URL(import.meta.url).pathname), 'generated');

if (process.argv[1] === new URL(import.meta.url).pathname) {
  mkdirSync(GENERATED, { recursive: true });
  writeFileSync(path.join(GENERATED, 'outline.pdf'), outlinePdf());
  writeFileSync(path.join(GENERATED, 'short.pdf'), shortPdf());
  console.log(`Wrote test PDFs to ${GENERATED}`);
}
