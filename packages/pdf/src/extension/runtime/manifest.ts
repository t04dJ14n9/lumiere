/**
 * What a plugin declares about itself. The runtime orders and gates plugins
 * from these fields alone, so no plugin needs its own detection logic.
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

export interface PluginManifest<Service extends string = string> {
  /** Stable id, in camelCase: `pdf`, `pdfToolbar`, `agentBridge`. */
  readonly id: string;
  readonly title: string;
  readonly capabilities: readonly Capability[];
  /** Plugins that must be active first; this plugin stops before them. */
  readonly requires: readonly string[];
  /** Plugins used when present: ordered before this one, never required. */
  readonly optional?: readonly string[];
  /** Services this plugin publishes on commit. */
  readonly provides?: readonly Service[];
}

export function defineManifest<const M extends PluginManifest>(manifest: M): M {
  return Object.freeze(manifest);
}
