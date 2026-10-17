import * as vscode from "vscode";
import {
  SETTING_PREFIX,
  type SchemaProperty,
  writeProblem,
} from "../shared/setting-schema";
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

  /** The Settings editor's filter for the PDF settings (the extension has Markdown ones too). */
  get searchFilter(): string {
    return `@ext:${this.extension.id} ${SETTING_PREFIX}`;
  }

  /**
   * Every PDF setting the extension contributes, by key, across its sections
   * (the Markdown settings beside them are not the PDF commands' to show or
   * change).
   */
  properties(): Record<string, SchemaProperty> {
    const manifest = this.extension.packageJSON as
      { contributes?: { configuration?: unknown } } | undefined;
    const configuration = manifest?.contributes?.configuration;
    // A manifest lists one section or an array of them.
    const sections = (
      configuration === undefined ? [] : [configuration].flat()
    ) as { properties?: Record<string, SchemaProperty> }[];
    return Object.fromEntries(
      sections
        .flatMap((section) => Object.entries(section.properties ?? {}))
        .filter(([key]) => key.startsWith(SETTING_PREFIX)),
    );
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
