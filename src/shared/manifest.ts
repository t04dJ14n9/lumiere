export interface Manifest {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "core" | "feature";
  readonly defaultEnabled: boolean;
  readonly surfaces: readonly ("host" | "webview")[];
  readonly contributes?: {
    commands?: readonly {
      id: string;
      title: string;
      editorCommand?: string;
      key?: string;
      mac?: string;
    }[];
  };
}
export function defineManifest<T extends Manifest>(manifest: T): T {
  return Object.freeze(manifest);
}
