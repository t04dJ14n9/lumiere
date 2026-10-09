import * as vscode from 'vscode';
import type { PdfPanel } from '../pdf/panel';
import type { PluginDefinition, PdfServices } from '../services';
import manifest from './manifest';
import { RegionImages, regionCacheBytes } from './region-images';
import { RegionSnapshots } from './region-snapshots';

/**
 * PNG snapshots of selected regions, in the extension's storage, capped by
 * `vscodeEmbedPdf.regionImageCache.maxSizeMB`. Each region is saved as soon
 * as it is selected, so its file exists before anything is copied.
 */
export const pdfRegionsPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const context = scope.get('context');
    const panels = scope.get('panels');
    const images = new RegionImages(
      vscode.Uri.joinPath(context.storageUri ?? context.globalStorageUri, 'regions').fsPath,
      // Read at every save, so a changed setting applies without a reload.
      () => regionCacheBytes(vscode.workspace.getConfiguration('vscodeEmbedPdf').get('regionImageCache.maxSizeMB')),
    );
    const snapshots = new RegionSnapshots(images);
    const watched = new Map<PdfPanel, vscode.Disposable>();
    const watch = (panel: PdfPanel): void => {
      const forget = (): void => {
        watched.get(panel)?.dispose();
        watched.delete(panel);
      };
      watched.set(panel, vscode.Disposable.from(
        panel.onDidChangeSelection(snapshot => void snapshots.save(panel, snapshot)),
        panel.webviewPanel.onDidDispose(forget),
      ));
    };
    for (const panel of panels.all) watch(panel);
    scope.acquire(panels.onDidOpen(watch), 'listener');
    scope.acquire(new vscode.Disposable(() => {
      for (const subscription of watched.values()) subscription.dispose();
      watched.clear();
    }), 'panel listeners');
    scope.provide('regions', snapshots);
  },
};
