/**
 * What a PDF plugin declares about itself for people, docs and tests: its
 * name and the extension points it uses. What it injects and provides is on
 * its plugin definition.
 */

/**
 * What a plugin brings to the editor. Capabilities describe the extension
 * points a plugin uses, not how it is built; tests and docs read them (for
 * example, every plugin with `localServer` must be off by default).
 */
export type Capability =
  /** Registers a custom editor. */
  | 'customEditor'
  /** Opens documents as bytes (read-only binary files), not as text. */
  | 'binaryDocument'
  /** Reports a selection other plugins can read. */
  | 'selectionProvider'
  /** Can open a document at a location (a page and box). */
  | 'navigationTarget'
  /** Contributes commands. */
  | 'commands'
  /** Contributes a tree view. */
  | 'treeView'
  /** Contributes status bar entries. */
  | 'statusBar'
  /** Writes files in the extension's storage. */
  | 'storage'
  /** Hands selections to agents. */
  | 'agentHandoff'
  /** Opens a local network server; must be opt-in. */
  | 'localServer';

export interface PluginManifest {
  /** Stable id, in camelCase: `pdf`, `pdfToolbar`, `agentBridge`. */
  readonly id: string;
  readonly title: string;
  readonly capabilities: readonly Capability[];
}

export function defineManifest<const M extends PluginManifest>(manifest: M): M {
  return Object.freeze(manifest);
}
