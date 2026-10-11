import type { Uri } from "vscode";
import type { ConfigurationScope, OpenOptions } from "./types";
export interface ApiPlatform {
  uri(value: string): Uri;
  joinPath(base: Uri, path: string): Uri;
  assertContained(root: Uri, target: Uri): Promise<void>;
  open(uri: Uri, options: OpenOptions): Promise<void>;
  installed(id: string): boolean;
  external(resource?: Uri): Readonly<Record<string, boolean>>;
  write(
    id: string,
    enabled: boolean | undefined,
    scope: ConfigurationScope,
    external: boolean,
  ): Promise<void>;
  /** Settings filtered to plugin switches, or to `query` (a setting ID). */
  settings(resource?: Uri, query?: string): Promise<void>;
}
