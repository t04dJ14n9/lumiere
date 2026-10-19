import * as vscode from "vscode";
import { EffectiveConfiguration } from "./configuration";

export function createConfiguration(): EffectiveConfiguration {
  const scoped = (resource?: string) =>
    vscode.workspace.getConfiguration(
      "lumiere.markdown",
      resource
        ? { uri: vscode.Uri.parse(resource), languageId: "markdown" }
        : undefined,
    );
  return new EffectiveConfiguration({
    get: (key, resource) => scoped(resource).get(key),
    inspect: (key, resource) => scoped(resource).inspect(key),
    onDidChange(listener) {
      const subscription = vscode.workspace.onDidChangeConfiguration(listener);
      return () => subscription.dispose();
    },
  });
}
