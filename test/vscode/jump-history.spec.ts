import { command, expect, openFile, pageAtTop, pdfViewer, showPage, test } from './workbench';

test('PDF local history returns through deliberate jumps and truncates forward after a new jump', async ({ workbench: page }) => {
  await openFile(page, 'docs/outline.pdf');
  const viewer = await pdfViewer(page);
  await showPage(page, viewer, 3);
  await showPage(page, viewer, 9);
  await command(page, 'PDF: Back to Previous Location');
  await expect.poll(() => pageAtTop(viewer, 3)).toBe(true);
  await command(page, 'PDF: Forward to Next Location');
  await expect.poll(() => pageAtTop(viewer, 9)).toBe(true);
  await command(page, 'PDF: Back to Previous Location');
  await expect.poll(() => pageAtTop(viewer, 3)).toBe(true);
  await showPage(page, viewer, 5);
  await command(page, 'PDF: Back to Previous Location');
  await expect.poll(() => pageAtTop(viewer, 3)).toBe(true);
  await command(page, 'PDF: Forward to Next Location');
  await expect.poll(() => pageAtTop(viewer, 5)).toBe(true);
});
