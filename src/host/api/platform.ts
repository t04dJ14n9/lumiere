import type { Uri } from "vscode";
import type { ConfigurationScope, OpenOptions } from "./types";
export interface ApiPlatform {
  uri(value: string): Uri;
  open(uri: Uri, options: OpenOptions): Promise<void>;
  installed(id: string): boolean;
  external(resource?: Uri): Readonly<Record<string, boolean>>;
  write(
    id: string,
    enabled: boolean | undefined,
    scope: ConfigurationScope,
    external: boolean,
  ): Promise<void>;
  settings(resource?: Uri): Promise<void>;
}
