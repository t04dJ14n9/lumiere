import * as vscode from 'vscode';
import type { PdfPanel } from '../pdf/panel';
import type { SelectionSnapshot } from '../pdf/selection';
import { RegionTooLargeError, type RegionImages } from './region-images';

/**
 * The `regions` service: saves a region selection's PNG snapshot so an agent
 * can open it. Saving the same snapshot again marks it recently used (the
 * cache evicts the least recently used) and rewrites it if it was evicted
 * since.
 */
export class RegionSnapshots {
  constructor(private readonly images: RegionImages) {}

  /**
   * The snapshot's file, or `undefined` for text, no image, a snapshot over
   * the cache limit, or a failed save. Only a `notify` save (one the user is
   * waiting for) tells the user why there is no file.
   */
  async save(panel: PdfPanel, snapshot: SelectionSnapshot | undefined, options: { notify?: boolean } = {}): Promise<vscode.Uri | undefined> {
    if (snapshot?.selection.kind !== 'region' || !snapshot.image) return undefined;
    try {
      return vscode.Uri.file(await this.images.save(panel.uri.path, snapshot.selection.page, snapshot.image));
    } catch (error) {
      if (!options.notify) return undefined;
      if (error instanceof RegionTooLargeError) {
        void vscode.window.showWarningMessage(`${error.message}, so it was not attached. Raise the limit to attach large regions.`);
      } else {
        void vscode.window.showWarningMessage(`Could not save the region snapshot: ${error instanceof Error ? error.message : String(error)}`);
      }
      return undefined;
    }
  }
}
