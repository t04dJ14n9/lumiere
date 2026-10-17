import { parseViewerMessage, type ViewerPatch } from '../../src/shared/messages';

type Report = { type: string; [key: string]: unknown };

/**
 * The viewer reports its state in `patch` messages. These tests were written
 * per part ({ type: 'selection' | 'outline' | 'view', … }), so this sends
 * each part through `parseViewerMessage` as a one-part patch and reads it
 * back in the same shape: `undefined` when the patch is rejected.
 */
export function parseStateReport(report: Report): Report | undefined {
  const { type, ...fields } = report;
  const part: ViewerPatch | Record<string, unknown> =
    type === 'selection' ? { selection: fields }
      : type === 'outline' ? { outline: fields.items }
        : type === 'view' ? { view: fields.view }
          : {};
  const parsed = parseViewerMessage({ type: 'patch', version: 1, load: 1, patch: part });
  if (parsed?.type !== 'patch') return undefined;
  const { selection, outline, view } = parsed.patch;
  if (selection) return { type, ...selection };
  if (outline) return { type, items: outline };
  if (view) return { type, view };
  return undefined;
}
