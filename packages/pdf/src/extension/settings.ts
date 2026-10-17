import * as vscode from "vscode";
import { type SchemaProperty, writeProblem } from "../shared/setting-schema";
import { settingTarget } from "../shared/settings-target";

/** What PDF plugins need to know about the running extension. */
export interface ExtensionIdentity {
  readonly id: string;
  readonly packageJSON: unknown;
}

/**
 * PDF Workshop's settings: what the extension contributes, and writes under
 * the key the Settings editor uses (`pdfWorkshop.view.smoothScrolling`, …):
 * in the workspace if it is set there, else in the user settings. Commands
 * keep no state of their own, so the Settings editor and the commands agree.
 */
export class PdfSettings {
  constructor(private readonly extension: ExtensionIdentity) {}

  /** The Settings editor's filter for this extension's settings. */
  get searchFilter(): string {
    return `@ext:${this.extension.id}`;
  }

  /** Every setting the extension contributes, by key, across its sections. */
  properties(): Record<string, SchemaProperty> {
    const manifest = this.extension.packageJSON as
      { contributes?: { configuration?: unknown } } | undefined;
    const configuration = manifest?.contributes?.configuration;
    const sections = (
      Array.isArray(configuration)
        ? configuration
        : configuration
          ? [configuration]
          : []
    ) as { properties?: Record<string, SchemaProperty> }[];
    return Object.assign(
      {},
      ...sections.map((section) => section.properties ?? {}),
    ) as Record<string, SchemaProperty>;
  }

  /**
   * Nothing is taken on trust: the key must be one this extension contributes
   * and the value must fit its schema (type, enum, minimum, maximum), or this
   * throws and nothing is written. The target is chosen from the setting as
   * it is now, right before the write.
   */
  async update(key: string, value: unknown): Promise<void> {
    const problem = writeProblem(this.properties(), key, value);
    if (problem) {
      throw new Error(problem);
    }
    const config = vscode.workspace.getConfiguration();
    const target =
      settingTarget(config.inspect(key)) === "workspace"
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await config.update(key, value, target);
  }
}
