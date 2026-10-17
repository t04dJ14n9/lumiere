import * as vscode from 'vscode';
import type { PdfPanel } from '../pdf/panel';
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import manifest from './manifest';
import { RegionImages, regionCacheBytes } from './region-images';
import { RegionSnapshots } from './region-snapshots';

/**
 * PNG snapshots of selected regions, in the extension's storage, capped by
 * `pdfWorkshop.regionImageCache.maxSizeMB`. Each region is saved as soon
 * as it is selected, so its file exists before anything is copied.
 */
export const pdfRegionsPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfPanels", "extensionContext"] },
  provides: ["regionSnapshots"],
  apply(ctx) {
    const context = ctx.extensionContext;
    const panels = ctx.pdfPanels;
    const images = new RegionImages(
      vscode.Uri.joinPath(context.storageUri ?? context.globalStorageUri, 'regions').fsPath,
      // Read at every save, so a changed setting applies without a reload.
      () => regionCacheBytes(vscode.workspace.getConfiguration('pdfWorkshop').get('regionImageCache.maxSizeMB')),
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
    ctx.own(panels.onDidOpen(watch), 'listener');
    ctx.own(new vscode.Disposable(() => {
      for (const subscription of watched.values()) subscription.dispose();
      watched.clear();
    }), 'panel listeners');
    ctx.provide("regionSnapshots", snapshots);
  },
};
