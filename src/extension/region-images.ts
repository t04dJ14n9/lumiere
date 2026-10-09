import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RegionSelection } from '../shared/selection';

/** Keep this many snapshots; older ones are deleted. */
const KEEP = 20;
const PNG_DATA_URL = 'data:image/png;base64,';

/**
 * PNG snapshots of selected regions, saved as files so an agent can open
 * them (and VS Code's chat can attach them). They live in the extension's
 * storage, not the workspace, and only the latest few are kept.
 */
export class RegionImages {
  constructor(private readonly folder: vscode.Uri) {}

  /** Save a region's snapshot (a PNG data URL) and return its file. */
  async save(pdf: vscode.Uri, region: RegionSelection, image: string): Promise<vscode.Uri> {
    const bytes = Buffer.from(image.slice(PNG_DATA_URL.length), 'base64');
    const name = `${path.basename(pdf.path, '.pdf')}-p${region.page}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.png`;
    const file = vscode.Uri.joinPath(this.folder, name);
    await vscode.workspace.fs.createDirectory(this.folder);
    await vscode.workspace.fs.writeFile(file, bytes);
    await this.prune(name);
    return file;
  }

  private async prune(keep: string): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(this.folder);
    const images = await Promise.all(entries
      .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.png') && name !== keep)
      .map(async ([name]) => {
        const file = vscode.Uri.joinPath(this.folder, name);
        return { file, mtime: (await vscode.workspace.fs.stat(file)).mtime };
      }));
    images.sort((a, b) => b.mtime - a.mtime);
    await Promise.all(images.slice(KEEP - 1).map(({ file }) => vscode.workspace.fs.delete(file).then(undefined, () => undefined)));
  }
}
